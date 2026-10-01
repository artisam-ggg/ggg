import Link from "next/link";
import type { TournamentDisplayStatus } from "@/server/services/tournaments";
import { StatusChip } from "./StatusChip";

export type ListItem = {
  id: string;
  name: string;
  gameTitle: string;
  status: "DRAFT" | "ACTIVE" | "FINISHED" | "CANCELLED";
  displayStatus: TournamentDisplayStatus;
  asset: "XLM" | "USDC";
  entryFee: string;
  pool: string;
  totalCollected: string;
  totalPaidOut: string;
  totalRefunded: string;
  participantCount: number;
  refundClaimedCount: number;
  coverImageUrl?: string | null;
};

function formatAmount(stroops: string) {
  const n = BigInt(stroops);
  const whole = n / 10_000_000n;
  const frac = (n % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

export function TournamentListRow({ t, featured = false }: { t: ListItem; featured?: boolean }) {
  const hasRefundActivity =
    t.displayStatus === "REFUNDS_OPEN" ||
    t.displayStatus === "REFUNDED" ||
    t.displayStatus === "CANCELLED" ||
    t.totalRefunded !== "0";
  const coreMetrics = [
    ["pool", "Pool remaining", t.pool],
    ["collected", "Total collected", t.totalCollected],
    ["paid-out", "Total paid out", t.totalPaidOut],
  ] as const;
  const separatedSlotClass =
    "relative min-w-0 pl-4 before:absolute before:top-1/2 before:left-0 before:h-8 before:-translate-y-1/2 before:border-l before:border-outline-variant before:opacity-60";
  const featuredBackground = t.coverImageUrl
    ? `url("${t.coverImageUrl}")`
    : "radial-gradient(circle at 85% 15%, rgba(247, 189, 72, 0.3), transparent 35%), linear-gradient(135deg, #2a2a2a, #131313 65%)";

  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="glass-panel relative isolate flex h-full overflow-hidden rounded-xl p-6 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
    >
      {featured && (
        <div data-testid="featured-card-visual" aria-hidden="true" className="absolute inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-75"
            style={{ backgroundImage: featuredBackground }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(19, 19, 19, 0.96), rgba(19, 19, 19, 0.7) 55%, rgba(19, 19, 19, 0.35))",
            }}
          />
        </div>
      )}

      <div className="relative z-10 flex h-full w-full flex-col">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div>
            <span className="text-xl font-bold text-on-surface">{t.name}</span>
            <p className="mt-1 text-sm text-on-surface-variant">{t.gameTitle}</p>
          </div>
          <div data-summary-slot="status" className="shrink-0 sm:pl-4">
            <StatusChip status={t.displayStatus} />
          </div>
        </div>
        <div role="group" aria-label="Tournament summary" className="mt-8 flex flex-1 flex-col">
          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
            {coreMetrics.map(([slot, label, amount]) => (
              <dl
                key={slot}
                data-summary-slot={slot}
                className={`${separatedSlotClass} text-right`}
              >
                <div>
                  <dt className="label-caps text-xs text-on-surface-variant">{label}</dt>
                  <dd className="data-mono mt-1 text-acid-yellow">
                    {formatAmount(amount)} {t.asset}
                  </dd>
                </div>
              </dl>
            ))}
            <dl data-summary-slot="participants" className="text-right">
              <dt className="label-caps text-xs text-on-surface-variant">Players</dt>
              <dd
                className="data-mono mt-1 text-on-surface"
                aria-label={`${t.participantCount} participants`}
              >
                {t.participantCount}
              </dd>
            </dl>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-outline-variant pt-4">
            <dl data-summary-slot="refunds">
              <dt className="label-caps text-xs text-on-surface-variant">Refunds</dt>
              <dd
                className="data-mono mt-1 text-on-surface"
                aria-label={
                  hasRefundActivity
                    ? `${t.refundClaimedCount} of ${t.participantCount} refunds claimed`
                    : "Refunds not applicable"
                }
              >
                {hasRefundActivity ? `${t.refundClaimedCount}/${t.participantCount} claimed` : "—"}
              </dd>
            </dl>
            <dl data-summary-slot="refunded" className="text-right">
              <dt className="label-caps text-xs text-on-surface-variant">Total refunded</dt>
              <dd
                className="data-mono mt-1 text-acid-yellow"
                aria-label={hasRefundActivity ? undefined : "Total refunded not applicable"}
              >
                {hasRefundActivity ? `${formatAmount(t.totalRefunded)} ${t.asset}` : "—"}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </Link>
  );
}
