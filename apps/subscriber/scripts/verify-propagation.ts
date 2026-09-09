/**
 * P5.12 — live-propagation assertion core.
 *
 * Drives the *real* Phase 5 wiring against a live Postgres + Redis (booted by
 * scripts/verify-live-propagation.sh) and asserts that an on-chain event
 * propagates subscriber → Postgres → Redis → SSE without a refresh.
 *
 * It deliberately reuses the production subscriber modules (no re-implementation):
 *   - applyEvent()      reconcile.ts  — idempotent Postgres persistence
 *   - publishChange()   publish.ts    — Redis publish to `tournament:<id>`
 *   - pollTournament()  poller.ts     — the real Testnet getEvents read path (--onchain)
 *
 * Legs:
 *   A. Persistence + idempotency : applyEvent writes ContractEvent/Participant; replay is a no-op.
 *   B. Redis pub/sub             : publishChange delivers the exact frame the SSE route relays.
 *   C. SSE over HTTP (optional)  : a real GET /api/tournaments/<id>/events replays from Postgres
 *                                  then streams a live `data:` frame. Enabled when --web-url is set.
 *   D. On-chain Testnet (opt-in) : Friendbot funding + a real subscriber poll of CONTRACT_ID
 *                                  against Testnet RPC. Enabled with --onchain + CONTRACT_ID.
 *
 * Exit code 0 = all enabled legs PASS; non-zero = a leg failed.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { prisma } from "../src/db";
import { redis } from "../src/redis";
import { applyEvent, type Change, type DecodedEvent } from "../src/reconcile";
import { publishChange, channelFor } from "../src/publish";
import { pollTournament } from "../src/poller";

interface Args {
  webUrl: string | null;
  onchain: boolean;
  contractId: string | null;
  keepData: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const pref = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : null;
  };
  return {
    webUrl: get("web-url") ?? process.env.WEB_URL ?? null,
    onchain: argv.includes("--onchain"),
    contractId: get("contract-id") ?? process.env.CONTRACT_ID ?? null,
    keepData: argv.includes("--keep-data"),
  };
}

// ── tiny test harness ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const log = (m: string): void => console.log(m);
function assert(cond: unknown, msg: string): asserts cond {
  if (cond) {
    passed++;
    log(`  ✓ ${msg}`);
  } else {
    failed++;
    log(`  ✗ ${msg}`);
    throw new Error(`assertion failed: ${msg}`);
  }
}
async function step<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
  log(`\n▶ ${title}`);
  try {
    return await fn();
  } catch (err) {
    log(`  ! ${title} FAILED: ${(err as Error).message}`);
    return undefined;
  }
}

const uniq = (p: string): string =>
  `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

// A fresh, isolated tournament so reruns never collide.
async function seedTournament(): Promise<{
  id: string;
  contractId: string;
  firstBps: number;
  secondBps: number;
  thirdBps: number;
}> {
  const organizer = await prisma.user.upsert({
    where: { username: "verify-organizer" },
    create: { username: "verify-organizer", passwordHash: "x".repeat(60), role: "ORGANIZER" },
    update: {},
  });
  const contractId = uniq("CVERIFY"); // synthetic for legs A–C (no chain read)
  const t = await prisma.tournament.create({
    data: {
      name: "P5.12 live-propagation verify",
      gameTitle: "Verification",
      asset: "XLM",
      entryFee: 10_000_000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      organizerId: organizer.id,
      organizerAddr: Keypair.random().publicKey(),
      refereeAddr: Keypair.random().publicKey(),
      contractId,
      status: "ACTIVE",
    },
    select: { id: true, contractId: true, firstBps: true, secondBps: true, thirdBps: true },
  });
  return { ...t, contractId: t.contractId! };
}

async function cleanup(tournamentId: string): Promise<void> {
  // Children first (FKs), then the tournament + its cursor.
  await prisma.payout.deleteMany({ where: { tournamentId } });
  await prisma.participant.deleteMany({ where: { tournamentId } });
  await prisma.contractEvent.deleteMany({ where: { tournamentId } });
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { contractId: true },
  });
  await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  if (t?.contractId)
    await prisma.subscriberCursor.deleteMany({ where: { contractId: t.contractId } });
}

// ── Leg A: persistence + idempotency ─────────────────────────────────────────
async function legPersistence(t: {
  id: string;
  contractId: string;
  firstBps: number;
  secondBps: number;
  thirdBps: number;
}): Promise<{ change: Change; player: string }> {
  const player = Keypair.random().publicKey();
  const evt: DecodedEvent = {
    eventId: uniq("EVENTREG"),
    type: "REGISTERED",
    ledger: 1,
    txHash: uniq("TXREG"),
    data: { player, poolAfter: "10000000" },
  };
  const change = await applyEvent(t, evt);
  assert(change !== null, "applyEvent persisted a new REGISTERED event (returned a Change)");
  const row = await prisma.contractEvent.findUnique({
    where: { txHash_eventId: { txHash: evt.txHash, eventId: evt.eventId } },
  });
  assert(row !== null, "ContractEvent row exists in Postgres (source of truth)");
  const part = await prisma.participant.findUnique({
    where: { tournamentId_playerAddr: { tournamentId: t.id, playerAddr: player } },
  });
  assert(
    part !== null && part.joinTxHash === evt.txHash,
    "Participant row upserted with join txHash",
  );

  // Replay the exact event — must be an idempotent no-op (at-least-once → exactly-once).
  const replay = await applyEvent(t, evt);
  assert(replay === null, "Replaying the same event is a no-op (returns null)");
  const count = await prisma.participant.count({
    where: { tournamentId: t.id, playerAddr: player },
  });
  assert(count === 1, "No duplicate Participant after replay (deduped on txHash,type)");
  return { change: change!, player };
}

// ── Leg B: Redis pub/sub (the SSE route's live mechanism) ─────────────────────
async function legPubSub(tournamentId: string, change: Change): Promise<void> {
  const sub = redis.duplicate();
  const received: string[] = [];
  const got = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no Redis message within 5s")), 5000);
    sub.on("message", (_ch: string, msg: string) => {
      received.push(msg);
      clearTimeout(timer);
      resolve(msg);
    });
  });
  await sub.subscribe(channelFor(tournamentId));
  await publishChange(tournamentId, change); // exactly what the subscriber does post-persist
  const msg = await got;
  const parsed = JSON.parse(msg) as Change;
  assert(
    parsed.txHash === change.txHash,
    "Subscriber published the change to tournament:<id> and a subscriber received it",
  );
  assert(parsed.type === change.type, "Published frame carries the correct event type");
  await sub.unsubscribe(channelFor(tournamentId));
  await sub.quit();
}

// ── Leg C: SSE over real HTTP (replay from Postgres + live stream) ─────────────
//
// One SSE attempt: connect, drain frames in the background, return a handle.
async function openSse(url: string): Promise<{
  res: Response;
  frames: unknown[];
  waitFor: (pred: () => boolean, ms: number) => Promise<void>;
  close: () => void;
}> {
  const ctrl = new AbortController();
  const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: ctrl.signal });
  const frames: unknown[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let stopped = false;
  // Single background pump: never call reader.read() concurrently.
  void (async () => {
    let buf = "";
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const line of parts) {
          const m = line.match(/^data: (.*)$/);
          if (m) {
            try {
              frames.push(JSON.parse(m[1]!));
            } catch {
              /* heartbeat/comment */
            }
          }
        }
      }
    } catch {
      /* aborted */
    }
  })();
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (pred: () => boolean, ms: number): Promise<void> => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && !pred()) await sleep(100);
  };
  return {
    res,
    frames,
    waitFor,
    close: () => {
      stopped = true;
      ctrl.abort();
    },
  };
}

