import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock factories so vi.mock() hoisting can reference them
// ---------------------------------------------------------------------------
const { mockGetTournamentDetail, mockGetCurrentUser, mockNotFound } = vi.hoisted(() => ({
  mockGetTournamentDetail: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/services/tournaments", () => ({
  getTournamentDetail: mockGetTournamentDetail,
}));

vi.mock("@/lib/auth-guards", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "https://ggg.quest",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import Page from "./page";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const ACTIVE_TOURNAMENT = {
  id: "t_1",
  name: "Summer Cup",
  gameTitle: "Street Fighter 6",
  status: "ACTIVE" as const,
  asset: "XLM" as const,
  entryFee: "10000000",
  distributionBps: [6000, 3000, 1000] as const,
  contractId: "CONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTAB",
  contractUrl: "https://stellar.expert/c/C1",
  tokenAddr: "CSAC",
  organizerAddr: "GORG",
  organizerId: "user_org_1",
  refereeAddr: "GREF",
  pool: "30000000",
  participants: [
    {
      playerAddr: "GP1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      joinedAt: new Date().toISOString(),
      joinTxHash: "J1",
    },
  ],
  winners: [],
};

const FINISHED_TOURNAMENT = {
  ...ACTIVE_TOURNAMENT,
  id: "t_2",
  name: "Winter Cup",
  status: "FINISHED" as const,
  winners: [
    {
      rank: 1,
      playerAddr: "GP1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      amount: "18000000",
      txHash: "TX1",
      explorerUrl: "https://stellar.expert/t/TX1",
    },
  ],
};

const CANCELLED_TOURNAMENT = {
  ...ACTIVE_TOURNAMENT,
  id: "t_3",
  name: "Cancelled Cup",
  status: "CANCELLED" as const,
  contractId: null,
  refundsClaimable: true,
};

const ORGANIZER_USER = { id: "user_org_1", username: "organizer", role: "ORGANIZER" as const };
const OTHER_USER = { id: "user_other_2", username: "viewer", role: "ORGANIZER" as const };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("/tournaments/[id] — public detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // (a) ACTIVE tournament — header, status, pool, join card, participants
  // -------------------------------------------------------------------------
  describe("ACTIVE tournament", () => {
    it("renders the tournament name as h1", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByRole("heading", { level: 1, name: "Summer Cup" })).toBeInTheDocument();
    });

    it("renders the game title", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByText("Street Fighter 6")).toBeInTheDocument();
    });

    it("renders the StatusChip showing ACTIVE", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    });

    it("renders the PrizePoolCounter with formatted pool amount", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      // pool "30000000" stroops → "3.0000000"
      expect(screen.getByTestId("pool-amount")).toHaveTextContent("3.0000000");
    });

    it("renders the JoinCard (scan to join) when ACTIVE", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByText(/scan to join/i)).toBeInTheDocument();
    });

    it("renders ParticipantList with participant addresses", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      // ParticipantList renders truncated address; the section heading is inside the component
      expect(screen.getByRole("heading", { name: /participants/i })).toBeInTheDocument();
    });

    it("does NOT render WinnersPanel when ACTIVE", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.queryByText(/settlement complete/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // (b) FINISHED tournament — WinnersPanel present, JoinCard absent
  // -------------------------------------------------------------------------
  describe("FINISHED tournament", () => {
    it("renders WinnersPanel (Settlement Complete) when FINISHED with winners", async () => {
      mockGetTournamentDetail.mockResolvedValue(FINISHED_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

      expect(screen.getByText(/settlement complete/i)).toBeInTheDocument();
    });

    it("renders zero-winners placeholder when FINISHED with no winners", async () => {
      mockGetTournamentDetail.mockResolvedValue({
        ...FINISHED_TOURNAMENT,
        winners: [],
      });
      render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

      expect(screen.getByText(/settlement complete/i)).toBeInTheDocument();
      expect(screen.getByText(/no winners recorded for this tournament/i)).toBeInTheDocument();
    });

    it("does NOT render JoinCard when FINISHED", async () => {
      mockGetTournamentDetail.mockResolvedValue(FINISHED_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

      expect(screen.queryByText(/scan to join/i)).not.toBeInTheDocument();
    });

    it("renders the tournament name as h1", async () => {
      mockGetTournamentDetail.mockResolvedValue(FINISHED_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

      expect(screen.getByRole("heading", { level: 1, name: "Winter Cup" })).toBeInTheDocument();
    });

    it("renders FINISHED status chip", async () => {
      mockGetTournamentDetail.mockResolvedValue(FINISHED_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

      expect(screen.getByText("FINISHED")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // (c) Missing id → notFound() called
  // -------------------------------------------------------------------------
  describe("missing tournament", () => {
    it("calls notFound() when getTournamentDetail returns null", async () => {
      mockGetTournamentDetail.mockResolvedValue(null);

      await expect(Page({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );

      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // (d) CancelButton — organiser + ACTIVE sees it; non-organiser doesn't
  // -------------------------------------------------------------------------
  describe("CancelButton visibility", () => {
    it("renders CancelButton for the organiser viewing an ACTIVE tournament", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      mockGetCurrentUser.mockResolvedValue(ORGANIZER_USER);

      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });

    it("does NOT render CancelButton for a non-organiser viewing an ACTIVE tournament", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      mockGetCurrentUser.mockResolvedValue(OTHER_USER);

      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });

    it("does NOT render CancelButton when unauthenticated (null user)", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      mockGetCurrentUser.mockResolvedValue(null);

      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });

    it("does NOT render CancelButton for organiser when tournament is FINISHED", async () => {
      mockGetTournamentDetail.mockResolvedValue(FINISHED_TOURNAMENT);
      mockGetCurrentUser.mockResolvedValue(ORGANIZER_USER);

      render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // (e) CANCELLED tournament — clear cancelled state, no join
  // -------------------------------------------------------------------------
  describe("CANCELLED tournament", () => {
    it("renders CANCELLED status chip", async () => {
      mockGetTournamentDetail.mockResolvedValue(CANCELLED_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_3" }) }));

      expect(screen.getByText("CANCELLED")).toBeInTheDocument();
    });

    it("does NOT render JoinCard when CANCELLED", async () => {
      mockGetTournamentDetail.mockResolvedValue(CANCELLED_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_3" }) }));

      expect(screen.queryByText(/scan to join/i)).not.toBeInTheDocument();
    });

    it("shows a cancelled notice to the user", async () => {
      mockGetTournamentDetail.mockResolvedValue(CANCELLED_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_3" }) }));

      // The page renders a specific notice paragraph with role="alert" for cancelled state.
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/cancelled/i);
    });
  });

  // -------------------------------------------------------------------------
  // (f) A11y — single h1
  // -------------------------------------------------------------------------
  describe("accessibility", () => {
    it("has exactly one h1 heading", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
    });
  });
});
