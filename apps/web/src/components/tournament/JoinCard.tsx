"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { QrTile } from "./QrTile";
import { WalletButton } from "./WalletButton";
import { ContractAddress } from "./ContractAddress";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { Guidelines } from "@/components/ui/Guidelines";
import { WalletActionNotice } from "./WalletActionNotice";
import { SettlementDeadline } from "./SettlementDeadline";
import { signAndSubmit, SubmissionError } from "@/lib/wallet";
import { formatStroops } from "@/lib/format-stroops";
import { apiResponseSchema } from "@/lib/api";

interface JoinCardProps {
  tournamentId: string;
  contractId: string;
  /** Entry fee in stroops (smallest unit) as a string, e.g. "10000000" = 1 XLM. */
  entryFee: string;
  asset: "XLM" | "USDC";
  /** Public tournament URL encoded in the join QR. */
  joinUrl: string;
  /** Network passphrase — passed from the server shell, not imported here. */
  passphrase: string;
  network: "testnet" | "public";
  /** Confirmed participant wallets and receipts from server/subscriber state. */
  confirmedParticipants: { playerAddress: string; txHash: string | null }[];
  settlementDeadline: number;
}

type Phase = "idle" | "signing" | "submitting" | "awaitingConfirmation" | "success" | "error";

const REFRESH_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000] as const;

const joinResponseSchema = z.object({
  ok: z.boolean(),
  data: z.object({ unsignedXdr: z.string(), network: z.enum(["testnet", "public"]) }).optional(),
  error: z.union([z.string(), z.object({ message: z.string().optional() })]).optional(),
});

const joinStatusResponseSchema = apiResponseSchema(
  z.object({
    pendingJoinSubmissions: z.array(
      z.object({ tournamentId: z.string(), txHash: z.string().min(1) }),
    ),
  }),
);