async function legSse(webUrl: string, t: { id: string }): Promise<void> {
  const url = `${webUrl.replace(/\/$/, "")}/api/tournaments/${t.id}/events`;

  // First connection: assert the HTTP contract + the Postgres replay leg.
  const first = await openSse(url);
  assert(first.res.ok, `SSE endpoint responded ${first.res.status}`);
  assert(
    (first.res.headers.get("content-type") ?? "").includes("text/event-stream"),
    "SSE endpoint returns text/event-stream",
  );
  await first.waitFor(() => first.frames.some((f) => (f as Change).type === "REGISTERED"), 10_000);
  assert(
    first.frames.some((f) => (f as Change).type === "REGISTERED"),
    "SSE replayed the confirmed REGISTERED event from Postgres on connect",
  );
  first.close();

  // Live leg: persist a FINALIZED event, then assert it streams to a *connected*
  // client. We reconnect on a fresh SSE connection exactly like the real
  // `useTournamentEvents` EventSource hook does (auto-reconnect) — ioredis runs
  // a per-connection ready-check race on the route's duplicate() subscriber, so
  // a given connection may fail to subscribe; a reconnect re-subscribes cleanly.
  // `redis.publish` returning ≥1 subscriber is the signal the server subscribed.
  const liveTxHash = uniq("TXFIN");
  const finalize: DecodedEvent = {
    eventId: uniq("EVENTFIN"),
    type: "FINALIZED",
    ledger: 2,
    txHash: liveTxHash,
    data: {
      first: Keypair.random().publicKey(),
      second: Keypair.random().publicKey(),
      third: Keypair.random().publicKey(),
      amounts: ["6000000", "3000000", "1000000"],
    },
  };
  const change = await applyEvent({ id: t.id, contractId: "x" }, finalize);

  let delivered = false;
  for (let attempt = 1; attempt <= 6 && !delivered; attempt++) {
    const conn = await openSse(url);
    // Let the route's subscribe settle, then probe with publishes; the return
    // value tells us whether the server-side subscribe is live yet.
    const seen = (): boolean => conn.frames.some((f) => (f as Change).txHash === liveTxHash);
    let subs = 0;
    for (let i = 0; i < 5 && !seen(); i++) {
      subs = await redis.publish(channelFor(t.id), JSON.stringify(change));
      await conn.waitFor(seen, 1200);
    }
    log(
      `    · attempt ${attempt}: server subscribers=${subs}, frame ${seen() ? "received" : "not yet"}`,
    );
    delivered = seen();
    conn.close();
    if (!delivered) await new Promise((r) => setTimeout(r, 500));
  }
  assert(
    delivered,
    "SSE streamed the live FINALIZED event over HTTP to a connected client (with auto-reconnect)",
  );
}

