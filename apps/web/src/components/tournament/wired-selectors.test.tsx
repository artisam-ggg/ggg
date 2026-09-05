import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// QrTile pulls in qrcode.react (heavy SVG); stub it like JoinCard.test does.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));
vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GPLAYER"),
  signAndSubmit: vi.fn(async () => ({ txHash: "TX" })),
}));
vi.mock("next/navigation", () => ({ useRouter: vi.fn(() => ({ refresh: vi.fn() })) }));

import { StatusChip } from "./StatusChip";
import { ParticipantList } from "./ParticipantList";
import { WinnersPanel } from "./WinnersPanel";
import { RefundList } from "./RefundList";
import { QrTile } from "./QrTile";
import { CancelButton } from "./CancelButton";

const addr = (n: number) => `G${String(n).repeat(55)}`.slice(0, 56);

/**
 * Proves the data-testid hooks the Phase 6 E2E specs (#83 demo path, #84
 * cancel→refund) query are actually wired into the rendered DOM — the selector
 * leg that could not be validated without a run. Asserts presence + correct
 * cardinality for each.
 */
describe("E2E wired selectors", () => {
  it("status-chip reflects the tournament status", () => {
    render(<StatusChip status="CANCELLED" />);
    const chip = screen.getByTestId("status-chip");
    expect(chip).toHaveTextContent("CANCELLED");
    expect(chip).toHaveAttribute("data-status", "CANCELLED");
  });

  it("participant-row renders one per joined player", () => {
    render(
      <ParticipantList
        participants={[
          { playerAddr: addr(1), joinedAt: new Date().toISOString() },
          { playerAddr: addr(2), joinedAt: new Date().toISOString() },
          { playerAddr: addr(3), joinedAt: new Date().toISOString() },
        ]}
      />,
    );
    expect(screen.getAllByTestId("participant-row")).toHaveLength(3);
  });

  it("payout-row + explorer-link render one per winner (60/30/10)", () => {
    render(
      <WinnersPanel
        asset="XLM"
        winners={[
          {
            rank: 1,
            playerAddr: addr(1),
            amount: "90000000",
            txHash: "a",
            explorerUrl: "https://stellar.expert/x/a",
          },
          {
            rank: 2,
            playerAddr: addr(2),
            amount: "45000000",
            txHash: "b",
            explorerUrl: "https://stellar.expert/x/b",
          },
          {
            rank: 3,
            playerAddr: addr(3),
            amount: "15000000",
            txHash: "c",
            explorerUrl: "https://stellar.expert/x/c",
          },
        ]}
      />,
    );
    expect(screen.getAllByTestId("payout-row")).toHaveLength(3);
    expect(screen.getAllByTestId("explorer-link")).toHaveLength(3);
  });

  it("refund-row renders one per refunded player, each equal to the entry fee", () => {
    render(
      <RefundList
        asset="XLM"
        entryFee="50000000"
        participants={[
          { playerAddr: addr(1), joinedAt: "" },
          { playerAddr: addr(2), joinedAt: "" },
        ]}
      />,
    );
    const rows = screen.getAllByTestId("refund-row");
    expect(rows).toHaveLength(2);
    // entry fee 50000000 stroops → 5.0000000
    expect(rows[0]).toHaveTextContent("5.0000000 XLM");
  });

  it("join-qr wraps the join QR code", () => {
    render(<QrTile value="https://ggg.quest/tournaments/t_1" />);
    expect(screen.getByTestId("join-qr")).toBeInTheDocument();
  });

  it("cancel-button reveals confirm-cancel after a click", () => {
    render(<CancelButton tournamentId="t1" passphrase="Test SDF Network ; September 2015" />);
    expect(screen.queryByTestId("confirm-cancel")).toBeNull();
    fireEvent.click(screen.getByTestId("cancel-button"));
    expect(screen.getByTestId("confirm-cancel")).toBeInTheDocument();
  });
});
