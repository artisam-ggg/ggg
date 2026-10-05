"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { WalletActionNotice } from "./WalletActionNotice";
import { PrizeBreakdown } from "./PrizeBreakdown";
import { Button } from "@/components/ui/button";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { Guidelines } from "@/components/ui/Guidelines";
import { fetchTournamentStatus } from "@/lib/tournament-status";
import { signAndSubmit, SubmissionError } from "@/lib/wallet";
import { createTournamentSchema } from "@/lib/validation/tournament";
import { apiResponseSchema } from "@/lib/api";
import {
  calculateDescendingPayoutDistribution,
  calculateEqualPayoutDistribution,
  isValidEscrowDistribution,
} from "@goodgameguild/escrow-sdk";
import { z } from "zod";

// 1 XLM = 10,000,000 stroops (7 decimal places)
const STROOP_FACTOR = 10_000_000n;

/**
 * Regex: positive decimal with at most 7 fractional digits, no leading zeros
 * (except "0.xxx"), must be > 0 (reject "0", "0.0", etc.).
 * Valid examples: "1", "1.5", "0.0000001", "123.4567890" (exactly 7 dec.)
 */
const ENTRY_FEE_REGEX = /^\d+(\.\d{1,7})?$/;
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

const createTournamentResponseSchema = apiResponseSchema(
  z.object({
    tournamentId: z.string().min(1),
    unsignedXdr: z.string().min(1),
    network: z.string(),
  }),
);

const DRAFT_STORAGE_KEY = "ggg:tournament-create-draft";
const toExactBps = (percentage: number) => {
  const scaled = percentage * 100;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : null;
};

const distributionModeSchema = z.enum(["equal", "descending", "custom"]);
type DistributionMode = z.infer<typeof distributionModeSchema>;
type CalculatedDistributionMode = Exclude<DistributionMode, "custom">;

const calculateDistribution = (
  mode: CalculatedDistributionMode,
  firstPlaceBps: number,
  winnerCount: number,
) =>
  mode === "descending"
    ? calculateDescendingPayoutDistribution(firstPlaceBps, winnerCount)
    : calculateEqualPayoutDistribution(firstPlaceBps, winnerCount);

const draftSchema = z.object({
  name: z.string().max(120),
  gameTitle: z.string().max(120),
  entryFee: z.string().max(32),
  asset: z.enum(["XLM", "USDC"]),
  settlementDeadline: z.string().max(32),
  splits: z.array(z.number().min(0.01).max(100)).min(1).max(10),
  distributionMode: distributionModeSchema.default("custom"),
});

type TournamentDraft = z.infer<typeof draftSchema>;

const emptyDraft: TournamentDraft = {
  name: "",
  gameTitle: "",
  entryFee: "",
  asset: "XLM",
  settlementDeadline: "",
  splits: [60, 20, 20],
  distributionMode: "equal",
};

function loadDraft(): TournamentDraft {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    const parsed = draftSchema.safeParse(JSON.parse(raw ?? "null"));
    return parsed.success ? parsed.data : emptyDraft;
  } catch {
    return emptyDraft;
  }
}

function removeStoredDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Browser storage is unavailable.
  }
}

/**
 * Validate an entry-fee string. Returns an error message or null if valid.
 * Rejects: empty, non-numeric, negative, zero, >7 decimal places.
 */
