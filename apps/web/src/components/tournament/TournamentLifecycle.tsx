import type { TournamentDisplayStatus } from "@/server/services/tournaments";

export const lifecycleLabels: Record<TournamentDisplayStatus, string> = {
  DRAFT: "PREPARING",
  ACTIVE: "OPEN FOR JOINING",
  REFUNDS_OPEN: "REFUNDS AVAILABLE",
  REFUNDED: "REFUNDS COMPLETE",
  FINISHED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

type PersistedStatus = "DRAFT" | "ACTIVE" | "CANCELLED" | "FINISHED";
type ContractVersion = "CURRENT" | "UNSUPPORTED" | "UNAVAILABLE" | "PENDING";

export function TournamentLifecycle({
  status,
  displayStatus,
  contractVersion,
  hasConfirmedPayouts,
}: {
  status: PersistedStatus;
  displayStatus: TournamentDisplayStatus;
  contractVersion: ContractVersion;
  hasConfirmedPayouts: boolean;
}) {
  let title = lifecycleLabels[displayStatus];
  let detail: string;

  if (status === "DRAFT") {
    detail = "Contract deployment is not confirmed yet. Joining and settlement are unavailable.";
  } else if (displayStatus === "REFUNDED") {
    detail = "Every registered player has a confirmed refund. No further claim is available.";
  } else if (displayStatus === "REFUNDS_OPEN") {
    detail =
      status === "CANCELLED"
        ? "The tournament was cancelled. Registered players can claim one refund each."
        : "The settlement deadline passed without final results. Registered players can claim one refund each.";
  } else if (status === "CANCELLED") {
    detail = "The tournament was cancelled before any player needed a refund. Joining is closed.";
  } else if (status === "FINISHED") {
    if (!hasConfirmedPayouts) {
      title = "PAYOUT CONFIRMATION PENDING";
      detail = "Settlement is confirmed, but winner and payout records are still syncing.";
    } else {
      detail = "Final results and payouts are confirmed. Joining and settlement are closed.";
    }
  } else if (contractVersion === "UNAVAILABLE") {
    title = "ACTIONS TEMPORARILY PAUSED";
    detail = "Escrow state is unavailable. Refresh later before attempting a wallet action.";
  } else if (contractVersion === "UNSUPPORTED") {
    title = "READ-ONLY TOURNAMENT";
    detail = "This escrow uses an older contract version. Joining and settlement are unavailable.";
  } else {
    detail =
      "Players can join with Freighter. The configured referee wallet can finalize the ranked payouts.";
  }

  return (
    <section
      aria-labelledby="tournament-lifecycle-heading"
      className="mt-6 rounded-xl border border-outline-variant bg-surface-container-low p-4"
    >
      <p className="label-caps text-on-surface-variant">Tournament status</p>
      <h2 id="tournament-lifecycle-heading" className="mt-1 text-xl font-bold text-on-surface">
        {title}
      </h2>
      <p className="mt-2 text-sm text-on-surface-variant">{detail}</p>
    </section>
  );
}
