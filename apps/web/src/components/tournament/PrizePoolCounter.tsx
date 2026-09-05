"use client";
import { useMemo } from "react";
import { useTournamentEvents } from "@/hooks/use-tournament-events";

/** Convert a stroop string to human-readable decimal (7 decimal places). */
function fmt(stroops: string) {
  const n = BigInt(stroops);
  return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`;
}

/**
 * Live prize-pool counter. Seeds from the server snapshot (initialPool /
 * participantCount) then derives the live total off the SSE stream: every
 * confirmed REGISTERED event advances the pool to its contract-emitted
 * `poolAfter`. Each advance bumps a key that
 * replays the `pool-pop` scale animation — `motion-safe:` disables it under
 * prefers-reduced-motion (BRAND §6).
 */
export function PrizePoolCounter({
  tournamentId,
  initialPool,
  asset,
  participantCount,
  entryFee,
  initialParticipants = [], // new prop
}: {
  tournamentId: string;
  initialPool: string;
  asset: "XLM" | "USDC";
  participantCount: number;
  entryFee: string;
  initialParticipants?: string[]; // addresses already counted
}) {
  const { events } = useTournamentEvents(tournamentId);

  // Build a Set of initial participant addresses for quick lookup
  const initialSet = useMemo(() => new Set(initialParticipants), [initialParticipants]);

  // Pool + count are derived state — computed during render, not stored.
  const { pool, count, bumps } = useMemo(() => {
    let p = BigInt(initialPool);
    let c = participantCount;
    let b = 0;

    // Track addresses already counted from the stream
    const countedInStream = new Set<string>();

    for (const ev of events) {
      if (ev.type !== "REGISTERED") continue;

      // Cast player to string (it's a Stellar address)
      const playerAddr = ev.data.player as string | undefined;
      if (!playerAddr) continue;

      // Skip if already counted initially or in the stream
      if (initialSet.has(playerAddr) || countedInStream.has(playerAddr)) {
        continue;
      }

      const after = ev.data.poolAfter;
      if (typeof after !== "string") continue;

      countedInStream.add(playerAddr);
      c += 1;
      const next = BigInt(after);
      if (next > p) b += 1;
      p = next;
    }

    return { pool: p, count: c, bumps: b };
  }, [events, initialPool, participantCount, initialSet]);

  return (
    <div className="high-contrast-card acid-glow rounded-none p-8">
      <p className="label-caps text-on-surface-variant">Prize pool</p>
      <p className="mt-2 flex items-end gap-3">
        <span
          key={bumps}
          data-testid="pool-amount"
          aria-live="polite"
          aria-atomic="true"
          className="data-mono text-[96px] font-extrabold leading-none text-acid-yellow motion-safe:animate-pool-pop"
        >
          {fmt(pool.toString())}
        </span>
        <span className="label-caps mb-3 text-on-surface-variant">{asset}</span>
      </p>
      <div className="data-mono mt-4 flex gap-6 text-on-surface-variant">
        <span>{count} players</span>
        <span>
          entry {fmt(entryFee)} {asset}
        </span>
      </div>
    </div>
  );
}
