import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { z } from "zod";
import { env } from "./env";

const eventSchema = z.object({
  eventId: z.string().min(1),
  type: z.string().min(1),
  ledger: z.number().int().positive(),
  txHash: z.string().min(1),
  topic: z.array(z.string().min(1)).min(1),
  value: z.string().min(1),
});
const eventsResponseSchema = z.object({
  latestLedger: z.number().int(),
  events: z.array(eventSchema),
});
export type DecodedEvents = z.infer<typeof eventsResponseSchema>;
export type DecodedEvent = z.infer<typeof eventSchema>;

/** Validate a normalised getEvents response (topic/value already base64 XDR). */
export function decodeEventsResponse(raw: unknown): DecodedEvents {
  return eventsResponseSchema.parse(raw);
}

/** Decode a base64 ScVal topic/value into a JS native via the SDK. */
export function decodeScVal(b64: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(b64, "base64"));
}

// Lazy server singletons: constructing these reads `env`, so we defer it until
// first use to keep pure helpers (decodeEventsResponse/decodeScVal) importable
// without a fully-populated environment (e.g. in unit tests).
let rpcServer: rpc.Server | undefined;
function getRpcServer(): rpc.Server {
  rpcServer ??= new rpc.Server(env.SOROBAN_RPC_URL, {
    allowHttp: env.SOROBAN_RPC_URL.startsWith("http://"),
  });
  return rpcServer;
}

// Soroban RPC only retains a recent window of ledgers and rejects an out-of-range
// startLedger with -32600 "startLedger must be within the ledger range: <min> - <max>".
// Two cases, both expected during normal operation:
//   • startLedger < min — a fresh cursor (=1) for a just-deployed contract. Soroban
//     RPC getEvents only scans forward a bounded span (~10k ledgers) from
//     startLedger, so clamping to <min> (the OLDEST retained ledger) would scan the
//     oldest window, find nothing for a contract whose events sit near the tip, and
//     let the cursor jump past them. Clamp instead to a recent window near <max> so
//     a just-deployed contract's events (always recent) fall inside the scan.
//   • startLedger > max — we poll faster than ledgers close, so the cursor
//     (latestLedger+1) briefly sits past the newest ledger; there are simply no
//     new events yet, so return empty and let the next tick catch up.
//
// RECENT_WINDOW is comfortably inside the RPC's forward-scan span (empirically
// ~9-10k ledgers) and ~11h of Testnet ledgers — long enough to capture any fresh
// tournament's events on the first poll, after which the cursor tracks the tip.
const RECENT_WINDOW = 8000;
export async function getEvents(contractId: string, startLedger: number): Promise<DecodedEvents> {
  try {
    return await fetchEvents(contractId, startLedger);
  } catch (err) {
    // The RPC rejection is a plain { code, message } object, not an Error.
    const msg =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
    const m = /ledger range:\s*(\d+)\s*-\s*(\d+)/.exec(msg);
    if (m) {
      const min = Number(m[1]);
      const max = Number(m[2]);
      if (startLedger < min)
        return await fetchEvents(contractId, Math.max(min, max - RECENT_WINDOW));
      if (startLedger > max) return { latestLedger: max, events: [] };
    }
    throw err;
  }
}

async function fetchEvents(contractId: string, startLedger: number): Promise<DecodedEvents> {
  const res = await getRpcServer().getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [contractId] }],
  });
  // Normalise SDK ScVal topics/values into base64 XDR strings before Zod
  // validation, so decoding is uniform with the test contract and decodeScVal.
  const normalized = {
    latestLedger: res.latestLedger,
    events: res.events.map((e) => ({
      // Soroban RPC's opaque event id is stable across replay and distinguishes
      // multiple contract events in one transaction.
      eventId: e.id,
      type: String(e.type),
      ledger: e.ledger,
      txHash: e.txHash,
      topic: e.topic.map((t) => t.toXDR("base64")),
      value: e.value.toXDR("base64"),
    })),
  };
  return decodeEventsResponse(normalized);
}
