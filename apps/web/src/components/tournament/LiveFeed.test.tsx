import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LiveEvent } from "@/hooks/use-tournament-events";

const { useTournamentEvents } = vi.hoisted(() => ({
  useTournamentEvents: vi.fn<(id: string) => { events: LiveEvent[] }>(),
}));
vi.mock("@/hooks/use-tournament-events", () => ({ useTournamentEvents }));

import { LiveFeed } from "./LiveFeed";

beforeEach(() => {
  useTournamentEvents.mockReturnValue({ events: [] });
});

describe("LiveFeed", () => {
  it("renders a live region with the LIVE badge and empty placeholder", () => {
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/live activity/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for on-chain activity/i)).toBeInTheDocument();
  });

  it("renders registration and finalisation rows with human-readable gloss", () => {
    useTournamentEvents.mockReturnValue({
      events: [
        {
          type: "REGISTERED",
          txHash: "tx1",
          data: { player: "GABCDEFGHIJKLMNOP", poolAfter: "20000000" },
        },
        {
          type: "FINALIZED",
          txHash: "tx2",
          data: { first: "GA", second: "GB", third: "GC", amounts: ["12", "6", "2"] },
        },
      ],
    });
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByText(/joined/i)).toBeInTheDocument();
    expect(screen.getByText(/payouts sent/i)).toBeInTheDocument();
  });

  it("glosses cancellation claims and a completed refund claim", () => {
    useTournamentEvents.mockReturnValue({
      events: [
        { type: "CANCELLED", txHash: "tx3", data: { claimableCount: 4 } },
        { type: "REFUND_CLAIMED", txHash: "tx4", data: { player: "GPLAYER", amount: "10" } },
      ],
    });
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByText(/refunds available to claim/i)).toBeInTheDocument();
    expect(screen.getByText(/claimed 10/i)).toBeInTheDocument();
  });
});
