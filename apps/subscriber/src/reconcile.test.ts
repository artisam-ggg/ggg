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
const participants: { tournamentId: string; playerAddr: string; joinTxHash: string }[] = [];
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
  firstBps: 6000,
  secondBps: 3000,
  thirdBps: 1000,
};

beforeEach(() => {
  events.length = 0;
  participants.length = 0;
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
      data: { first: "GA", second: "GB", third: "GC", amounts: ["6000000", "3000000", "1000000"] },
    });
    expect(payouts).toHaveLength(3);
    expect(payouts[0]).toMatchObject({ rank: 1, playerAddr: "GA", amount: 6000000n });
    expect(tournaments.t1?.status).toBe("FINISHED");
    expect(tournaments.t1?.finalizedAt).toBeInstanceOf(Date);
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
