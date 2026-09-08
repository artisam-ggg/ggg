"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit } from "@/lib/wallet";

type Phase = "idle" | "signing" | "submitting" | "success" | "error";

export function ClaimRefundButton({
  tournamentId,
  passphrase,
}: {
  tournamentId: string;
  passphrase: string;
}) {
  const router = useRouter();
  const [player, setPlayer] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = phase === "signing" || phase === "submitting";

  async function claim() {
    if (!player || pending) return;
    setError(null);
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
      setPhase("success");
      router.refresh();
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Refund claim failed");
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <WalletButton expectedPassphrase={passphrase} onConnected={setPlayer} />
      <button
        type="button"
        onClick={claim}
        disabled={!player || pending}
        className="label-caps rounded-lg bg-error px-4 py-2 text-on-error disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
      >
        Claim Refund
      </button>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <SubmitStateModal
        open={pending || phase === "success"}
        phase={phase}
        {...(error ? { message: error } : {})}
        onClose={() => {
          setPhase("idle");
          setError(null);
        }}
      />
    </div>
  );
}
