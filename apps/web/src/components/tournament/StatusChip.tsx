// Server Component — no "use client"
import type { TournamentDisplayStatus } from "@/server/services/tournaments";

const styles: Record<TournamentDisplayStatus, string> = {
  DRAFT: "border-outline-variant text-on-surface-variant",
  ACTIVE: "border-acid-yellow text-acid-yellow",
  REFUNDS_OPEN: "border-error text-error",
  REFUNDED: "border-outline-variant text-on-surface-variant",
  FINISHED: "border-outline-variant text-on-surface-variant",
  CANCELLED: "border-error text-error",
};

const labels: Record<TournamentDisplayStatus, string> = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  REFUNDS_OPEN: "REFUNDS OPEN",
  REFUNDED: "REFUNDED",
  FINISHED: "FINISHED",
  CANCELLED: "CANCELLED",
};

export function StatusChip({ status }: { status: TournamentDisplayStatus }) {
  return (
    <span
      className={`label-caps inline-flex items-center rounded-full border-2 px-3 py-1 ${styles[status]}`}
      data-testid="status-chip"
      data-status={status}
    >
      {labels[status]}
    </span>
  );
}
