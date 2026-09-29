import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP"),
  signAndSubmit: vi.fn(async () => ({ txHash: "TX" })),
  SubmissionError: class SubmissionError extends Error {
    constructor(
      message: string,
      readonly details: { code: string; txHash?: string; retryable?: boolean },
    ) {
      super(message);
      this.name = "SubmissionError";
    }
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

import { JoinCard } from "./JoinCard";
import { ensureWallet, signAndSubmit, SubmissionError } from "@/lib/wallet";
import { useRouter } from "next/navigation";

const mockedEnsureWallet = ensureWallet as ReturnType<typeof vi.fn>;
const mockedSignAndSubmit = signAndSubmit as ReturnType<typeof vi.fn>;
const mockedUseRouter = useRouter as ReturnType<typeof vi.fn>;

const baseProps = {
  tournamentId: "t_1",
  contractId: "CONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTAB",
  entryFee: "10000000",
  asset: "XLM" as const,
  joinUrl: "https://ggg.quest/tournaments/t_1",
  passphrase: "P",
  confirmedParticipantAddresses: [] as string[],
  settlementDeadline: 1_800_000_000,
};

describe("JoinCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnsureWallet.mockResolvedValue(
      "GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP",
    );
    mockedSignAndSubmit.mockResolvedValue({ txHash: "TX" });
    mockedUseRouter.mockReturnValue({ refresh: vi.fn() });
  });

  it("encodes the tournament join URL instead of a direct payment URI", () => {
    render(<JoinCard {...baseProps} />);
    expect(screen.getByTestId("qr")).toHaveAttribute("data-value", baseProps.joinUrl);
    expect(screen.getByRole("link", { name: /open tournament join page/i })).toHaveAttribute(
      "href",
      baseProps.joinUrl,
    );
  });

  it("shows a tournament identifier without rendering the full URL", () => {
    render(<JoinCard {...baseProps} tournamentId="tournament-1234567890" />);

    expect(screen.queryByText(baseProps.joinUrl)).not.toBeInTheDocument();
    expect(screen.getByText("Tournament: tourna…567890")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy.*link/i })).not.toBeInTheDocument();
  });

  it("QR tile has accessible aria-label", () => {
    render(<JoinCard {...baseProps} />);
    expect(screen.getByRole("img", { name: /tournament join qr/i })).toBeInTheDocument();
  });

  it("shows Connect Wallet button initially and Join Tournament is disabled", () => {
    render(<JoinCard {...baseProps} />);
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join tournament/i })).toBeDisabled();
    expect(screen.getByText(/connect freighter to enable/i)).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/joining transfers the displayed entry fee/i)).toHaveTextContent(
      /cannot access your private key or sign for you/i,
    );
  });

  it("offers public player guidance before wallet authorization or an app login", () => {
    render(<JoinCard {...baseProps} />);

    expect(screen.getByRole("button", { name: "Open player guidelines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in|log in/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open player guidelines" }));
    expect(screen.getByRole("dialog", { name: "Join a tournament" })).toBeInTheDocument();
    expect(screen.getByText(/public tournament page/i)).toBeInTheDocument();
    expect(screen.getByText(/approve the join transaction/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read the full guide/i })).toHaveAttribute(
      "href",
      "https://goodgameguild.gitbook.io/ggg/role-guides/player-guide",
    );
  });

  it("shows truncated address chip after wallet connected", async () => {
    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    // GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP → slice(0,6)=GPLAYE, slice(-5)=AYERP
    await waitFor(() => expect(screen.getByText(/GPLAYE…AYERP/)).toBeInTheDocument());
  });

  it("disables Join when the connected wallet already joined", async () => {
    render(
      <JoinCard
        {...baseProps}
        confirmedParticipantAddresses={["GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(await screen.findByText(/this wallet has already joined/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join tournament/i })).toBeDisabled();
  });

  it("builds + signs + submits join, then refreshes on success", async () => {
    const mockRefresh = vi.fn();
    mockedUseRouter.mockReturnValue({ refresh: mockRefresh });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: true, data: { unsignedXdr: "JU", network: "testnet" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));

    await waitFor(() =>
      expect(mockedSignAndSubmit).toHaveBeenCalledWith(
        "JU",
        "join",
        "/api/tournaments/t_1/submit",
        "P",
      ),
    );

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: /registration confirmed/i })).toBeInTheDocument();
    expect(
      screen.getByText(/held by this tournament's soroban escrow, not by ggg/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view public tournament/i })).toHaveAttribute(
      "href",
      baseProps.joinUrl,
    );
    expect(screen.getByRole("link", { name: /view transaction receipt/i })).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/testnet/tx/TX",
    );
    expect(screen.getByRole("link", { name: /view my tournaments/i })).toHaveAttribute(
      "href",
      "/participations",
    );
  });

  it("POST /join sends { playerAddress } in the body", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, data: { unsignedXdr: "JU", network: "testnet" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/tournaments/t_1/join");
    expect(JSON.parse(init.body as string)).toEqual({
      playerAddress: "GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP",
    });
  });

  it("shows error and no refresh when { ok: false } from /join", async () => {
    const mockRefresh = vi.fn();
    mockedUseRouter.mockReturnValue({ refresh: mockRefresh });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: "Tournament is full" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Tournament is full"));
    expect(mockedSignAndSubmit).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("renders the duplicate-participant message from the API error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: "CONFLICT",
                message: "You are already a participant in this tournament.",
              },
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "You are already a participant in this tournament.",
      ),
    );
    expect(mockedSignAndSubmit).not.toHaveBeenCalled();
  });

  it("Join button is disabled while pending (no double-click)", async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));

    // While fetch is in flight, button should be disabled
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join tournament/i })).toBeDisabled(),
    );

    // Resolve to clean up
    resolveFetch(
      new Response(JSON.stringify({ ok: false, error: "cancelled" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("keeps a retryable submitted join disabled while confirmation is uncertain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: true, data: { unsignedXdr: "JU", network: "testnet" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    mockedSignAndSubmit.mockRejectedValueOnce(
      new SubmissionError("Confirmation timed out", {
        code: "TX_TIMEOUT",
        txHash: "TX_PENDING",
        retryable: true,
      }),
    );

    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));

    expect(await screen.findByText(/submitted and awaiting confirmation/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view submitted transaction/i })).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/testnet/tx/TX_PENDING",
    );
    expect(screen.getByRole("button", { name: /join tournament/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));
    expect(mockedSignAndSubmit).toHaveBeenCalledOnce();
  });

  it("shows a failed transaction receipt without marking registration confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ok: true, data: { unsignedXdr: "JU", network: "testnet" } }),
      ),
    );
    mockedSignAndSubmit.mockRejectedValueOnce(
      new SubmissionError("Transaction failed on-chain", {
        code: "TX_FAILED",
        txHash: "TX_FAILED",
        retryable: false,
      }),
    );

    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/transaction failed on-chain/i);
    expect(screen.getByRole("link", { name: /view failed transaction/i })).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/testnet/tx/TX_FAILED",
    );
    expect(
      screen.queryByRole("heading", { name: /registration confirmed/i }),
    ).not.toBeInTheDocument();
  });
});
