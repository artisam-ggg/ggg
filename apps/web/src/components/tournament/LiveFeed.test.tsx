import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LiveEvent } from "@/hooks/use-tournament-events";

const { useTournamentEventContext } = vi.hoisted(() => ({
  useTournamentEventContext: vi.fn<() => { events: LiveEvent[] }>(),
}));
vi.mock("./TournamentEventsProvider", () => ({ useTournamentEventContext }));

import { LiveFeed } from "./LiveFeed";

beforeEach(() => {
  useTournamentEventContext.mockReturnValue({ events: [] });
});

describe("LiveFeed", () => {
  it("renders a live region with the LIVE badge and empty placeholder", () => {
    render(<LiveFeed />);
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/live activity/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for on-chain activity/i)).toBeInTheDocument();
  });

  it("renders registration and finalisation rows with human-readable gloss", () => {
    useTournamentEventContext.mockReturnValue({
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
    render(<LiveFeed />);
    expect(screen.getByText(/joined/i)).toBeInTheDocument();
    expect(screen.getByText(/payouts sent/i)).toBeInTheDocument();
  });

  it("glosses cancellation claims and a completed refund claim", () => {
    useTournamentEventContext.mockReturnValue({
      events: [
        { type: "CANCELLED", txHash: "tx3", data: { claimableCount: 4 } },
        {
          type: "REFUND_CLAIMED",
          txHash: "tx4",
          data: { player: "GPLAYER", amount: "10000000" },
        },
      ],
    });
    render(<LiveFeed />);
    expect(screen.getByText(/refunds available to claim/i)).toBeInTheDocument();
    expect(screen.getByText(/claimed 1\.0000000/i)).toBeInTheDocument();
  });
});
