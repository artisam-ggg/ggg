"use client";
import { useTournamentEvents, type LiveEvent } from "@/hooks/use-tournament-events";
import { formatStroops } from "@/lib/format-stroops";

const trunc = (a: string): string => (a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** Human-readable gloss for a confirmed on-chain event (BRAND §8). */
function gloss(ev: LiveEvent): string {
  if (ev.type === "REGISTERED") {
    return `${trunc(String(ev.data.player))} joined`;
  }
  if (ev.type === "FINALIZED") {
    return `Payouts sent: 1st → ${trunc(String(ev.data.first))}, 2nd → ${trunc(
      String(ev.data.second),
    )}, 3rd → ${trunc(String(ev.data.third))}`;
  }
  if (ev.type === "CANCELLED") {
    return `Tournament cancelled — ${String(ev.data.claimableCount)} refunds available to claim`;
  }
  return `${trunc(String(ev.data.player))} claimed ${formatStroops(String(ev.data.amount))}`;
}

/**
 * Live registration/finalisation ticker. Subscribes to the tournament SSE
 * stream and renders each confirmed event with a human-readable gloss. The
 * ticker scroll is motion-safe only (BRAND §6) so it stops under
 * prefers-reduced-motion.
 */
export function LiveFeed({ tournamentId }: { tournamentId: string }) {
  const { events } = useTournamentEvents(tournamentId);

  return (
    <section className="kinetic-glass rounded-2xl p-6">
      <div className="flex items-center gap-3">
        {/* acid-yellow LIVE badge */}
        <span
          className="label-caps rounded-sm bg-acid-yellow px-2 py-0.5 text-surface motion-safe:animate-pulse motion-reduce:animate-none"
          aria-label="Live"
        >
          LIVE
        </span>
        <p className="label-caps text-on-surface-variant">Live activity</p>
      </div>
      {/* aria-live="polite" + role="log" so assistive tech announces new entries */}
      <div
        role="log"
        aria-live="polite"
        aria-atomic="false"
        className="mt-4 max-h-80 overflow-hidden"
      >
        <ul className="motion-safe:animate-[ticker-scroll_30s_linear_infinite] motion-reduce:animate-none">
          {events.length === 0 ? (
            <li className="data-mono text-on-surface-variant">Waiting for on-chain activity…</li>
          ) : (
            events.map((ev, i) => (
              <li key={`${ev.txHash ?? "ev"}-${i}`} className="data-mono py-1 text-on-surface">
                {gloss(ev)}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