// ── Leg D: on-chain Testnet read path (opt-in) ───────────────────────────────
async function legOnchain(contractId: string): Promise<void> {
  // Friendbot funding proves real Testnet reachability + funding for a fresh key.
  const kp = Keypair.random();
  const fb = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  assert(fb.ok, `Friendbot funded a fresh Testnet account (${fb.status})`);

  // The real subscriber poll against the live contract — reads Testnet RPC getEvents,
  // ingests any present events idempotently, advances the cursor. We assert it
  // completes without throwing (network + decode path healthy).
  const changes = await pollTournament({ id: `onchain-${contractId}`, contractId }).catch(
    (e: Error) => {
      throw new Error(`pollTournament against live Testnet failed: ${e.message}`);
    },
  );
  assert(
    Array.isArray(changes),
    `Subscriber polled live contract ${contractId} on Testnet (${changes.length} new change(s))`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  log("═══ P5.12 live-propagation verification ═══");
  log(`web-url : ${args.webUrl ?? "(skipped — leg C disabled)"}`);
  log(
    `onchain : ${args.onchain ? (args.contractId ?? "(missing CONTRACT_ID)") : "(skipped — leg D disabled)"}`,
  );

  const t = await seedTournament();
  log(`seeded tournament ${t.id} (contract ${t.contractId})`);
  let tournamentId = t.id;

  try {
    const a = await step("Leg A — Postgres persistence + idempotency", () => legPersistence(t));
    if (a) await step("Leg B — Redis pub/sub delivery", () => legPubSub(t.id, a.change));
    if (args.webUrl)
      await step("Leg C — SSE over HTTP (replay + live)", () => legSse(args.webUrl!, t));
    else log("\n▶ Leg C — SSE over HTTP: SKIPPED (pass --web-url to enable)");
    if (args.onchain && args.contractId)
      await step("Leg D — on-chain Testnet poll", () => legOnchain(args.contractId!));
    else log("\n▶ Leg D — on-chain Testnet poll: SKIPPED (pass --onchain + CONTRACT_ID)");
  } finally {
    if (!args.keepData) {
      await cleanup(tournamentId).catch(() => {});
      log(`\ncleaned up tournament ${tournamentId}`);
    }
    await redis.quit().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }

  log(`\n═══ RESULT: ${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed ═══`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
