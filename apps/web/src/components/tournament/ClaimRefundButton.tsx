"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit, SubmissionError } from "@/lib/wallet";
import { formatStroops } from "@/lib/format-stroops";

type Phase = "idle" | "signing" | "submitting" | "awaitingConfirmation" | "error";
const REFRESH_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000] as const;

export function ClaimRefundButton({
  tournamentId,
  passphrase,
  entryFee,
  asset,
  confirmedClaimedPlayers = [],
}: {
  tournamentId: string;
  passphrase: string;
  entryFee: string;
  asset: "XLM" | "USDC";
  confirmedClaimedPlayers?: string[];
}) {
  const router = useRouter();
  const [player, setPlayer] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const alreadyClaimed = player != null && confirmedClaimedPlayers.includes(player);
  const displayPhase = phase === "awaitingConfirmation" && alreadyClaimed ? "idle" : phase;
  const submitting = displayPhase === "signing" || displayPhase === "submitting";
  const awaitingConfirmation = displayPhase === "awaitingConfirmation";
  const refreshExhausted = refreshAttempts >= REFRESH_DELAYS_MS.length;
  const displayNotice =
    phase === "awaitingConfirmation" && alreadyClaimed
      ? "Refund confirmed."
      : awaitingConfirmation && refreshExhausted
        ? "Refund submitted and is still processing. Refresh the status to check again; do not submit another transaction."
        : notice;

  useEffect(() => {
    if (!awaitingConfirmation || alreadyClaimed || refreshExhausted) return;
    const timeout = setTimeout(() => {
      router.refresh();
      setRefreshAttempts((current) => current + 1);
    }, REFRESH_DELAYS_MS[refreshAttempts]);
    return () => clearTimeout(timeout);
  }, [alreadyClaimed, awaitingConfirmation, refreshAttempts, refreshExhausted, router]);

  async function claim() {
    if (!player || submitting || awaitingConfirmation || alreadyClaimed) return;
    setError(null);
    setNotice(null);
    setRefreshAttempts(0);
    try {
      setPhase("submitting");
      const response = await fetch(`/api/tournaments/${tournamentId}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerAddress: player, submitterAddress: player }),
      });
      const built = (await response.json()) as {
        ok: boolean;
        data?: { unsignedXdr?: string };
        error?: { message?: string } | string;
      };
      const message = typeof built.error === "string" ? built.error : built.error?.message;
      if (!response.ok || !built.ok || !built.data?.unsignedXdr) {
        throw new Error(message ?? "Failed to build refund claim");
      }

      setPhase("signing");
      await signAndSubmit(
        built.data.unsignedXdr,
        "claim_refund",
        `/api/tournaments/${tournamentId}/submit`,
        passphrase,
      );
      setPhase("awaitingConfirmation");
      setNotice("Refund submitted. Waiting for confirmed on-chain event.");
    } catch (e) {
      if (
        e instanceof SubmissionError &&
        e.details.retryable === true &&
        e.details.txHash !== undefined
      ) {
        setPhase("awaitingConfirmation");
        setNotice("Refund submitted and is still pending confirmation. Do not submit it again.");
        return;
      }
      setPhase("error");
      setError(`Refund submission failed. ${e instanceof Error ? e.message : "Please try again."}`);
    }
  }

  function refreshStatus() {
    setRefreshAttempts(0);
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <WalletButton expectedPassphrase={passphrase} onConnected={setPlayer} />
      {player && (
        <p className="text-sm text-on-surface-variant">
          You will sign a {formatStroops(entryFee)} {asset} refund to {player} on {passphrase}.
        </p>
      )}
      <button
        type="button"
        onClick={claim}
        disabled={!player || submitting || awaitingConfirmation || alreadyClaimed}
        className="label-caps rounded-lg bg-error px-4 py-2 text-on-error disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
      >
        Claim Refund
      </button>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {displayNotice && (
        <p role="status" className="text-sm text-on-surface-variant">
          {displayNotice}
        </p>
      )}
      {awaitingConfirmation && refreshExhausted && (
        <button
          type="button"
          onClick={refreshStatus}
          className="label-caps rounded-lg border-2 border-outline px-4 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline"
        >
          Refresh refund status
        </button>
      )}
      <SubmitStateModal
        open={submitting}
        phase={displayPhase === "awaitingConfirmation" ? "idle" : displayPhase}
        {...(error ? { message: error } : {})}
        onClose={() => {
          setPhase("idle");
          setError(null);
          setNotice(null);
        }}
      />
    </div>
  );
}
