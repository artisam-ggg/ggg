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
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="glass-panel flex items-center justify-between rounded-xl p-6 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
    >
      <div>
        <span className="text-xl font-bold text-on-surface">{t.name}</span>
        <p className="label-caps mt-1 text-on-surface-variant">{t.gameTitle}</p>
      </div>
      <div className="flex items-center gap-6">
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
        <span className="data-mono text-acid-yellow">
          {formatAmount(t.pool)} {t.asset}
        </span>
        <span className="data-mono text-on-surface-variant">{t.participantCount}</span>
        <StatusChip status={t.displayStatus} />
      </div>
    </Link>
  );
}
