import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP"),
  signAndSubmit: vi.fn(async () => ({ txHash: "TX" })),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

import { JoinCard } from "./JoinCard";
import { ensureWallet, signAndSubmit } from "@/lib/wallet";
import { useRouter } from "next/navigation";

const mockedEnsureWallet = ensureWallet as ReturnType<typeof vi.fn>;
const mockedSignAndSubmit = signAndSubmit as ReturnType<typeof vi.fn>;
const mockedUseRouter = useRouter as ReturnType<typeof vi.fn>;

const baseProps = {
  tournamentId: "t_1",
  contractId: "CONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTAB",
  entryFee: "10000000",
  joinUrl: "https://ggg.quest/tournaments/t_1",
  passphrase: "P",
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

  it("hides the full URL until the user explicitly copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<JoinCard {...baseProps} />);

    expect(screen.queryByText(baseProps.joinUrl)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(baseProps.joinUrl));
  });

  it("shows an inline error when copying the link fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard unavailable"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<JoinCard {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy tournament link");
  });

  it("QR tile has accessible aria-label", () => {
    render(<JoinCard {...baseProps} />);
    expect(screen.getByRole("img", { name: /tournament join qr/i })).toBeInTheDocument();
  });

  it("shows Connect Wallet button initially and Join Tournament is disabled", () => {
    render(<JoinCard {...baseProps} />);
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join tournament/i })).toBeDisabled();
  });

  it("shows truncated address chip after wallet connected", async () => {
    render(<JoinCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    // GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP → slice(0,6)=GPLAYE, slice(-5)=AYERP
    await waitFor(() => expect(screen.getByText(/GPLAYE…AYERP/)).toBeInTheDocument());
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
});
