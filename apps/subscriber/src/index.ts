import "dotenv/config";
import { prisma } from "./db";
import { pollTournament } from "./poller";
import { env } from "./env";

/**
 * One poll pass over every tournament that still needs on-chain reconciliation.
 *
 * This is ACTIVE tournaments plus those that *just* became FINISHED/CANCELLED:
 * the web app flips the status the moment the finalize/cancel transaction is
 * submitted, but the matching `finalized`/`cancelled` event (and its payouts) is
 * only ingested here. Polling terminal tournaments for a grace window after the
 * transition ensures that final event still gets reconciled instead of being
 * dropped because the status already left ACTIVE.
 *
 * A failure polling one tournament is logged and isolated so the others still
 * run (and so the loop survives a transient RPC/Horizon outage).
 */
const TERMINAL_GRACE_MS = 15 * 60 * 1000;

export async function tick(): Promise<void> {
  const graceSince = new Date(Date.now() - TERMINAL_GRACE_MS);
  const tournaments = await prisma.tournament.findMany({
    where: {
      contractId: { not: null },
      OR: [
        { status: "ACTIVE" },
        { status: "FINISHED", finalizedAt: { gt: graceSince } },
        { status: "CANCELLED", cancelledAt: { gt: graceSince } },
      ],
    },
    select: { id: true, contractId: true },
  });

  console.log(`[subscriber] found ${tournaments.length} tournaments to poll`);

  for (const t of tournaments) {
    if (!t.contractId) continue;
    try {
      console.log(`[subscriber] polling tournament ${t.id} (${t.contractId})`);
      await pollTournament({ id: t.id, contractId: t.contractId });
      console.log(`[subscriber] finished polling tournament ${t.id}`);
    } catch (err) {
      console.error(`[subscriber] poll failed for ${t.id}`, err);
    }
  }
}

async function main(): Promise<void> {
  let running = true;
  const stop = (): void => {
    running = false;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  console.log("[subscriber] started");
  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, env.POLL_INTERVAL_MS));
  }
  await prisma.$disconnect();
  console.log("[subscriber] stopped");
}

// Only run the loop when executed directly (not when imported by tests).
if (process.env.VITEST === undefined) {
  main().catch((err: unknown) => {
    console.error("[subscriber] fatal", err);
    process.exit(1);
  });
}
