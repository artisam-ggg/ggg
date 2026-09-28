import { describe, it, expect, vi, beforeEach } from "vitest";

interface EventRow {
  tournamentId: string;
  type: string;
  ledger: number;
  txHash: string;
  eventId: string | null;
  payload: unknown;
}
const events: EventRow[] = [];
const participants: {
  tournamentId: string;
  playerAddr: string;
  joinTxHash: string;
  joinedAt?: Date;
}[] = [];
const joinSubmissions: {
  txHash: string;
  tournamentId: string;
  playerAddr: string;
  submittedAt: Date;
}[] = [];
const payouts: { rank: number; playerAddr: string; amount: bigint; txHash: string }[] = [];
const tournaments: Record<string, Record<string, unknown>> = {
  t1: { id: "t1", status: "ACTIVE" },
};

const txClient = {
  contractEvent: {
    findUnique: vi.fn(
      async ({ where }: { where: { txHash_eventId?: { txHash: string; eventId: string } } }) =>
        events.find(
          (e) =>
            e.txHash === where.txHash_eventId?.txHash &&
            e.eventId === where.txHash_eventId?.eventId,
        ) ?? null,
    ),
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { tournamentId: string; txHash: string; type: string; eventId: null };
      }) =>
        events.find(
          (event) =>
            event.tournamentId === where.tournamentId &&
            event.txHash === where.txHash &&
            event.type === where.type &&
            event.eventId === where.eventId,
        ) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: EventRow }) => {
      events.push(data);
      return data;
    }),
  },
  participant: {
    upsert: vi.fn(async ({ create }: { create: (typeof participants)[number] }) => {
      participants.push(create);
      return create;
    }),
  },
  joinSubmission: {
    findUnique: vi.fn(async ({ where }: { where: { txHash: string } }) => {
      return joinSubmissions.find((submission) => submission.txHash === where.txHash) ?? null;
    }),
    deleteMany: vi.fn(
      async ({
        where,
      }: {
        where: { txHash: string; tournamentId: string; playerAddr: string };
      }) => {
        const index = joinSubmissions.findIndex(
          (submission) =>
            submission.txHash === where.txHash &&
            submission.tournamentId === where.tournamentId &&
            submission.playerAddr === where.playerAddr,
        );
        if (index >= 0) joinSubmissions.splice(index, 1);
        return { count: index >= 0 ? 1 : 0 };
      },
    ),
  },
  payout: {
    create: vi.fn(async ({ data }: { data: (typeof payouts)[number] }) => {
      payouts.push(data);
      return data;
    }),
  },
  tournament: {
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(tournaments[where.id]!, data);
        return tournaments[where.id];
      },
    ),
  },
};

vi.mock("./db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => unknown) => fn(txClient)),
  },
}));

import { applyEvent } from "./reconcile";

const tournament = {
  id: "t1",
  contractId: "CABC",
};

beforeEach(() => {
  events.length = 0;
  participants.length = 0;
  joinSubmissions.length = 0;
  payouts.length = 0;
  tournaments.t1 = { id: "t1", status: "ACTIVE" };
});

