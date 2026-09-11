import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Valid Stellar public keys (56 chars, real base32-encoded Ed25519)
const MOCK_ORGANIZER = "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB";
const REF = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

// Mock wallet module BEFORE importing the component
vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => MOCK_ORGANIZER),
  signAndSubmit: vi.fn(async () => ({ txHash: "TX123", contractId: "C1", status: "ACTIVE" })),
  SubmissionError: class SubmissionError extends Error {
    details: { code?: string; txHash?: string; retryable?: boolean };

    constructor(message: string, details: { code?: string; txHash?: string; retryable?: boolean }) {
      super(message);
      this.name = "SubmissionError";
      this.details = details;
    }
  },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { CreateTournamentForm } from "./CreateTournamentForm";
import { ensureWallet, signAndSubmit, SubmissionError } from "@/lib/wallet";

function fillSettlementDeadline() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  fireEvent.change(screen.getByLabelText(/settlement deadline/i), {
    target: { value: tomorrow },
  });
}

describe("CreateTournamentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ensureWallet as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ORGANIZER);
    (signAndSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({
      txHash: "TX123",
      contractId: "C1",
      status: "ACTIVE",
    });
    push.mockReset();
  });

  it("renders all required fields", () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    expect(screen.getByLabelText(/tournament name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/game title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/entry fee/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/referee/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/settlement deadline/i)).toBeInTheDocument();
  });

  it("shows bps summary for default 60/30/10 split", () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    expect(screen.getByText(/6000 \/ 3000 \/ 1000 bps/i)).toBeInTheDocument();
  });

  it("shows split-sum error when percentages do not sum to 100", () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    // Change 1st to 50% — now sum = 50+30+10 = 90
    fireEvent.change(screen.getByLabelText(/1st %/i), { target: { value: "50" } });
    expect(screen.getByText(/must sum to 100/i)).toBeInTheDocument();
  });

  it("renders an invalid referee wallet error beside the input with accessible feedback", async () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: "1" } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    const input = screen.getByLabelText(/referee wallet address/i);
    const feedback = await screen.findByText(/invalid stellar public key/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", feedback.id);
    expect(feedback).toHaveAttribute("role", "alert");
  });

  it("shows referee and other validation errors together", async () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/settlement deadline/i), {
      target: { value: new Date(Date.now() + 91 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16) },
    });

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    expect(await screen.findByText(/invalid stellar public key/i)).toBeInTheDocument();
    expect(await screen.findByText(/within 90 days/i)).toBeInTheDocument();
  });

  it("clears split-sum error when percentages sum to 100 again", () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    // Break the sum
    fireEvent.change(screen.getByLabelText(/1st %/i), { target: { value: "50" } });
    expect(screen.getByText(/must sum to 100/i)).toBeInTheDocument();
    // Fix it
    fireEvent.change(screen.getByLabelText(/2nd %/i), { target: { value: "40" } });
    expect(screen.queryByText(/must sum to 100/i)).not.toBeInTheDocument();
  });

  it("deploy button is disabled without a connected wallet", () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    const btn = screen.getByRole("button", { name: /deploy soroban contract/i });
    expect(btn).toBeDisabled();
  });

  it("shows truncated wallet address chip after connecting", async () => {
    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    // WalletButton renders slice(0,6)…slice(-5)
    const prefix = MOCK_ORGANIZER.slice(0, 6);
    const suffix = MOCK_ORGANIZER.slice(-5);
    // Text is split across nodes, use regex to find text with both parts
    await waitFor(() => {
      const el = screen.getByText(new RegExp(prefix));
      expect(el).toBeInTheDocument();
    });
    await waitFor(() => {
      const el = screen.getByText(new RegExp(suffix));
      expect(el).toBeInTheDocument();
    });
  });

  it("happy path: POSTs create → signAndSubmit → redirects", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { tournamentId: "t_1", unsignedXdr: "XDR_UNSIGNED", network: "testnet" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "World Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    // Connect wallet
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalledWith("P"));

    // Submit the form
    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    // fetch called with /api/tournaments
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/tournaments",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "content-type": "application/json" }),
        }),
      );
    });

    // Verify the request body contains correct data
    const callArgs = mockFetch.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && args[0] === "/api/tournaments",
    );
    expect(callArgs).toBeDefined();
    const body = JSON.parse((callArgs![1] as RequestInit).body as string);
    // entryFee "1.5" XLM → 15000000 stroops
    expect(body.entryFee).toBe("15000000");
    expect(body.name).toBe("World Cup");
    expect(body.gameTitle).toBe("SF6");
    expect(body.organizerAddress).toBe(MOCK_ORGANIZER);
    expect(body.refereeAddress).toBe(REF);
    expect(body.settlementDeadline).toBeGreaterThan(Math.floor(Date.now() / 1000));
    // default splits 60/30/10 → bps [6000,3000,1000]
    expect(body.distributionBps).toEqual([6000, 3000, 1000]);

    // signAndSubmit called with correct args
    await waitFor(() =>
      expect(signAndSubmit).toHaveBeenCalledWith(
        "XDR_UNSIGNED",
        "deploy",
        "/api/tournaments/t_1/submit",
        "P",
      ),
    );

    // Redirect on success
    await waitFor(() => expect(push).toHaveBeenCalledWith("/tournaments/t_1"));

    vi.unstubAllGlobals();
  });

  it("preserves a server error message even when it matches the former parser sentinel", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "INVALID_REQUEST", message: "Invalid API response" },
        }),
        {
          status: 422,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid API response"),
    );
    expect(push).not.toHaveBeenCalled();
    expect(signAndSubmit).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("shows error and does NOT redirect when signAndSubmit fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { tournamentId: "t_fail", unsignedXdr: "XDR", network: "testnet" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);
    (signAndSubmit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("User rejected signing"),
    );

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("User rejected signing"),
    );
    expect(push).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("shows a structured on-chain failure and transaction explorer link", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { tournamentId: "t_failed", unsignedXdr: "XDR", network: "testnet" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);
    (signAndSubmit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new SubmissionError("Transaction failed on-chain", {
        code: "TX_FAILED",
        txHash: "TX_FAIL",
        retryable: false,
      }),
    );

    render(<CreateTournamentForm expectedPassphrase="Test SDF Network ; September 2015" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Transaction failed on-chain"),
    );
    expect(screen.getByRole("link", { name: /view transaction/i })).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/testnet/tx/TX_FAIL",
    );
    expect(push).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("cover image upload: sends the file to the server and includes coverImageKey in create body", async () => {
    const mockFetch = vi
      .fn()
      // server upload
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { key: "covers/123e4567-e89b-12d3-a456-426614174000.png" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      // POST /api/tournaments
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { tournamentId: "t_img", unsignedXdr: "XDR", network: "testnet" },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    // Upload a cover image
    const file = new File(["img bytes"], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/cover image/i), { target: { files: [file] } });

    // Wait for server upload to complete.
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/uploads",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // Connect wallet and submit
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    // Verify coverImageKey is included in the create body
    await waitFor(() => {
      const tournamentCall = mockFetch.mock.calls.find(
        (args: unknown[]) => typeof args[0] === "string" && args[0] === "/api/tournaments",
      );
      expect(tournamentCall).toBeDefined();
      const body = JSON.parse((tournamentCall![1] as RequestInit).body as string);
      expect(body.coverImageKey).toBe("covers/123e4567-e89b-12d3-a456-426614174000.png");
    });

    vi.unstubAllGlobals();
  });

  it("modal is visible during the deploy flow", async () => {
    let resolveSign: (value: unknown) => void;
    const signPromise = new Promise((res) => {
      resolveSign = res;
    });
    (signAndSubmit as ReturnType<typeof vi.fn>).mockReturnValueOnce(signPromise);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { tournamentId: "t_modal", unsignedXdr: "XDR", network: "testnet" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    // Modal should show (signing or submitting phase)
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Resolve signing to unblock
    resolveSign!({ txHash: "TX", contractId: "C1", status: "ACTIVE" });
    await waitFor(() => expect(push).toHaveBeenCalled());

    vi.unstubAllGlobals();
  });

  it("entryFee conversion: 1 XLM → 10000000 stroops", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { tournamentId: "t_fee", unsignedXdr: "XDR", network: "testnet" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        (args: unknown[]) => typeof args[0] === "string" && args[0] === "/api/tournaments",
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.entryFee).toBe("10000000");
    });

    vi.unstubAllGlobals();
  });

  it("entryFee conversion: 0.5 XLM → 5000000 stroops", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { tournamentId: "t_half", unsignedXdr: "XDR", network: "testnet" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        (args: unknown[]) => typeof args[0] === "string" && args[0] === "/api/tournaments",
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.entryFee).toBe("5000000");
    });

    vi.unstubAllGlobals();
  });

  // ---------- entry-fee validation tests ----------

  it.each([
    [".", "entry fee must be a positive number"],
    ["abc", "entry fee must be a positive number"],
    ["-1.5", "entry fee must be a positive number"],
    ["", "entry fee is required"],
  ])(
    "invalid entry fee %j → shows field error, makes NO fetch call, phase stays idle",
    async (feeValue, expectedErrorPattern) => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      render(<CreateTournamentForm expectedPassphrase="P" />);
      fireEvent.change(screen.getByLabelText(/tournament name/i), {
        target: { value: "Cup" },
      });
      fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
      fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: feeValue } });
      fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
      fillSettlementDeadline();

      // Connect wallet so the submit button is enabled
      fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
      await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

      fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

      // Field-level error should appear
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(new RegExp(expectedErrorPattern, "i")),
      );

      // No network call made, modal NOT opened
      expect(mockFetch).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      vi.unstubAllGlobals();
    },
  );

  it("entry fee with 8 decimals (1.12345678) → rejected, no network call", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1.12345678" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/at most 7 decimal places/i),
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("valid entry fee 1.1234567 (exactly 7 decimals) → accepted and sent as correct stroops", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { tournamentId: "t_7dec", unsignedXdr: "XDR", network: "testnet" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    // 1.1234567 XLM → 11234567 stroops
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1.1234567" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        (args: unknown[]) => typeof args[0] === "string" && args[0] === "/api/tournaments",
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.entryFee).toBe("11234567");
    });

    vi.unstubAllGlobals();
  });

  it("a failed optional cover upload can be removed so deployment is re-enabled", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: { message: "Invalid file type." } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());

    const file = new File(["img bytes"], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/cover image/i), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid file type."));
    expect(screen.queryByText(/Uploaded:/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deploy soroban contract/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /remove cover image/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /deploy soroban contract/i })).toBeEnabled(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});

describe("stale authenticated form", () => {
  it("shows a login message instead of parsing a non-JSON 401 response", async () => {
    vi.clearAllMocks();
    (ensureWallet as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ORGANIZER);
    (signAndSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({ txHash: "TX123" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("METHOD NOT ALLOWED", { status: 401 }));
    vi.stubGlobal("fetch", mockFetch);
    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your session has ended. Please log in again.",
      ),
    );
    expect(signAndSubmit).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
  ] as const)("handles a structured %i response without submitting", async (status, code) => {
    vi.clearAllMocks();
    (ensureWallet as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ORGANIZER);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, error: { code, message: "Authentication required" } }),
          { status, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(<CreateTournamentForm expectedPassphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fillSettlementDeadline();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(ensureWallet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your session has ended. Please log in again.",
      ),
    );
    expect(signAndSubmit).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
