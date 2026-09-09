"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit } from "@/lib/wallet";
import { formatStroops } from "@/lib/format-stroops";

type Phase = "idle" | "signing" | "submitting" | "awaitingConfirmation" | "success" | "error";

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
  const alreadyClaimed = player != null && confirmedClaimedPlayers.includes(player);
  const displayPhase = phase === "awaitingConfirmation" && alreadyClaimed ? "idle" : phase;
  const submitting = displayPhase === "signing" || displayPhase === "submitting";
  const awaitingConfirmation = displayPhase === "awaitingConfirmation";
  const displayNotice =
    phase === "awaitingConfirmation" && alreadyClaimed ? "Refund confirmed." : notice;

  async function claim() {
    if (!player || submitting || awaitingConfirmation || alreadyClaimed) return;
    setError(null);
    setNotice(null);
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
      router.refresh();
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Refund claim failed");
    }
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
