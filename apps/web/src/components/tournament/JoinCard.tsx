"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { QrTile } from "./QrTile";
import { WalletButton } from "./WalletButton";
import { ContractAddress } from "./ContractAddress";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { Guidelines } from "@/components/ui/Guidelines";
import { WalletActionNotice } from "./WalletActionNotice";
import { signAndSubmit, SubmissionError } from "@/lib/wallet";

interface JoinCardProps {
  tournamentId: string;
  contractId: string;
  /** Entry fee in stroops (smallest unit) as a string, e.g. "10000000" = 1 XLM. */
  entryFee: string;
  /** Public tournament URL encoded in the join QR. */
  joinUrl: string;
  /** Network passphrase — passed from the server shell, not imported here. */
  passphrase: string;
  /** Confirmed participant wallets from server/subscriber state. */
  confirmedParticipantAddresses: string[];
}

type Phase = "idle" | "signing" | "submitting" | "awaitingConfirmation" | "success" | "error";

const REFRESH_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000] as const;

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
  const [refreshAttempts, setRefreshAttempts] = useState(0);

  const submitting = phase === "signing" || phase === "submitting";
  const awaitingConfirmation = phase === "awaitingConfirmation";
  const alreadyJoined = player != null && props.confirmedParticipantAddresses.includes(player);
  const refreshExhausted = refreshAttempts >= REFRESH_DELAYS_MS.length;
  const tournamentIdentifier =
    props.tournamentId.length > 14
      ? `${props.tournamentId.slice(0, 6)}…${props.tournamentId.slice(-6)}`
      : props.tournamentId;

  useEffect(() => {
    if (!awaitingConfirmation || alreadyJoined || refreshExhausted) return;
    const timeout = setTimeout(() => {
      router.refresh();
      setRefreshAttempts((current) => current + 1);
    }, REFRESH_DELAYS_MS[refreshAttempts]);
    return () => clearTimeout(timeout);
  }, [alreadyJoined, awaitingConfirmation, refreshAttempts, refreshExhausted, router]);

  async function onJoin() {
    if (!player || submitting || awaitingConfirmation || alreadyJoined) return;
    setErrorMsg(null);
    setRefreshAttempts(0);
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
      if (
        e instanceof SubmissionError &&
        e.details.retryable === true &&
        e.details.txHash !== undefined
      ) {
        setPhase("awaitingConfirmation");
        return;
      }
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Join failed");
    }
  }

  function onModalClose() {
    setPhase("idle");
    setErrorMsg(null);
  }

  return (
    <div className="kinetic-glass rounded-2xl p-6">
      <p className="label-caps text-on-surface-variant">Scan to join</p>
      <div className="mt-3">
        <Guidelines journey="player" />
      </div>

      <div className="mt-4 flex flex-col items-start gap-4">
        <QrTile value={props.joinUrl} />

        <ContractAddress value={props.contractId} />

        <div className="flex flex-wrap items-center gap-3">
          <span className="data-mono text-xs text-on-surface-variant">
            Tournament: {tournamentIdentifier}
          </span>
        </div>

        <WalletActionNotice expectedPassphrase={props.passphrase}>
          Joining transfers the displayed entry fee from your wallet into this tournament&apos;s
          escrow.
        </WalletActionNotice>

        <div className="flex flex-wrap items-center gap-3">
          <WalletButton expectedPassphrase={props.passphrase} onConnected={setPlayer} />

          <button
            type="button"
            onClick={onJoin}
            disabled={!player || submitting || awaitingConfirmation || alreadyJoined}
            className="brutalist-border label-caps bg-electric-violet-strong px-6 py-3 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Join Tournament
          </button>
        </div>
        <p aria-live="polite" className="text-sm text-on-surface-variant">
          {!player
            ? "Connect Freighter to enable Join Tournament."
            : alreadyJoined
              ? "This wallet has already joined this tournament."
              : awaitingConfirmation
                ? refreshExhausted
                  ? "Join submitted and still processing. Refresh the status; do not submit another transaction."
                  : "Join submitted and awaiting confirmation. Do not submit another transaction."
                : submitting
                  ? "Join transaction is waiting for wallet or network confirmation."
                  : "Wallet connected. Join Tournament will request the entry-fee transaction."}
        </p>
        {awaitingConfirmation && refreshExhausted && (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="label-caps rounded-lg border-2 border-outline px-4 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline"
          >
            Refresh join status
          </button>
        )}
      </div>

      {/* Error display — role="alert" for screen readers */}
      {errorMsg && phase === "error" && (
        <p role="alert" className="mt-3 text-sm text-error">
          {errorMsg}
        </p>
      )}

      <SubmitStateModal
        open={submitting || phase === "success"}
        phase={phase === "awaitingConfirmation" ? "idle" : phase}
        {...(errorMsg !== null ? { message: errorMsg } : {})}
        onClose={onModalClose}
      />
    </div>
  );
}
