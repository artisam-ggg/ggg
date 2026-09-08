import { Prisma } from "web/src/generated/prisma/client";
import { prisma } from "./db";

export type EventType = "REGISTERED" | "FINALIZED" | "CANCELLED" | "REFUND_CLAIMED";

export interface DecodedEvent {
  type: EventType;
  ledger: number;
  txHash: string;
  data: Record<string, unknown>;
}

export interface Change {
  type: EventType;
  txHash: string;
  data: Record<string, unknown>;
}

/**
 * Apply a decoded contract event to Postgres inside one transaction, deduped on
 * `(txHash, type)`. A replay of the same event is a no-op and returns `null`
 * (at-least-once delivery → exactly-once persistence).
 */
export async function applyEvent(
  tournament: {
    id: string;
    contractId: string;
    firstBps?: number;
    secondBps?: number;
    thirdBps?: number;
  },
  evt: DecodedEvent,
): Promise<Change | null> {
  return prisma.$transaction(async (tx) => {
    // Idempotency: dedupe on (txHash, type).
    const existing = await tx.contractEvent.findUnique({
      where: { txHash_type: { txHash: evt.txHash, type: evt.type } },
    });
    if (existing) return null;

    await tx.contractEvent.create({
      data: {
        tournamentId: tournament.id,
        type: evt.type,
        ledger: evt.ledger,
        txHash: evt.txHash,
        payload: evt.data as Prisma.InputJsonValue,
      },
    });

    if (evt.type === "REGISTERED") {
      const player = String(evt.data.player);
      await tx.participant.upsert({
        where: { tournamentId_playerAddr: { tournamentId: tournament.id, playerAddr: player } },
        create: { tournamentId: tournament.id, playerAddr: player, joinTxHash: evt.txHash },
        update: { joinTxHash: evt.txHash },
      });
    } else if (evt.type === "FINALIZED") {
      const winners = [evt.data.first, evt.data.second, evt.data.third].map(String);
      const amounts = (evt.data.amounts as string[]).map((a) => BigInt(a));
      for (let i = 0; i < 3; i++) {
        await tx.payout.create({
          data: {
            tournamentId: tournament.id,
            rank: i + 1,
            playerAddr: winners[i]!,
            amount: amounts[i]!,
            txHash: evt.txHash,
          },
        });
      }
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { status: "FINISHED", finalizedAt: new Date() },
      });
    } else if (evt.type === "CANCELLED") {
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    }

    return { type: evt.type, txHash: evt.txHash, data: evt.data };
  });
}
