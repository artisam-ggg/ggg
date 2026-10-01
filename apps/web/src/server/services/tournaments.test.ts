import { beforeEach, describe, expect, it, vi } from "vitest";

const PLAYER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const OTHER_PLAYER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

vi.mock("@/lib/db", () => ({
  prisma: {
    participant: { findMany: vi.fn() },
    joinSubmission: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/env", () => ({
  env: { STELLAR_NETWORK: "testnet" },
}));

import { prisma } from "@/lib/db";
import { listPendingJoinSubmissions, listPlayerParticipations } from "./tournaments";

const findMany = prisma.participant.findMany as unknown as ReturnType<typeof vi.fn>;
const findPending = prisma.joinSubmission.findMany as unknown as ReturnType<typeof vi.fn>;

function tournament(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t_registered",
    name: "Community Cup",
    gameTitle: "SF6",
    asset: "XLM",
    entryFee: 10_000_000n,
    status: "ACTIVE",
    settlementDeadline: new Date("2100-01-01T00:00:00.000Z"),
    deadlineConfirmedAt: new Date("2026-01-01T00:00:00.000Z"),
    participants: [{ playerAddr: PLAYER }],
    payouts: [],
    events: [],
    ...overrides,
  };
}

function participation(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    joinedAt: new Date("2026-09-29T00:00:00.000Z"),
    joinTxHash: `JOIN_${id}`,
    tournament: tournament({ id, ...overrides }),
  };
}

describe("listPlayerParticipations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives registered, payout, refund, and settlement lifecycle states", async () => {
    findMany.mockResolvedValue([
      participation("registered"),
      participation("payout", {
        status: "FINISHED",
        payouts: [{ playerAddr: PLAYER, rank: 1, amount: 25_000_000n, txHash: "PAYOUT_TX" }],
      }),
      participation("refund_available", { status: "CANCELLED" }),
      participation("refunded", {
        status: "CANCELLED",
        events: [{ payload: { player: PLAYER, amount: "10000000" }, txHash: "REFUND_TX" }],
      }),
      participation("payout_ready", { status: "FINISHED" }),
      participation("settled", {
        status: "FINISHED",
        payouts: [
          { playerAddr: OTHER_PLAYER, rank: 1, amount: 25_000_000n, txHash: "OTHER_PAYOUT" },
        ],
      }),
    ]);

    const items = await listPlayerParticipations(PLAYER);

    expect(items.map(({ state }) => state)).toEqual([
      "REGISTERED",
      "PAYOUT_CONFIRMED",
      "REFUND_AVAILABLE",
      "REFUNDED",
      "PAYOUT_READY",
      "SETTLED",
    ]);
    expect(items[1]?.payout).toMatchObject({ rank: 1, amount: "25000000" });
    expect(items[2]?.refundReason).toBe("CANCELLED");
    expect(items[3]?.refund).toMatchObject({ amount: "10000000" });
    expect(items[5]?.payout).toBeNull();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerAddr: PLAYER } }),
    );
  });
});

describe("listPendingJoinSubmissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries and returns pending metadata for only the requested wallet", async () => {
    findPending.mockResolvedValue([{ tournamentId: "t_pending", txHash: "PENDING_TX" }]);

    await expect(listPendingJoinSubmissions(PLAYER)).resolves.toEqual([
      { tournamentId: "t_pending", txHash: "PENDING_TX" },
    ]);
    expect(findPending).toHaveBeenCalledWith({
      where: { playerAddr: PLAYER },
      select: { tournamentId: true, txHash: true },
      orderBy: { submittedAt: "desc" },
    });
  });
});
