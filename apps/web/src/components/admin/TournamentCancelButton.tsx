"use client";

import { useRouter } from "next/navigation";
import type { TournamentStatus } from "@/generated/prisma/enums";
import { useAdminAction, parseAdminResponse } from "./use-admin-action";

interface TournamentCancelButtonProps {
  tournamentId: string;
  currentStatus: TournamentStatus;
}

export function TournamentCancelButton({
  tournamentId,
  currentStatus,
}: TournamentCancelButtonProps) {
  const router = useRouter();
  const { status, error, execute } = useAdminAction<void>();

  if (currentStatus === "CANCELLED" || currentStatus === "FINISHED") {
    return <p className="text-sm text-on-surface-variant">This tournament cannot be cancelled.</p>;
  }

  async function handleCancel() {
    if (
      !confirm(
        "Cancel this tournament in the database? This does NOT cancel the on-chain contract — only the organizer can do that.",
      )
    ) {
      return;
    }

    await execute(async () => {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      await parseAdminResponse(res);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-error/30 bg-error-container/10 p-4">
      <p className="label-caps text-error">Danger zone</p>
      <p className="text-sm text-on-surface-variant">
        Cancelling here only updates the database status. The on-chain contract remains active until
        the organizer submits a cancel transaction.
      </p>
      <button
        type="button"
        onClick={handleCancel}
        disabled={status === "loading"}
        className="label-caps rounded-lg bg-error px-4 py-2 text-on-error transition hover:bg-error/90 disabled:opacity-60"
      >
        {status === "loading" ? "Cancelling…" : "Cancel Tournament (DB only)"}
      </button>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
