import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock factories so vi.mock() hoisting can reference them
// ---------------------------------------------------------------------------
const { mockGetTournamentDetail, mockGetCurrentUser, mockNotFound, mockRefresh } = vi.hoisted(
  () => ({
    mockGetTournamentDetail: vi.fn(),
    mockGetCurrentUser: vi.fn(),
    mockRefresh: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("@/server/services/tournaments", () => ({
  getTournamentDetail: mockGetTournamentDetail,
}));

vi.mock("@/lib/auth-guards", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  useRouter: vi.fn(() => ({ refresh: mockRefresh })),
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
  coverImageUrl: null,
  status: "ACTIVE" as const,
  displayStatus: "ACTIVE" as const,
  asset: "XLM" as const,
  entryFee: "10000000",
  distributionBps: [6000, 3000, 1000] as const,
  contractVersion: "CURRENT" as const,
  contractId: "CONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTAB",
  contractUrl: "https://stellar.expert/c/C1",
  tokenAddr: "CSAC",
  organizerAddr: "GORG",
  organizerId: "user_org_1",
  refereeAddr: "GREF",
  pool: "30000000",
  refundClaimedPlayers: [],
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
  displayStatus: "FINISHED" as const,
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
  displayStatus: "CANCELLED" as const,
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

  it.each([
    ["active", ACTIVE_TOURNAMENT],
    ["refund-claimable", { ...ACTIVE_TOURNAMENT, refundsClaimable: true }],
    ["finished", FINISHED_TOURNAMENT],
    ["cancelled", { ...CANCELLED_TOURNAMENT, contractId: ACTIVE_TOURNAMENT.contractId }],
  ])("keeps a copyable tournament link in the header when %s", async (_state, tournament) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mockGetTournamentDetail.mockResolvedValue(tournament);
    render(await Page({ params: Promise.resolve({ id: tournament.id }) }));

    const url = `https://ggg.quest/tournaments/${tournament.id}`;
    expect(screen.queryByText(url)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy tournament link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });

  it("omits the copy action before a tournament has been deployed", async () => {
    mockGetTournamentDetail.mockResolvedValue({
      ...ACTIVE_TOURNAMENT,
      status: "DRAFT",
      displayStatus: "DRAFT",
      contractId: null,
    });
    render(await Page({ params: Promise.resolve({ id: "t_1" }) }));
    expect(screen.queryByRole("button", { name: "Copy tournament link" })).not.toBeInTheDocument();
  });

  it("links Back to the tournament list after settlement", async () => {
    mockGetTournamentDetail.mockResolvedValue(FINISHED_TOURNAMENT);
    render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/tournaments");
  });

  // -------------------------------------------------------------------------
  // (a) ACTIVE tournament — header, status, pool, join card, participants
  // -------------------------------------------------------------------------
  describe("ACTIVE tournament", () => {
    it("shows an uploaded cover on the public page", async () => {
      mockGetTournamentDetail.mockResolvedValue({
        ...ACTIVE_TOURNAMENT,
        coverImageUrl: "/api/tournaments/t_1/cover",
      });
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(
        screen.getByRole("img", { name: "Summer Cup tournament cover" }).getAttribute("src"),
      ).toMatch(/\/api\/tournaments\/t_1\/cover$/);
    });

    it("keeps the default layout when there is no cover", async () => {
      mockGetTournamentDetail.mockResolvedValue(ACTIVE_TOURNAMENT);
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));
      expect(screen.queryByRole("img", { name: /tournament cover/i })).not.toBeInTheDocument();
    });

    it("hides a cover that fails to load without hiding tournament details", async () => {
      mockGetTournamentDetail.mockResolvedValue({
        ...ACTIVE_TOURNAMENT,
        coverImageUrl: "/api/tournaments/t_1/cover",
      });
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      fireEvent.error(screen.getByRole("img", { name: "Summer Cup tournament cover" }));
      expect(screen.queryByRole("img", { name: /tournament cover/i })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Summer Cup" })).toBeInTheDocument();
    });

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

    it("shows confirmed full-refund completion without another claim action", async () => {
      mockGetTournamentDetail.mockResolvedValue({
        ...ACTIVE_TOURNAMENT,
        displayStatus: "REFUNDED",
        refundsClaimable: true,
        refundClaimedPlayers: [ACTIVE_TOURNAMENT.participants[0]!.playerAddr],
      });
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByText("REFUNDED")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "All registered players have claimed their refunds.",
      );
      expect(screen.queryByRole("button", { name: "Connect Wallet" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Claim Refund" })).not.toBeInTheDocument();
    });

    it("keeps the claim action when equal claim and participant counts contain different wallets", async () => {
      mockGetTournamentDetail.mockResolvedValue({
        ...ACTIVE_TOURNAMENT,
        displayStatus: "REFUNDS_OPEN",
        refundsClaimable: true,
        refundClaimedPlayers: ["GDIFFERENT"],
      });
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).not.toHaveTextContent("All registered players");
    });

    it("hides the claim action when a cancelled tournament has no participants", async () => {
      mockGetTournamentDetail.mockResolvedValue({
        ...ACTIVE_TOURNAMENT,
        status: "CANCELLED",
        displayStatus: "CANCELLED",
        refundsClaimable: true,
        participants: [],
      });
      render(await Page({ params: Promise.resolve({ id: "t_1" }) }));

      expect(screen.getByRole("alert")).toHaveTextContent("This tournament has been cancelled");
      expect(screen.queryByRole("button", { name: "Connect Wallet" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Claim Refund" })).not.toBeInTheDocument();
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

    it("renders a retryable processing state when FINISHED payouts have not synced", async () => {
      mockGetTournamentDetail.mockResolvedValue({
        ...FINISHED_TOURNAMENT,
        winners: [],
      });
      render(await Page({ params: Promise.resolve({ id: "t_2" }) }));

      expect(screen.getByText(/settlement processing/i)).toBeInTheDocument();
      expect(screen.getByText(/winner and payout data is still syncing/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /retry winner sync/i }));
      expect(mockRefresh).toHaveBeenCalledOnce();
      expect(screen.queryByText(/no winners recorded/i)).not.toBeInTheDocument();
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