function validateEntryFee(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Entry fee is required";
  if (!ENTRY_FEE_REGEX.test(trimmed)) {
    // Distinguish >7 decimals from other bad input for a clearer message
    if (/^\d+\.\d{8,}$/.test(trimmed)) return "Entry fee must have at most 7 decimal places";
    return "Entry fee must be a positive number (e.g. 1.5)";
  }
  // Reject zero values like "0", "0.0", "0.0000000"
  const [whole = "0", frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  if (BigInt(whole) === 0n && BigInt(fracPadded) === 0n) {
    return "Entry fee must be greater than 0";
  }
  return null;
}

/**
 * Convert a human-readable XLM decimal string (e.g. "1.5") to its integer
 * stroop representation (e.g. "15000000") using only integer math — no floats.
 * Caller MUST validate with validateEntryFee() first.
 */
function xlmToStroops(xlm: string): string {
  const [whole = "0", frac = ""] = xlm.trim().split(".");
  // Pad fractional part to exactly 7 digits (input is already validated to ≤7)
  const fracPadded = (frac + "0000000").slice(0, 7);
  return (BigInt(whole) * STROOP_FACTOR + BigInt(fracPadded)).toString();
}

function transactionExplorerUrl(txHash: string, passphrase: string) {
  const network = passphrase === TESTNET_PASSPHRASE ? "testnet" : "public";
  return `https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(txHash)}`;
}

type Phase = "idle" | "signing" | "submitting" | "awaitingConfirmation" | "success" | "error";
type CoverUploadStatus = "idle" | "uploading" | "failed" | "complete";
type PendingDeployment = {
  tournamentId: string;
  unsignedXdr: string;
  organizerAddress: string;
};

const REFRESH_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const PAYOUT_PRESETS = [
  { label: "Winner takes all", winnerCount: 1, firstPlaceBps: 10_000 },
  { label: "Top 3", winnerCount: 3, firstPlaceBps: 6_000 },
  { label: "Top 4", winnerCount: 4, firstPlaceBps: 5_000 },
  { label: "Top 8", winnerCount: 8, firstPlaceBps: 3_000 },
] as const;

interface CreateTournamentFormProps {
  expectedPassphrase: string;
}

export function CreateTournamentForm({ expectedPassphrase }: CreateTournamentFormProps) {
  // Form state
  const [name, setName] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [asset, setAsset] = useState<"XLM" | "USDC">("XLM");
  const [refereeAddress, setRefereeAddress] = useState("");
  const [organizerAddress, setOrganizerAddress] = useState("");
  const [settlementDeadline, setSettlementDeadline] = useState("");
  const [splits, setSplits] = useState<number[]>([60, 20, 20]);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>("equal");
  const [coverImageKey, setCoverImageKey] = useState<string | undefined>();
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverUploadStatus, setCoverUploadStatus] = useState<CoverUploadStatus>("idle");
  const coverUploadRequest = useRef(0);
  const coverImageInput = useRef<HTMLInputElement>(null);
  const [restored, setRestored] = useState(false);

  // UI state
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorTxHash, setErrorTxHash] = useState<string | null>(null);
  const [pendingDeployment, setPendingDeployment] = useState<PendingDeployment | null>(null);
  const [confirmationAttempts, setConfirmationAttempts] = useState(0);
  const [createdTournamentId, setCreatedTournamentId] = useState<string | null>(null);
  const [entryFeeError, setEntryFeeError] = useState<string | null>(null);
  const [refereeError, setRefereeError] = useState<string | null>(null);
  const hasDraft =
    !!name ||
    !!gameTitle ||
    !!entryFee ||
    !!settlementDeadline ||
    asset !== "XLM" ||
    splits.join(",") !== "60,20,20" ||
    distributionMode !== "equal";

  useEffect(() => {
    const draft = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser-only draft after hydration.
    setName(draft.name);
    setGameTitle(draft.gameTitle);
    setEntryFee(draft.entryFee);
    setAsset(draft.asset);
    setSettlementDeadline(draft.settlementDeadline);
    setSplits(draft.splits);
    setDistributionMode(draft.distributionMode);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;

    // Wallet and upload state are deliberately excluded; both must be provided live.
    const draft = {
      name,
      gameTitle,
      entryFee,
      asset,
      settlementDeadline,
      splits,
      distributionMode,
    };
    if (!hasDraft) {
      removeStoredDraft();
    } else {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // Browser storage is unavailable.
      }
    }
  }, [
    asset,
    distributionMode,
    entryFee,
    gameTitle,
    hasDraft,
    name,
    restored,
    settlementDeadline,
    splits,
  ]);

  const awaitingConfirmation = phase === "awaitingConfirmation";
  const preparedOrganizerMismatch =
    pendingDeployment !== null && pendingDeployment.organizerAddress !== organizerAddress;

  useEffect(() => {
    if (
      !awaitingConfirmation ||
      !pendingDeployment ||
      confirmationAttempts >= REFRESH_DELAYS_MS.length
    ) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void fetchTournamentStatus(pendingDeployment.tournamentId).then((status) => {
        if (cancelled) return;
        if (status === "ACTIVE") {
          removeStoredDraft();
          setPendingDeployment(null);
          setCreatedTournamentId(pendingDeployment.tournamentId);
          setPhase("success");
          return;
        }
        setConfirmationAttempts((attempts) => attempts + 1);
      });
    }, REFRESH_DELAYS_MS[confirmationAttempts]);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [awaitingConfirmation, confirmationAttempts, pendingDeployment]);

  function clearDraft() {
    removeStoredDraft();
    setName("");
    setGameTitle("");
    setEntryFee("");
    setAsset("XLM");
    setRefereeAddress("");
    setSettlementDeadline("");
    setSplits([60, 20, 20]);
    setDistributionMode("equal");
  }

  function calculateSplits(mode: CalculatedDistributionMode, winnerCount: number) {
    const firstPlaceBps = splits.length === 1 ? 5_000 : toExactBps(splits[0]!);
    return calculateDistribution(mode, firstPlaceBps ?? Number.NaN, winnerCount).map(
      (value) => value / 100,
    );
  }

  function changeDistributionMode(mode: DistributionMode) {
    if (mode === "custom") {
      setDistributionMode(mode);
      return;
    }
    try {
      setSplits(calculateSplits(mode, splits.length));
      setDistributionMode(mode);
    } catch {
      // Keep the current values so the inline first-place error remains actionable.
    }
  }

  function changeWinnerCount(winnerCount: number) {
    if (distributionMode === "custom") {
      if (winnerCount === 1) setSplits([100]);
      else if (splits.length === 1) setSplits([50, 50]);
      else if (winnerCount > splits.length) setSplits([...splits, 1]);
      else setSplits(splits.slice(0, winnerCount));
      return;
    }
    try {
      setSplits(calculateSplits(distributionMode, winnerCount));
    } catch {
      // The inline first-place error explains why the rank count cannot change yet.
    }
  }

  function applyPayoutPreset({ winnerCount, firstPlaceBps }: (typeof PAYOUT_PRESETS)[number]) {
    const mode = distributionMode === "custom" ? "equal" : distributionMode;
    setSplits(calculateDistribution(mode, firstPlaceBps, winnerCount).map((share) => share / 100));
    setDistributionMode(mode);
  }

  function changeFirstPlace(value: number) {
    if (!Number.isFinite(value)) {
      setSplits([0, ...splits.slice(1)]);
      return;
    }
    if (distributionMode === "custom") {
      setSplits([value, ...splits.slice(1)]);
      return;
    }
    const firstPlaceBps = toExactBps(value);
    try {
      setSplits(
        calculateDistribution(distributionMode, firstPlaceBps ?? Number.NaN, splits.length).map(
          (share) => share / 100,
        ),
      );
    } catch {
      setSplits([value, ...splits.slice(1)]);
    }
  }

  // Derived values
  const bps = splits.map((s) => Math.round(s * 100));
  const splitSum = bps.reduce((sum, value) => sum + value, 0) / 100;
  const splitValid =
    isValidEscrowDistribution(bps) && splits.every((value) => toExactBps(value) !== null);
  let firstPlaceError: string | null = null;
  try {
    calculateDistribution(
      distributionMode === "descending" ? "descending" : "equal",
      toExactBps(splits[0]!) ?? Number.NaN,
      splits.length,
    );
  } catch {
    const max = (10_000 - (splits.length - 1)) / 100;
    firstPlaceError =
      distributionMode === "descending"
        ? "First place must use at most two decimal places and be at least as large as second place"
        : `First place must use at most two decimal places and be between 0.01% and ${max.toFixed(2)}% for ${splits.length} winners`;
  }

  async function handleCoverUpload(file: File) {
    const request = ++coverUploadRequest.current;
    setError(null);
    setCoverUploadStatus("uploading");
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (request === coverUploadRequest.current && typeof reader.result === "string") {
        setCoverPreviewUrl(reader.result);
      }
    });
    reader.readAsDataURL(file);
    try {
      const form = new FormData();
      form.set("file", file);
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });
      const upload = (await uploadRes.json()) as {
        ok: boolean;
        data?: { key: string };
        error?: { message?: string } | string;
      };
      if (!uploadRes.ok || !upload.ok) {
        throw new Error(
          typeof upload.error === "string"
            ? upload.error
            : (upload.error?.message ?? "Cover image upload failed"),
        );
      }
      if (request === coverUploadRequest.current) {
        setCoverImageKey(upload.data!.key);
        setCoverUploadStatus("complete");
      }
    } catch (err: unknown) {
      if (request === coverUploadRequest.current) {
        reader.abort();
        setCoverPreviewUrl(null);
        setCoverUploadStatus("failed");
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    }
  }

  function removeCoverImage() {
    ++coverUploadRequest.current;
    setCoverImageKey(undefined);
    setCoverPreviewUrl(null);
    setCoverUploadStatus("idle");
    setError(null);
    if (coverImageInput.current) coverImageInput.current.value = "";
  }

  async function submitDeployment(pending: PendingDeployment) {
    if (pending.organizerAddress !== organizerAddress) {
      throw new Error(
        "Connect the organizer wallet that prepared this deployment before retrying.",
      );
    }
    setPhase("signing");
    const submitUrl = `/api/tournaments/${pending.tournamentId}/submit`;
    await signAndSubmit(pending.unsignedXdr, "deploy", submitUrl, expectedPassphrase);

    setPendingDeployment(null);
    removeStoredDraft();
    setCreatedTournamentId(pending.tournamentId);
    setPhase("success");
  }

  function handleDeploymentError(e: unknown) {
    if (e instanceof SubmissionError && e.details.retryable && e.details.txHash) {
      setPhase("awaitingConfirmation");
      setError(null);
      setErrorTxHash(e.details.txHash);
      setConfirmationAttempts(0);
      return;
    }
    setPhase("error");
    setError(e instanceof Error ? e.message : "An unexpected error occurred");
    setErrorTxHash(e instanceof SubmissionError ? (e.details.txHash ?? null) : null);
  }

  async function retryDeployment() {
    if (!pendingDeployment || preparedOrganizerMismatch || awaitingConfirmation) return;
    setError(null);
    setErrorTxHash(null);
    try {
      await submitDeployment(pendingDeployment);
    } catch (e: unknown) {
      handleDeploymentError(e);
    }
  }

  async function refreshDeploymentStatus() {
    if (!pendingDeployment) return;
    if ((await fetchTournamentStatus(pendingDeployment.tournamentId)) === "ACTIVE") {
      removeStoredDraft();
      const tournamentId = pendingDeployment.tournamentId;
      setPendingDeployment(null);
      setCreatedTournamentId(tournamentId);
      setPhase("success");
      return;
    }
    setConfirmationAttempts((attempts) => Math.min(attempts + 1, REFRESH_DELAYS_MS.length));
  }

  async function handleDeploy() {
    setError(null);
    setErrorTxHash(null);
    setRefereeError(null);
    if (coverUploadStatus === "uploading" || coverUploadStatus === "failed") {
      setError("Resolve the cover image upload before deploying.");
      return;
    }

    // Validate entry fee BEFORE any conversion or network call
    const feeError = validateEntryFee(entryFee);
    if (feeError) {
      setEntryFeeError(feeError);
      return;
    }
    setEntryFeeError(null);

    try {
      const entryFeeStroops = xlmToStroops(entryFee);
      const deadlineMs = Date.parse(settlementDeadline);
      if (!Number.isFinite(deadlineMs)) {
        setError("Settlement deadline is required");
        return;
      }
      const localMinute = (ms: number) =>
        new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      const selectedMinute = settlementDeadline.slice(0, 16);
      const offset = new Date(deadlineMs).getTimezoneOffset();
      const ambiguous = [-86_400_000, 86_400_000].some((delta) => {
        const otherOffset = new Date(deadlineMs + delta).getTimezoneOffset();
        const alternative = deadlineMs + (otherOffset - offset) * 60_000;
        return otherOffset !== offset && localMinute(alternative) === selectedMinute;
      });
      if (localMinute(deadlineMs) !== selectedMinute || ambiguous) {
        setError("Choose a local time that is not skipped or repeated by daylight saving.");
        return;
      }

      const payload = {
        name,
        gameTitle,
        entryFee: entryFeeStroops,
        asset,
        refereeAddress,
        organizerAddress,
        settlementDeadline: Math.floor(deadlineMs / 1000),
        distributionBps: bps,
        coverImageKey,
      };

      // Client-side validation
      const parsed = createTournamentSchema.safeParse(payload);
      if (!parsed.success) {
        const refereeIssue = parsed.error.issues.find(
          (issue) => issue.path[0] === "refereeAddress",
        );
        const otherIssue = parsed.error.issues.find((issue) => issue.path[0] !== "refereeAddress");
        if (refereeIssue) {
          setRefereeError(refereeIssue.message);
        }
        setError(otherIssue?.message ?? null);
        return;
      }

      setPhase("submitting");

      const createRes = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (createRes.status === 401 || createRes.status === 403) {
        throw new Error("Your session has ended. Please log in again.");
      }

      const raw = await createRes.text();
      let envelope: ReturnType<typeof createTournamentResponseSchema.safeParse>;
      try {
        envelope = createTournamentResponseSchema.safeParse(JSON.parse(raw));
      } catch {
        throw new Error("Tournament creation failed. Please try again.");
      }
      if (!envelope.success) throw new Error("Tournament creation failed. Please try again.");
      if (!envelope.data.ok) throw new Error(envelope.data.error.message);
      const created = envelope.data.data;
      const pending = {
        tournamentId: created.tournamentId,
        unsignedXdr: created.unsignedXdr,
        organizerAddress,
      };
      setPendingDeployment(pending);
      await submitDeployment(pending);
    } catch (e: unknown) {
      handleDeploymentError(e);
    }
  }

  const fieldClass =
    "w-full rounded-xl bg-surface-container-low border border-outline-variant px-4 py-3 text-on-surface focus:border-electric-violet-strong focus:outline focus:outline-1 focus:outline-electric-violet-strong transition-all focus:scale-[1.01]";
  const labelClass = "mb-2 block text-sm font-medium text-on-surface";
  const monoFieldClass = `${fieldClass} data-mono text-acid-yellow`;

  const isSubmittable =
    !!organizerAddress &&
    !!settlementDeadline &&
    splitValid &&
    coverUploadStatus !== "uploading" &&
    coverUploadStatus !== "failed" &&
    phase === "idle";

  if (phase === "success" && createdTournamentId) {
    const publicTournamentPath = `/tournaments/${encodeURIComponent(createdTournamentId)}`;
    return (
      <section className="kinetic-glass rounded-xl p-8" aria-labelledby="creation-success-title">
        <p className="label-caps text-primary">Tournament created</p>
        <h1
          id="creation-success-title"
          className="mt-2 text-[32px] font-bold -tracking-[0.02em] text-on-surface"
        >
          Your escrow is live
        </h1>
        <p className="mt-3 text-on-surface-variant">
          The deployment is confirmed. Complete these organizer steps before the event starts.
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-6 text-on-surface">
          <li>Open the public tournament and share its Copy tournament link with players.</li>
          <li>Confirm the referee has the correct wallet and knows the settlement deadline.</li>
          <li>Monitor confirmed entrants and the escrow prize pool from the tournament page.</li>
          <li>After results are final, ask the referee to settle the ranked payouts.</li>
        </ol>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href={publicTournamentPath}
            className="brutalist-border label-caps bg-primary px-6 py-3 text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            View public tournament
          </Link>
          <Link
            href="/tournaments"
            className="brutalist-border label-caps px-6 py-3 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
          >
            Organizer dashboard
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form
      className="kinetic-glass rounded-2xl p-6 lg:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        handleDeploy();
      }}
      aria-label="Create tournament"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">
          Create Tournament
        </h1>
        <Guidelines journey="organizer" />
      </div>
      {restored && hasDraft && (
        <div className="mt-4 rounded-xl border border-outline-variant p-4">
          <p className="text-xs leading-relaxed text-on-surface-variant">
            Draft restored. Wallets, cover images, and secrets are never stored.
          </p>
          <button
            type="button"
            onClick={clearDraft}
            className="label-caps mt-2 text-sm text-on-surface-variant underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
          >
            Clear Draft
          </button>
        </div>
      )}
      <div
        className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]"
        data-testid="create-tournament-grid"
      >
        <div>
          {/* Tournament Name */}
          <div>
            <label className={labelClass} htmlFor="name">
              Tournament Name
            </label>
            <input
              id="name"
              type="text"
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              aria-describedby={undefined}
            />
          </div>

          {/* Game Title */}
          <div className="mt-6">
            <label className={labelClass} htmlFor="gameTitle">
              Game Title
            </label>
            <input
              id="gameTitle"
              type="text"
              className={fieldClass}
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          {/* Entry Fee + Asset */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelClass} htmlFor="entryFee">
                Entry Fee ({asset})
              </label>
              <input
                id="entryFee"
                type="text"
                inputMode="decimal"
                className={monoFieldClass}
                value={entryFee}
                onChange={(e) => {
                  setEntryFee(e.target.value);
                  setEntryFeeError(null);
                }}
                placeholder="0.0000000"
                aria-describedby={entryFeeError ? "entry-fee-error" : undefined}
              />
              {entryFeeError && (
                <p id="entry-fee-error" role="alert" className="mt-1 text-sm text-error">
                  {entryFeeError}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="asset">
                Asset
              </label>
              <select
                id="asset"
                className={fieldClass}
                value={asset}
                onChange={(e) => setAsset(e.target.value as "XLM" | "USDC")}
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
          </div>

          {/* Referee Address */}
          <div className="mt-6">
            <label className={labelClass} htmlFor="refereeAddress">
              Referee Wallet Address
            </label>
            <input
              id="refereeAddress"
              type="text"
              className={`${monoFieldClass}${refereeError ? " border-error" : ""}`}
              value={refereeAddress}
              onChange={(e) => {
                setRefereeAddress(e.target.value);
                setRefereeError(null);
              }}
              placeholder="G…"
              required
              aria-invalid={refereeError ? true : undefined}
              aria-describedby={refereeError ? "referee-address-error" : undefined}
            />
            {refereeError && (
              <p id="referee-address-error" role="alert" className="mt-1 text-sm text-error">
                {refereeError}
              </p>
            )}
          </div>

          {/* Settlement Deadline */}
          <div className="mt-6">
            <label className={labelClass} htmlFor="settlementDeadline">
              Settlement Deadline (your local time)
            </label>
            <input
              id="settlementDeadline"
              type="datetime-local"
              className={fieldClass}
              value={settlementDeadline}
              onChange={(e) => setSettlementDeadline(e.target.value)}
              required
              aria-describedby="settlement-deadline-help"
            />
            <p id="settlement-deadline-help" className="mt-1 text-xs text-on-surface-variant">
              Stored on-chain as UTC. Choose 1 hour to 90 days ahead.
            </p>
          </div>

          {/* Prize Split */}
          <fieldset className="mt-8 border-t border-outline-variant pt-6">
            <legend className="pr-3 text-lg font-semibold text-on-surface">Prize Split (%)</legend>
            <div className="mb-4 w-full">
              <label className={labelClass} htmlFor="distributionMode">
                Payout calculation
              </label>
              <select
                id="distributionMode"
                className={fieldClass}
                value={distributionMode}
                onChange={(event) => changeDistributionMode(event.target.value as DistributionMode)}
              >
                <option value="equal">Equal remainder</option>
                <option value="descending">Descending ranked</option>
                <option value="custom">Custom</option>
              </select>
              <p className="mt-1 text-xs text-on-surface-variant">
                Editing a calculated rank switches the payout to Custom.
              </p>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Payout presets">
                {PAYOUT_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPayoutPreset(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {splits.map((split, i) => (
                <div key={i}>
                  <label className={labelClass} htmlFor={`split-${i}`}>
                    {["1st", "2nd", "3rd"][i] ?? `Rank ${i + 1}`} %
                  </label>
                  <input
                    id={`split-${i}`}
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    className={monoFieldClass}
                    value={split}
                    disabled={splits.length === 1}
                    onChange={(e) => {
                      if (i === 0) {
                        changeFirstPlace(e.target.valueAsNumber);
                        return;
                      }
                      const next = [...splits];
                      next[i] = Number(e.target.value);
                      setSplits(next);
                      setDistributionMode("custom");
                    }}
                    aria-describedby={
                      i === 0 && firstPlaceError
                        ? "first-place-error"
                        : !splitValid
                          ? "split-error"
                          : undefined
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                size="lg"
                className="h-11 w-full"
                disabled={splits.length >= 10}
                onClick={() => changeWinnerCount(splits.length + 1)}
              >
                <Plus aria-hidden="true" />
                Add payout rank
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11 w-full border-error text-error hover:bg-error-container hover:text-on-error-container"
                disabled={splits.length <= 1}
                onClick={() => changeWinnerCount(splits.length - 1)}
              >
                <Minus aria-hidden="true" />
                Remove last rank
              </Button>
            </div>
            <p className="data-mono mt-3 text-sm text-on-surface-variant" aria-live="polite">
              {bps.join(" / ")} bps
            </p>
            {splitValid && (
              <div className="mt-4">
                <PrizeBreakdown
                  distributionBps={bps}
                  asset={asset}
                  heading="Configured prize breakdown"
                />
              </div>
            )}
            {splits.length === 1 && (
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                Adding a second payout rank starts both ranks at 50%. You can adjust first place
                afterward.
              </p>
            )}
            {firstPlaceError && (
              <p id="first-place-error" role="alert" className="mt-1 text-sm text-error">
                {firstPlaceError}
              </p>
            )}
            {!splitValid && (
              <p id="split-error" role="alert" className="mt-1 text-sm text-error">
                Split must sum to 100 using hundredths of a percent (currently {splitSum})
              </p>
            )}
          </fieldset>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6" data-testid="deployment-sidebar">
          {/* Cover Image (optional) */}
          <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
            <label className={labelClass} htmlFor="coverImage">
              Cover Image (optional)
            </label>
            <input
              id="coverImage"
              type="file"
              ref={coverImageInput}
              accept="image/png,image/jpeg,image/webp"
              className={fieldClass}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleCoverUpload(file);
                }
              }}
            />
            {coverImageKey && (
              <p className="mt-2 text-xs text-on-surface-variant">Cover uploaded and ready.</p>
            )}
            {coverPreviewUrl && (
              <Image
                src={coverPreviewUrl}
                alt="Tournament cover preview"
                width={640}
                height={240}
                unoptimized
                className="mt-3 aspect-[8/3] w-full rounded-xl object-cover"
              />
            )}
            {coverUploadStatus !== "idle" && (
              <button
                type="button"
                onClick={removeCoverImage}
                className="label-caps mt-2 text-sm text-on-surface-variant underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
              >
                Remove cover image
              </button>
            )}
          </section>

          <section
            className="rounded-xl border border-outline-variant bg-surface-container-low p-5"
            aria-labelledby="tournament-preview-title"
          >
            <p className="label-caps text-primary">Pre-deployment review</p>
            <h2 id="tournament-preview-title" className="mt-1 text-2xl font-bold text-on-surface">
              Public tournament preview
            </h2>
            <p className="mt-2 text-xs text-on-surface-variant">
              Confirm these details before signing in Freighter.
            </p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-on-surface-variant">Tournament</dt>
                <dd className="mt-1 text-on-surface">{name || "Not set"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-on-surface-variant">Game</dt>
                <dd className="mt-1 text-on-surface">{gameTitle || "Not set"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-on-surface-variant">Entry fee</dt>
                <dd className="data-mono mt-1 text-on-surface">
                  {entryFee ? `${entryFee} ${asset}` : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-on-surface-variant">Deadline</dt>
                <dd className="mt-1 text-on-surface">
                  {settlementDeadline
                    ? `${settlementDeadline.replace("T", " ")} local time`
                    : "Not set"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-on-surface-variant">Referee</dt>
                <dd className="data-mono mt-1 break-all text-on-surface">
                  {refereeAddress || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-on-surface-variant">Payout ranks</dt>
                <dd className="mt-1 text-on-surface">
                  {splitValid
                    ? splits.map((split, index) => `#${index + 1} ${split}%`).join(" · ")
                    : "Resolve the payout validation above"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-on-surface-variant">Cover</dt>
                <dd className="mt-1 text-on-surface">
                  {coverUploadStatus === "complete"
                    ? "Uploaded and ready"
                    : coverUploadStatus === "uploading"
                      ? "Uploading"
                      : coverUploadStatus === "failed"
                        ? "Upload needs attention"
                        : "Default tournament cover"}
                </dd>
              </div>
            </dl>
          </section>

          {/* Wallet + Deploy */}
          <section className="rounded-xl border border-primary/40 bg-surface-container-low p-5 shadow-[0_0_24px_rgba(255,190,46,0.06)]">
            <p className="label-caps text-primary">Final step</p>
            <h2 className="mt-1 text-xl font-bold text-on-surface">Review and deploy</h2>
            <div className="mt-4">
              <WalletActionNotice expectedPassphrase={expectedPassphrase}>
                Deploying creates the tournament escrow from the reviewed settings above.
              </WalletActionNotice>
            </div>
            <div className="mt-5 grid gap-3">
              <WalletButton
                expectedPassphrase={expectedPassphrase}
                onConnected={(address) => setOrganizerAddress(address ?? "")}
                buttonClassName="h-12 w-full"
              />
              <button
                type="submit"
                disabled={!isSubmittable}
                className="brutalist-border label-caps h-12 w-full bg-electric-violet-strong px-6 uppercase italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
              >
                Deploy Soroban Contract
              </button>
            </div>

            {/* Inline error */}
            {error && (
              <div role="alert" className="mt-4 text-sm text-error" aria-live="assertive">
                <p>{error}</p>
                {errorTxHash && (
                  <a
                    href={transactionExplorerUrl(errorTxHash, expectedPassphrase)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block underline"
                  >
                    View transaction
                  </a>
                )}
                {pendingDeployment && !awaitingConfirmation && (
                  <button
                    type="button"
                    onClick={() => void retryDeployment()}
                    disabled={preparedOrganizerMismatch}
                    className="label-caps mt-2 block text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
                  >
                    Retry deployment
                  </button>
                )}
              </div>
            )}

            {preparedOrganizerMismatch && !awaitingConfirmation && (
              <p className="mt-4 text-sm text-error" role="alert">
                This deployment was prepared for a different organizer. Connect the original
                organizer wallet before retrying.
              </p>
            )}

            {awaitingConfirmation && pendingDeployment && (
              <div className="mt-4 text-sm text-on-surface-variant" role="status">
                <p>
                  Deployment was submitted and may still confirm. Do not resubmit while its status
                  is being checked.
                </p>
                {errorTxHash && (
                  <a
                    href={transactionExplorerUrl(errorTxHash, expectedPassphrase)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block underline"
                  >
                    View transaction
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void refreshDeploymentStatus()}
                  className="label-caps mt-2 block text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
                >
                  Check deployment status
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Progress modal */}
      <SubmitStateModal
        open={phase === "signing" || phase === "submitting" || phase === "error"}
        phase={phase === "awaitingConfirmation" ? "idle" : phase}
        {...(phase === "error" && error != null ? { message: error } : {})}
        {...(phase === "error"
          ? {
              onClose: () => {
                setPhase("idle");
              },
            }
          : {})}
      />
    </form>
  );
}
