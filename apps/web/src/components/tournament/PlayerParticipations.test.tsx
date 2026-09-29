import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const PLAYER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

vi.mock("./WalletButton", () => ({
  WalletButton: ({ onConnected }: { onConnected: (address: string) => void }) => (
    <button type="button" onClick={() => onConnected(PLAYER)}>
      Connect Wallet
    </button>
  ),
}));

import { PlayerParticipations } from "./PlayerParticipations";

const registered = {
  tournamentId: "t_registered",
  name: "Community Cup",
  gameTitle: "SF6",
  asset: "XLM",
  entryFee: "10000000",
  displayStatus: "ACTIVE",
  state: "REGISTERED",
  joinedAt: "2026-09-29T00:00:00.000Z",
  settlementDeadline: "2026-10-10T12:00:00.000Z",
  joinExplorerUrl: "https://stellar.expert/explorer/testnet/tx/JOIN_TX",
  payout: null,
  refund: null,
};

function response(items: unknown[], status = 200) {
  return new Response(JSON.stringify({ ok: true, data: { items } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function connect() {
  fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
}

describe("PlayerParticipations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows public wallet guidance without requiring an app login", () => {
    render(<PlayerParticipations expectedPassphrase="P" />);

    expect(screen.getByRole("heading", { name: /my tournaments/i })).toBeInTheDocument();
    expect(
      screen.getByText(/no app login, private key, signature, or personal profile/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in|log in/i })).not.toBeInTheDocument();
  });

  it("shows a pending state while confirmed participation is loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<PlayerParticipations expectedPassphrase="P" />);

    await connect();

    expect(await screen.findByRole("status")).toHaveTextContent(/loading confirmed participation/i);
  });

  it("shows a failed lookup without inventing participation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            ok: false,
            error: { code: "INTERNAL_ERROR", message: "Status is temporarily unavailable" },
          },
          { status: 503 },
        ),
      ),
    );
    render(<PlayerParticipations expectedPassphrase="P" />);

    await connect();

    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    expect(screen.queryByText(/registration confirmed/i)).not.toBeInTheDocument();
  });

  it("shows a confirmed registration, next deadline, and join receipt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response([registered])),
    );
    render(<PlayerParticipations expectedPassphrase="P" />);

    await connect();

    expect(await screen.findByText("Registration confirmed")).toBeInTheDocument();
    expect(
      screen.getByText(/held by the tournament's soroban escrow, not by ggg/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/next expected deadline/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view transaction receipt/i })).toHaveAttribute(
      "href",
      registered.joinExplorerUrl,
    );
  });

  it("shows a confirmed payout instead of suggesting another claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response([
          {
            ...registered,
            tournamentId: "t_payout",
            displayStatus: "FINISHED",
            state: "PAYOUT_CONFIRMED",
            payout: {
              rank: 1,
              amount: "25000000",
              explorerUrl: "https://stellar.expert/explorer/testnet/tx/PAYOUT_TX",
            },
          },
        ]),
      ),
    );
    render(<PlayerParticipations expectedPassphrase="P" />);

    await connect();

    expect(await screen.findByText("Payout confirmed")).toBeInTheDocument();
    expect(screen.getByText(/rank 1 received 2\.5000000 xlm/i)).toBeInTheDocument();
  });

  it("shows when the connected wallet has a confirmed refund available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response([
          {
            ...registered,
            tournamentId: "t_refund",
            displayStatus: "REFUNDS_OPEN",
            state: "REFUND_AVAILABLE",
          },
        ]),
      ),
    );
    render(<PlayerParticipations expectedPassphrase="P" />);

    await connect();

    expect(await screen.findByText("Refund available")).toBeInTheDocument();
    expect(
      screen.getByText(/allows this wallet to claim its entry fee from the escrow/i),
    ).toBeInTheDocument();
  });

  it("shows an explicit no-participation state for the connected wallet", async () => {
    const fetchMock = vi.fn(async () => response([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlayerParticipations expectedPassphrase="P" />);

    await connect();

    expect(await screen.findByText(/no confirmed tournament participation/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/participations?playerAddress=${PLAYER}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