describe("applyEvent", () => {
  it("ingests a registered event → ContractEvent + Participant", async () => {
    const change = await applyEvent(tournament, {
      type: "REGISTERED",
      ledger: 10,
      txHash: "tx-reg-1",
      eventId: "event-reg-1",
      data: { player: "GPLAYER1", poolAfter: "10000000" },
    });
    expect(events).toHaveLength(1);
    expect(participants).toHaveLength(1);
    expect(participants[0]?.playerAddr).toBe("GPLAYER1");
    expect(events[0]?.eventId).toBe("event-reg-1");
    expect(change).toEqual({
      type: "REGISTERED",
      txHash: "tx-reg-1",
      data: { player: "GPLAYER1", poolAfter: "10000000" },
    });
  });

  it("reconciles a confirmed join with its original app submission time", async () => {
    joinSubmissions.push({
      txHash: "tx-reg-pending",
      tournamentId: "t1",
      playerAddr: "GPLAYER1",
      submittedAt: new Date("2026-09-17T14:00:00.000Z"),
    });

    await applyEvent(tournament, {
      type: "REGISTERED",
      ledger: 10,
      txHash: "tx-reg-pending",
      eventId: "event-reg-pending",
      data: { player: "GPLAYER1", poolAfter: "10000000" },
    });

    expect(participants[0]?.joinedAt).toEqual(new Date("2026-09-17T14:00:00.000Z"));
    expect(joinSubmissions).toHaveLength(0);
  });

  it("is idempotent on replay (same txHash → no second write, returns null)", async () => {
    const evt = {
      type: "REGISTERED" as const,
      ledger: 10,
      txHash: "tx-reg-1",
      eventId: "event-reg-1",
      data: { player: "GPLAYER1", poolAfter: "10000000" },
    };
    await applyEvent(tournament, evt);
    const second = await applyEvent(tournament, evt);
    expect(events).toHaveLength(1);
    expect(participants).toHaveLength(1);
    expect(second).toBeNull();
  });

  it("does not replay an event persisted before event IDs were recorded", async () => {
    events.push({
      tournamentId: "t1",
      type: "REFUND_CLAIMED",
      ledger: 31,
      txHash: "tx-ref-legacy",
      eventId: null,
      payload: { player: "GPLAYER1", amount: "10000000" },
    });

    await expect(
      applyEvent(tournament, {
        type: "REFUND_CLAIMED",
        ledger: 31,
        txHash: "tx-ref-legacy",
        eventId: "event-ref-legacy",
        data: { player: "GPLAYER1", amount: "10000000" },
      }),
    ).resolves.toBeNull();

    expect(events).toHaveLength(1);
  });

  it("ingests a finalized event → 3 Payout rows + FINISHED", async () => {
    await applyEvent(tournament, {
      type: "FINALIZED",
      ledger: 20,
      txHash: "tx-fin-1",
      eventId: "event-fin-1",
      data: { winners: ["GA", "GB", "GC"], amounts: ["6000000", "3000000", "1000000"] },
    });
    expect(payouts).toHaveLength(3);
    expect(payouts[0]).toMatchObject({ rank: 1, playerAddr: "GA", amount: 6000000n });
    expect(tournaments.t1?.status).toBe("FINISHED");
    expect(tournaments.t1?.finalizedAt).toBeInstanceOf(Date);
  });

  it("persists a single winner with its full confirmed payout", async () => {
    await applyEvent(tournament, {
      type: "FINALIZED",
      ledger: 21,
      txHash: "tx-fin-single",
      eventId: "event-fin-single",
      data: { winners: ["GA"], amounts: ["10000000"] },
    });
    expect(payouts).toMatchObject([{ rank: 1, playerAddr: "GA", amount: 10000000n }]);
  });

  it("persists all ten ranks in confirmed event order", async () => {
    const winners = Array.from({ length: 10 }, (_, rank) => `GPLAYER${rank + 1}`);
    await applyEvent(tournament, {
      type: "FINALIZED",
      ledger: 22,
      txHash: "tx-fin-ten",
      eventId: "event-fin-ten",
      data: { winners, amounts: winners.map(() => "1000000") },
    });
    expect(payouts).toHaveLength(10);
    expect(payouts.map((payout) => payout.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(payouts.map((payout) => payout.playerAddr)).toEqual(winners);
  });

  it("ingests a cancelled event → CANCELLED", async () => {
    await applyEvent(tournament, {
      type: "CANCELLED",
      ledger: 30,
      txHash: "tx-can-1",
      eventId: "event-can-1",
      data: { claimableCount: 4 },
    });
    expect(tournaments.t1?.status).toBe("CANCELLED");
    expect(tournaments.t1?.cancelledAt).toBeInstanceOf(Date);
  });

  it("persists a refund claim without changing cancelled lifecycle state", async () => {
    tournaments.t1 = { id: "t1", status: "CANCELLED" };
    await applyEvent(tournament, {
      type: "REFUND_CLAIMED",
      ledger: 31,
      txHash: "tx-ref-1",
      eventId: "event-ref-1",
      data: {
        player: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
        amount: "10000000",
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      player: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
      amount: "10000000",
    });
    expect(tournaments.t1?.status).toBe("CANCELLED");
  });

  it("ignores malformed refund claims", async () => {
    await expect(
      applyEvent(tournament, {
        type: "REFUND_CLAIMED",
        ledger: 31,
        txHash: "tx-ref-invalid",
        eventId: "event-ref-invalid",
        data: { player: "GPLAYER1", amount: "not-a-number" },
      }),
    ).resolves.toBeNull();
    expect(events).toHaveLength(0);
  });
});
