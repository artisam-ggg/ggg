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
};

function formatAmount(stroops: string) {
  const n = BigInt(stroops);
  const whole = n / 10_000_000n;
  const frac = (n % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

export function TournamentListRow({ t }: { t: ListItem }) {
  const totals = [
    ["Pool remaining", t.pool],
    ["Total collected", t.totalCollected],
    ["Total paid out", t.totalPaidOut],
    ["Total refunded", t.totalRefunded],
  ] as const;

  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="glass-panel flex flex-wrap items-center justify-between gap-6 rounded-xl p-6 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
    >
      <div>
        <span className="text-xl font-bold text-on-surface">{t.name}</span>
        <p className="label-caps mt-1 text-on-surface-variant">{t.gameTitle}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-6">
        {(t.displayStatus === "REFUNDS_OPEN" ||
          t.displayStatus === "REFUNDED" ||
          t.displayStatus === "CANCELLED") && (
          <span
            className="data-mono text-on-surface-variant"
            aria-label={`${t.refundClaimedCount} of ${t.participantCount} refunds claimed`}
          >
            {t.refundClaimedCount}/{t.participantCount} refunds
          </span>
        )}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-right">
          {totals.map(([label, amount]) => (
            <div key={label}>
              <dt className="label-caps text-xs text-on-surface-variant">{label}</dt>
              <dd className="data-mono text-acid-yellow">
                {formatAmount(amount)} {t.asset}
              </dd>
            </div>
          ))}
        </dl>
        <span
          className="data-mono text-on-surface-variant"
          aria-label={`${t.participantCount} participants`}
        >
          {t.participantCount}
        </span>
        <StatusChip status={t.displayStatus} />
      </div>
    </Link>
  );
}
