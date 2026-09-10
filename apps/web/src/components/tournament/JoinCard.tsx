"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrTile } from "./QrTile";
import { WalletButton } from "./WalletButton";
import { ContractAddress } from "./ContractAddress";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit } from "@/lib/wallet";

interface JoinCardProps {
  tournamentId: string;
  contractId: string;
  /** Entry fee in stroops (smallest unit) as a string, e.g. "10000000" = 1 XLM. */
  entryFee: string;
  /** Public tournament URL encoded in the join QR. */
  joinUrl: string;
  /** Network passphrase — passed from the server shell, not imported here. */
  passphrase: string;
}

type Phase = "idle" | "signing" | "submitting" | "success" | "error";

/**
 * JoinCard — contract-backed QR join flow (FLOW 02).
 *
 * Composes:
 * - QrTile: a public GGG tournament URL, so scanning leads to the signed
 *   `join_tournament` flow instead of a direct token payment.
 * - ContractAddress: copyable contract address.
 * - WalletButton: connects Freighter; provides `playerAddress`.
 * - Join button: POSTs to /api/tournaments/[id]/join, signs XDR via Freighter,
 *   submits to /api/tournaments/[id]/submit, then refreshes the page on success.
 * - SubmitStateModal: reflects signing → submitting → success/error states.
 */
export function JoinCard(props: JoinCardProps) {
  const router = useRouter();
  const [player, setPlayer] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const isPending = phase === "signing" || phase === "submitting";

  async function onJoin() {
    if (!player || isPending) return;
    setErrorMsg(null);
    setPhase("submitting");

    try {
      // 1. Build unsigned XDR from the server.
      const buildRes = await fetch(`/api/tournaments/${props.tournamentId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerAddress: player }),
      });
      const built = (await buildRes.json()) as {
        ok: boolean;
        data?: { unsignedXdr: string; network: string };
        error?: string;
      };
      if (!built.ok) {
        throw new Error(built.error ?? "Failed to build join transaction");
      }

      // 2. Sign (Freighter) + submit.
      setPhase("signing");
      await signAndSubmit(
        built.data!.unsignedXdr,
        "join",
        `/api/tournaments/${props.tournamentId}/submit`,
        props.passphrase,
      );

      // 3. Success — refresh so the participant list / pool updates.
      setPhase("success");
      router.refresh();
    } catch (e: unknown) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Join failed");
    }
  }

  function onModalClose() {
    setPhase("idle");
    setErrorMsg(null);
  }

  async function copyJoinLink() {
    await navigator.clipboard.writeText(props.joinUrl);
    setLinkCopied(true);
  }

  return (
    <div className="kinetic-glass rounded-2xl p-6">
      <p className="label-caps text-on-surface-variant">Scan to join</p>

      <div className="mt-4 flex flex-col items-start gap-4">
        <QrTile value={props.joinUrl} />

        <ContractAddress value={props.contractId} />

        <button
          type="button"
          onClick={() => copyJoinLink().catch(() => setErrorMsg("Could not copy tournament link"))}
          className="label-caps text-sm text-on-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
        >
          {linkCopied ? "Link Copied" : "Copy Link"}
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <WalletButton expectedPassphrase={props.passphrase} onConnected={setPlayer} />

          <button
            type="button"
            onClick={onJoin}
            disabled={!player || isPending}
            className="brutalist-border label-caps bg-electric-violet-strong px-6 py-3 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Join Tournament
          </button>
        </div>
      </div>

      {/* Error display — role="alert" for screen readers */}
      {errorMsg && (
        <p role="alert" className="mt-3 text-sm text-error">
          {errorMsg}
        </p>
      )}

      <SubmitStateModal
        open={isPending || phase === "success"}
        phase={phase}
        {...(errorMsg !== null ? { message: errorMsg } : {})}
        onClose={onModalClose}
      />
    </div>
  );
}
