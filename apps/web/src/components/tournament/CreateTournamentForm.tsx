"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { Button } from "@/components/ui/button";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit, SubmissionError } from "@/lib/wallet";
import { createTournamentSchema } from "@/lib/validation/tournament";
import { apiResponseSchema } from "@/lib/api";
import {
  calculateEqualPayoutDistribution,
  isValidEscrowDistribution,
} from "@ggg/escrow-sdk/distribution";
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

const draftSchema = z
  .object({
    name: z.string().max(120),
    gameTitle: z.string().max(120),
    entryFee: z.string().max(32),
    asset: z.enum(["XLM", "USDC"]),
    refereeAddress: z.string().max(56),
    settlementDeadline: z.string().max(32),
    splits: z.array(z.number().min(0.01).max(100)).min(1).max(10),
  })
  .refine(({ splits }) => {
    const bps = splits.map(toExactBps);
    return bps.every((value) => value !== null) && isValidEscrowDistribution(bps);
  });

type TournamentDraft = z.infer<typeof draftSchema>;

const emptyDraft: TournamentDraft = {
  name: "",
  gameTitle: "",
  entryFee: "",
  asset: "XLM",
  refereeAddress: "",
  settlementDeadline: "",
  splits: [60, 30, 10],
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

type Phase = "idle" | "signing" | "submitting" | "success" | "error";
type CoverUploadStatus = "idle" | "uploading" | "failed" | "complete";
type PendingDeployment = { tournamentId: string; unsignedXdr: string };

interface CreateTournamentFormProps {
  expectedPassphrase: string;
}

export function CreateTournamentForm({ expectedPassphrase }: CreateTournamentFormProps) {
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [asset, setAsset] = useState<"XLM" | "USDC">("XLM");
  const [refereeAddress, setRefereeAddress] = useState("");
  const [organizerAddress, setOrganizerAddress] = useState("");
  const [settlementDeadline, setSettlementDeadline] = useState("");
  const [splits, setSplits] = useState<number[]>([60, 30, 10]);
  const [coverImageKey, setCoverImageKey] = useState<string | undefined>();
  const [coverUploadStatus, setCoverUploadStatus] = useState<CoverUploadStatus>("idle");
  const coverUploadRequest = useRef(0);
  const coverImageInput = useRef<HTMLInputElement>(null);
  const [restored, setRestored] = useState(false);

  // UI state
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorTxHash, setErrorTxHash] = useState<string | null>(null);
  const [pendingDeployment, setPendingDeployment] = useState<PendingDeployment | null>(null);
  const [entryFeeError, setEntryFeeError] = useState<string | null>(null);
  const [refereeError, setRefereeError] = useState<string | null>(null);
  const hasDraft =
    !!name ||
    !!gameTitle ||
    !!entryFee ||
    !!refereeAddress ||
    !!settlementDeadline ||
    asset !== "XLM" ||
    splits.join(",") !== "60,30,10";

  useEffect(() => {
    const draft = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser-only draft after hydration.
    setName(draft.name);
    setGameTitle(draft.gameTitle);
    setEntryFee(draft.entryFee);
    setAsset(draft.asset);
    setRefereeAddress(draft.refereeAddress);
    setSettlementDeadline(draft.settlementDeadline);
    setSplits(draft.splits);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;

    // Wallet and upload state are deliberately excluded; both must be fetched live.
    const draft = { name, gameTitle, entryFee, asset, refereeAddress, settlementDeadline, splits };
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
    entryFee,
    gameTitle,
    hasDraft,
    name,
    refereeAddress,
    restored,
    settlementDeadline,
    splits,
  ]);

  function clearDraft() {
    removeStoredDraft();
    setName("");
    setGameTitle("");
    setEntryFee("");
    setAsset("XLM");
    setRefereeAddress("");
    setSettlementDeadline("");
    setSplits([60, 30, 10]);
  }

  function changeWinnerCount(winnerCount: number) {
    const firstPlaceBps = splits.length === 1 ? 5_000 : toExactBps(splits[0]!);
    try {
      setSplits(
        calculateEqualPayoutDistribution(firstPlaceBps ?? Number.NaN, winnerCount).map(
          (value) => value / 100,
        ),
      );
    } catch {
      // The inline first-place error explains why the rank count cannot change yet.
    }
  }

  function changeFirstPlace(value: number) {
    if (!Number.isFinite(value)) {
      setSplits([0, ...splits.slice(1)]);
      return;
    }
    const firstPlaceBps = toExactBps(value);
    try {
      setSplits(
        calculateEqualPayoutDistribution(firstPlaceBps ?? Number.NaN, splits.length).map(
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
    isValidEscrowDistribution(bps) &&
    splits.every((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6);
  let firstPlaceError: string | null = null;
  try {
    calculateEqualPayoutDistribution(toExactBps(splits[0]!) ?? Number.NaN, splits.length);
  } catch {
    const max = (10_000 - (splits.length - 1)) / 100;
    firstPlaceError = `First place must use at most two decimal places and be between 0.01% and ${max.toFixed(2)}% for ${splits.length} winners`;
  }

  async function handleCoverUpload(file: File) {
    const request = ++coverUploadRequest.current;
    setError(null);
    setCoverUploadStatus("uploading");
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
        setCoverUploadStatus("failed");
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    }
  }

  function removeCoverImage() {
    ++coverUploadRequest.current;
    setCoverImageKey(undefined);
    setCoverUploadStatus("idle");
    setError(null);
    if (coverImageInput.current) coverImageInput.current.value = "";
  }

  async function submitDeployment(pending: PendingDeployment) {
    setPhase("signing");
    const submitUrl = `/api/tournaments/${pending.tournamentId}/submit`;
    await signAndSubmit(pending.unsignedXdr, "deploy", submitUrl, expectedPassphrase);

    setPendingDeployment(null);
    removeStoredDraft();
    setPhase("success");
    router.push(`/tournaments/${pending.tournamentId}`);
  }

  function handleDeploymentError(e: unknown) {
    setPhase("error");
    setError(e instanceof Error ? e.message : "An unexpected error occurred");
    setErrorTxHash(e instanceof SubmissionError ? (e.details.txHash ?? null) : null);
  }

  async function retryDeployment() {
    if (!pendingDeployment) return;
    setError(null);
    setErrorTxHash(null);
    try {
      await submitDeployment(pendingDeployment);
    } catch (e: unknown) {
      handleDeploymentError(e);
    }
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
      };
      setPendingDeployment(pending);
      await submitDeployment(pending);
    } catch (e: unknown) {
      handleDeploymentError(e);
    }
  }

  const fieldClass =
    "w-full rounded-xl bg-surface-container-low border border-outline-variant px-4 py-3 text-on-surface focus:border-electric-violet-strong focus:outline focus:outline-1 focus:outline-electric-violet-strong transition-all focus:scale-[1.01]";
  const labelClass = "label-caps block mb-2 text-on-surface-variant";
  const monoFieldClass = `${fieldClass} data-mono text-acid-yellow`;

  const isSubmittable =
    !!organizerAddress &&
    !!settlementDeadline &&
    splitValid &&
    coverUploadStatus !== "uploading" &&
    coverUploadStatus !== "failed" &&
    phase === "idle";

  return (
    <form
      className="kinetic-glass rounded-2xl p-8"
      onSubmit={(e) => {
        e.preventDefault();
        handleDeploy();
      }}
      aria-label="Create tournament"
    >
      <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">
        Create Tournament
      </h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        Deploy a Soroban escrow contract for your tournament.
      </p>
      {/* Tournament Name */}
      <div className="mt-8">
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
        <p id="settlement-deadline-help" className="mt-1 text-sm text-on-surface-variant">
          Enter the date and time in your local timezone. The matching UTC instant is stored
          on-chain. Choose a time at least one hour and no more than 90 days away.
        </p>
      </div>

      {/* Prize Split */}
      <fieldset className="mt-6">
        <legend className={labelClass}>Prize Split (%)</legend>
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
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            size="lg"
            className="h-11 w-full sm:w-auto"
            disabled={splits.length >= 10}
            onClick={() => changeWinnerCount(splits.length + 1)}
          >
            <Plus aria-hidden="true" />
            Add payout rank
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="h-11 w-full sm:w-auto"
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

      {/* Cover Image (optional) */}
      <div className="mt-6">
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
          <p className="data-mono mt-1 text-xs text-on-surface-variant">
            Uploaded: {coverImageKey}
          </p>
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
      </div>

      {/* Wallet + Deploy */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <WalletButton
          expectedPassphrase={expectedPassphrase}
          onConnected={(address) => setOrganizerAddress(address ?? "")}
        />
        <button
          type="submit"
          disabled={!isSubmittable}
          className="brutalist-border label-caps bg-electric-violet-strong px-8 py-4 uppercase italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          Deploy Soroban Contract
        </button>
        {hasDraft && (
          <button
            type="button"
            onClick={clearDraft}
            className="brutalist-border label-caps px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
          >
            Clear Draft
          </button>
        )}
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
          {pendingDeployment && (
            <button
              type="button"
              onClick={() => void retryDeployment()}
              className="label-caps mt-2 block text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
            >
              Retry deployment
            </button>
          )}
        </div>
      )}

      {/* Progress modal */}
      <SubmitStateModal
        open={phase === "signing" || phase === "submitting" || phase === "error"}
        phase={phase}
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