type JoinTransaction = {
  playerAddress: string;
  txHash: string;
  network: "testnet" | "public";
  status: "pending" | "confirmed" | "failed";
};

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
  const [transaction, setTransaction] = useState<JoinTransaction | null>(null);
  const [joinStatus, setJoinStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pendingSubmission, setPendingSubmission] = useState<{ txHash: string } | null>(null);
  const statusRequest = useRef<AbortController | null>(null);

  const submitting = phase === "signing" || phase === "submitting";
  const confirmedParticipant = player
    ? props.confirmedParticipants.find((participant) => participant.playerAddress === player)
    : undefined;
  const activeTransaction = transaction?.playerAddress === player ? transaction : null;
  const alreadyJoined = confirmedParticipant !== undefined;
  const awaitingConfirmation =
    !alreadyJoined &&
    (phase === "awaitingConfirmation" ||
      activeTransaction?.status === "pending" ||
      pendingSubmission !== null);
  const registered = alreadyJoined || activeTransaction?.status === "confirmed";
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

  useEffect(() => () => statusRequest.current?.abort(), []);

  function handleConnected(nextPlayer: string | null) {
    statusRequest.current?.abort();
    if (nextPlayer !== player) {
      setPhase("idle");
      setErrorMsg(null);
      setRefreshAttempts(0);
      setTransaction(null);
      setPendingSubmission(null);
    }
    setPlayer(nextPlayer);
    if (!nextPlayer) {
      setJoinStatus("idle");
      return;
    }

    const controller = new AbortController();
    statusRequest.current = controller;
    setJoinStatus("loading");
    void fetch(`/api/participations?playerAddress=${encodeURIComponent(nextPlayer)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const parsed = joinStatusResponseSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success || !parsed.data.ok) {
          throw new Error("Could not verify prior join submissions");
        }
        const pending = parsed.data.data.pendingJoinSubmissions.find(
          (submission) => submission.tournamentId === props.tournamentId,
        );
        setPendingSubmission(pending ? { txHash: pending.txHash } : null);
        setJoinStatus("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setPendingSubmission(null);
        setJoinStatus("error");
      });
  }

  async function onJoin() {
    if (!player || joinStatus !== "ready" || submitting || awaitingConfirmation || registered)
      return;
    setErrorMsg(null);
    setRefreshAttempts(0);
    setTransaction(null);
    setPhase("submitting");
    let network: "testnet" | "public" | null = null;

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
      network = built.data.data.network;

      // 2. Sign (Freighter) + submit.
      setPhase("signing");
      const result = await signAndSubmit(
        built.data.data.unsignedXdr,
        "join",
        `/api/tournaments/${props.tournamentId}/submit`,
        props.passphrase,
      );

      // 3. Success — refresh so the participant list / pool updates.
      setTransaction({
        playerAddress: player,
        txHash: result.txHash,
        network,
        status: "confirmed",
      });
      setPhase("success");
      router.refresh();
    } catch (e: unknown) {
      if (
        e instanceof SubmissionError &&
        e.details.retryable === true &&
        e.details.txHash !== undefined
      ) {
        if (network) {
          setTransaction({
            playerAddress: player,
            txHash: e.details.txHash,
            network,
            status: "pending",
          });
        }
        setPhase("awaitingConfirmation");
        return;
      }
      if (e instanceof SubmissionError && e.details.txHash !== undefined && network) {
        setTransaction({
          playerAddress: player,
          txHash: e.details.txHash,
          network,
          status: "failed",
        });
      }
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Join failed");
    }
  }

  function onModalClose() {
    setPhase("idle");
    setErrorMsg(null);
  }

  const receiptHash =
    confirmedParticipant?.txHash ?? activeTransaction?.txHash ?? pendingSubmission?.txHash;
  const receiptNetwork = activeTransaction?.network ?? props.network;
  const transactionUrl = receiptHash
    ? `https://stellar.expert/explorer/${receiptNetwork}/tx/${encodeURIComponent(receiptHash)}`
    : null;

  return (
    <div className="kinetic-glass h-full rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-on-surface">Scan to join</h2>
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

        {!registered && (
          <WalletActionNotice expectedPassphrase={props.passphrase}>
            Freighter transfers the displayed entry fee to this tournament&apos;s escrow.
          </WalletActionNotice>
        )}

        <div data-testid="join-actions" className="flex flex-col items-start gap-3">
          <WalletButton expectedPassphrase={props.passphrase} onConnected={handleConnected} />

          {!registered && (
            <button
              type="button"
              onClick={onJoin}
              disabled={!player || joinStatus !== "ready" || submitting || awaitingConfirmation}
              className="brutalist-border label-caps bg-electric-violet-strong px-6 py-3 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
            >
              Join Tournament
            </button>
          )}
        </div>
        {!registered && (
          <p aria-live="polite" className="text-sm text-on-surface-variant">
            {!player
              ? "Connect Freighter to enable Join Tournament."
              : joinStatus === "loading"
                ? "Checking this wallet for an earlier join submission."
                : joinStatus === "error"
                  ? "Prior join status could not be verified. Re-check the wallet before joining."
                  : awaitingConfirmation
                    ? refreshExhausted
                      ? "Join submitted and still processing. Refresh the status; do not submit another transaction."
                      : "Join submitted and awaiting confirmation. Do not submit another transaction."
                    : submitting
                      ? "Join transaction is waiting for wallet or network confirmation."
                      : "Wallet connected. Join Tournament will request the entry-fee transaction."}
          </p>
        )}
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

      {registered && (
        <section
          className="mt-4 rounded-xl border border-primary p-4"
          aria-labelledby="join-confirmation-heading"
        >
          <h2 id="join-confirmation-heading" className="text-lg font-semibold text-on-surface">
            Registration confirmed
          </h2>
          <p className="data-mono mt-2 text-sm text-on-surface" role="status">
            {formatStroops(props.entryFee)} {props.asset} secured in tournament escrow.
          </p>
          <p className="mt-2 text-xs text-on-surface-variant">
            Next expected deadline: <SettlementDeadline seconds={props.settlementDeadline} />
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {transactionUrl && (
              <a
                href={transactionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="label-caps text-on-surface underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                View transaction receipt
              </a>
            )}
            <Link
              href="/participations"
              className="label-caps text-on-surface underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              View my tournaments
            </Link>
          </div>
        </section>
      )}

      {/* Error display — role="alert" for screen readers */}
      {errorMsg && phase === "error" && (
        <div role="alert" className="mt-3 text-sm text-error">
          <p>{errorMsg}</p>
          {activeTransaction?.status === "failed" && transactionUrl && (
            <a
              href={transactionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              View failed transaction
            </a>
          )}
        </div>
      )}

      {awaitingConfirmation && transactionUrl && (
        <a
          href={transactionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-on-surface underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          View submitted transaction
        </a>
      )}

      <SubmitStateModal
        open={submitting || phase === "success"}
        phase={phase === "awaitingConfirmation" ? "idle" : phase}
        {...(phase === "success" ? { message: "Registration confirmed" } : {})}
        onClose={onModalClose}
      />
    </div>
  );
}
