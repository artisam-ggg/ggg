"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
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

const joinResponseSchema = z.object({
  ok: z.boolean(),
  data: z.object({ unsignedXdr: z.string(), network: z.string() }).optional(),
  error: z.union([z.string(), z.object({ message: z.string().optional() })]).optional(),
});

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
  const [copyError, setCopyError] = useState<string | null>(null);

  const isPending = phase === "signing" || phase === "submitting";
  const tournamentIdentifier =
    props.tournamentId.length > 14
      ? `${props.tournamentId.slice(0, 6)}…${props.tournamentId.slice(-6)}`
      : props.tournamentId;

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
      const built = joinResponseSchema.safeParse(await buildRes.json());
      if (!built.success) throw new Error("Failed to build join transaction");
      if (!built.data.ok) {
        throw new Error(
          typeof built.data.error === "string"
            ? built.data.error
            : (built.data.error?.message ?? "Failed to build join transaction"),
        );
      }
      if (!built.data.data) throw new Error("Failed to build join transaction");

      // 2. Sign (Freighter) + submit.
      setPhase("signing");
      await signAndSubmit(
        built.data.data.unsignedXdr,
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
    setLinkCopied(false);
    setCopyError(null);

    try {
      await navigator.clipboard.writeText(props.joinUrl);
      setLinkCopied(true);
    } catch {
      setCopyError("Could not copy tournament link");
    }
  }

  return (
    <div className="kinetic-glass rounded-2xl p-6">
      <p className="label-caps text-on-surface-variant">Scan to join</p>

      <div className="mt-4 flex flex-col items-start gap-4">
        <QrTile value={props.joinUrl} />

        <ContractAddress value={props.contractId} />

        <div className="flex flex-wrap items-center gap-3">
          <span className="data-mono text-xs text-on-surface-variant">
            Tournament: {tournamentIdentifier}
          </span>
          <button
            type="button"
            onClick={() => void copyJoinLink()}
            className="label-caps text-sm text-on-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
          >
            {linkCopied ? "Link Copied" : "Copy Link"}
          </button>
          {copyError && (
            <p role="alert" className="text-sm text-error">
              {copyError}
            </p>
          )}
        </div>

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
      {errorMsg && phase === "error" && (
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
