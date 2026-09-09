import { Prisma } from "web/src/generated/prisma/client";
import { prisma } from "./db";

export type EventType = "REGISTERED" | "FINALIZED" | "CANCELLED" | "REFUND_CLAIMED";

export interface DecodedEvent {
  /** Stable Soroban RPC event identity; combined with txHash for safe replay. */
  eventId: string;
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

function isRefundClaim(data: Record<string, unknown>): data is { player: string; amount: string } {
  return (
    typeof data.player === "string" &&
    data.player.length > 0 &&
    typeof data.amount === "string" &&
    /^[1-9]\d*$/.test(data.amount)
  );
}

/**
 * Apply a decoded contract event to Postgres inside one transaction, deduped on
 * `(txHash, eventId)`. A replay of the same event is a no-op and returns `null`
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
  if (evt.type === "REFUND_CLAIMED" && !isRefundClaim(evt.data)) return null;

  return prisma.$transaction(async (tx) => {
    // Idempotency: Soroban's stable event id distinguishes same-type events in one tx.
    const existing = await tx.contractEvent.findUnique({
      where: { txHash_eventId: { txHash: evt.txHash, eventId: evt.eventId } },
    });
    if (existing) return null;

    const legacyEvent = await tx.contractEvent.findFirst({
      where: { tournamentId: tournament.id, txHash: evt.txHash, type: evt.type, eventId: null },
    });
    if (legacyEvent) return null;

    await tx.contractEvent.create({
      data: {
        tournamentId: tournament.id,
        type: evt.type,
        ledger: evt.ledger,
        txHash: evt.txHash,
        eventId: evt.eventId,
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
