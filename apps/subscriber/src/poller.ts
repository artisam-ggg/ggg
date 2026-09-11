import { getEvents, decodeScVal } from "./stellar";
import { getCursor, setCursor } from "./cursor";
import { applyEvent, type DecodedEvent, type EventType, type Change } from "./reconcile";
import { publishChange } from "./publish";
import { z } from "zod";
import {
  refundClaimPayloadSchema,
  stellarAddressSchema,
} from "web/src/lib/validation/refund-claim";

const TOPIC_TO_TYPE: Record<string, EventType> = {
  registered: "REGISTERED",
  finalized: "FINALIZED",
  cancelled: "CANCELLED",
  refund_claimed: "REFUND_CLAIMED",
};

const amountSchema = z.bigint().nonnegative();

// How many ledgers behind the reported tip to keep the cursor, so freshly-closed
// ledgers whose events aren't queryable yet get re-scanned on later polls rather
// than stepped over. The public Testnet RPC can lag event indexing by minutes, so
// keep a wide rolling re-scan window (~100 ledgers ≈ 8min on Testnet). Re-scans are
// cheap (getEvents is filtered to this contract) and idempotent (applyEvent
// dedupes on txHash), so a generous lag trades a little redundant work for not
// losing a late-indexed event.
const SAFETY_LAG = 100;

function decodeEvent(raw: {
  eventId: string;
  ledger: number;
  txHash: string;
  topic: string[];
  value: string;
}): DecodedEvent | null {
  try {
    const symbol = String(decodeScVal(raw.topic[0]!));
    const type = TOPIC_TO_TYPE[symbol];
    if (!type) return null;
    const value = decodeScVal(raw.value) as unknown;
    let data: Record<string, unknown>;
    if (type === "REGISTERED") {
      // Contract emits `(symbol "registered", player)` as the topic and the
      // post-join pool total as the value — the player address is in topic[1],
      // NOT the value (which is a bare i128).
      const player = stellarAddressSchema.parse(String(decodeScVal(raw.topic[1]!)));
      const poolAfter = amountSchema.parse(value);
      data = { player, poolAfter: poolAfter.toString() };
    } else if (type === "FINALIZED") {
      // Topic is `(symbol "finalized", first, second, third)`; the value is the
      // `Vec<i128>` of payout amounts. Winners come from the topic, amounts from
      // the value.
      const first = stellarAddressSchema.parse(String(decodeScVal(raw.topic[1]!)));
      const second = stellarAddressSchema.parse(String(decodeScVal(raw.topic[2]!)));
      const third = stellarAddressSchema.parse(String(decodeScVal(raw.topic[3]!)));
      const amounts = z.array(amountSchema).length(3).parse(value);
      data = { first, second, third, amounts: amounts.map((a) => a.toString()) };
    } else if (type === "CANCELLED") {
      data = { claimableCount: z.coerce.number().int().nonnegative().parse(value) };
    } else {
      data = refundClaimPayloadSchema.parse({
        player: String(decodeScVal(raw.topic[1]!)),
        amount: String(z.object({ amount: z.bigint().positive() }).parse(value).amount),
      });
    }
    return { type, ledger: raw.ledger, txHash: raw.txHash, eventId: raw.eventId, data };
  } catch (err) {
    console.warn("[subscriber] dropped undecodable event", {
      txHash: raw.txHash,
      eventId: raw.eventId,
      ledger: raw.ledger,
      err,
    });
    return null;
  }
}

/**
 * Poll one tournament: read its cursor, ingest new Soroban events and SEP-7
 * deposits idempotently, publish each confirmed change, then advance the
 * cursor. At-least-once: the cursor only moves after a successful ingest+publish
 * pass, so a crash mid-poll replays the ledger range without double-writing
 * (dedupe on txHash in `applyEvent`).
 */
export async function pollTournament(tournament: {
  id: string;
  contractId: string;
}): Promise<Change[]> {
  const cursor = await getCursor(tournament.contractId);
  const changes: Change[] = [];

  const res = await getEvents(tournament.contractId, cursor.ledger + 1);
  for (const raw of res.events) {
    const decoded = decodeEvent(raw);
    if (!decoded) continue;
    const change = await applyEvent(tournament, decoded);
    if (change) {
      await publishChange(tournament.id, change);
      changes.push(change);
    }
  }

  // Advance the cursor to just behind the tip rather than past it. Soroban RPC's
  // reported `latestLedger` runs a little ahead of when a closed ledger's events
  // are queryable, so jumping the cursor straight to `latestLedger + 1` can step
  // over an event that only becomes visible a poll or two later — losing it for
  // good. Keeping a small SAFETY_LAG re-scans the most recent ledgers each tick;
  // applyEvent dedupes on txHash, so re-seeing an already-ingested event is a
  // no-op. (Never regress below the current cursor.)
  const nextLedger = Math.max(cursor.ledger, res.latestLedger + 1 - SAFETY_LAG);
  await setCursor(tournament.contractId, nextLedger);
  return changes;
}
