"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit } from "@/lib/wallet";
import { createTournamentSchema } from "@/lib/validation/tournament";
import { apiResponseSchema } from "@/lib/api";
import { z } from "zod";

// 1 XLM = 10,000,000 stroops (7 decimal places)
const STROOP_FACTOR = 10_000_000n;

/**
 * Regex: positive decimal with at most 7 fractional digits, no leading zeros
 * (except "0.xxx"), must be > 0 (reject "0", "0.0", etc.).
 * Valid examples: "1", "1.5", "0.0000001", "123.4567890" (exactly 7 dec.)
 */
const ENTRY_FEE_REGEX = /^\d+(\.\d{1,7})?$/;

const uploadResponseSchema = apiResponseSchema(
  z.object({ uploadUrl: z.string().url(), key: z.string().min(1) }),
);
const createTournamentResponseSchema = apiResponseSchema(
  z.object({
    tournamentId: z.string().min(1),
    unsignedXdr: z.string().min(1),
    network: z.string(),
  }),
);

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

type Phase = "idle" | "signing" | "submitting" | "initializing" | "success" | "error";

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
  const [splits, setSplits] = useState<[number, number, number]>([60, 30, 10]);
  const [coverImageKey, setCoverImageKey] = useState<string | undefined>();

  // UI state
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [entryFeeError, setEntryFeeError] = useState<string | null>(null);

  // Derived values
  const bps = splits.map((s) => s * 100) as [number, number, number];
  const splitSum = splits[0] + splits[1] + splits[2];
  const splitValid = splitSum === 100;

  async function handleCoverUpload(file: File) {
    setError(null);
    const presignRes = await fetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
    });
    const presign = uploadResponseSchema.safeParse(await presignRes.json());
    if (!presign.success || !presign.data.ok)
      throw new Error(
        presign.success && !presign.data.ok ? presign.data.error.message : "Upload presign failed",
      );

    const putRes = await fetch(presign.data.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    if (!putRes.ok) throw new Error(`Cover image upload failed (HTTP ${putRes.status})`);

    setCoverImageKey(presign.data.data.key);
  }

  async function handleDeploy() {
    setError(null);

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
        setError(parsed.error.issues[0]?.message ?? "Invalid form input");
        return;
      }

      setPhase("submitting");

      const createRes = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await createRes.text();
      let created: { tournamentId: string; unsignedXdr: string; network: string };
      try {
        const envelope = createTournamentResponseSchema.safeParse(JSON.parse(raw));
        if (!envelope.success) throw new Error("Invalid API response");
        if (!envelope.data.ok) throw new Error(envelope.data.error.message);
        created = envelope.data.data;
      } catch (error) {
        if (
          createRes.status !== 401 &&
          createRes.status !== 403 &&
          error instanceof Error &&
          error.message !== "Invalid API response"
        )
          throw error;
        throw new Error(
          createRes.status === 401 || createRes.status === 403
            ? "Your session has ended. Please log in again."
            : "Tournament creation failed. Please try again.",
        );
      }
      if (createRes.status === 401 || createRes.status === 403)
        throw new Error("Your session has ended. Please log in again.");

      setPhase("signing");

      const submitUrl = `/api/tournaments/${created.tournamentId}/submit`;
      const deployRes = await signAndSubmit(
        created.unsignedXdr,
        "deploy",
        submitUrl,
        expectedPassphrase,
      );

      // The escrow Wasm has no Soroban constructor, so deploy only creates the
      // contract — the organiser must sign a second `initialize` transaction to
      // set its state before anyone can join. Do it under the same action.
      if (deployRes.initializeXdr) {
        setPhase("initializing");
        await signAndSubmit(deployRes.initializeXdr, "initialize", submitUrl, expectedPassphrase);
      }

      setPhase("success");
      router.push(`/tournaments/${created.tournamentId}`);
    } catch (e: unknown) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "An unexpected error occurred");
    }
  }

  const fieldClass =
    "w-full rounded-xl bg-surface-container-low border border-outline-variant px-4 py-3 text-on-surface focus:border-electric-violet-strong focus:outline focus:outline-1 focus:outline-electric-violet-strong transition-all focus:scale-[1.01]";
  const labelClass = "label-caps block mb-2 text-on-surface-variant";
  const monoFieldClass = `${fieldClass} data-mono text-acid-yellow`;

  const isSubmittable =
    !!organizerAddress && !!settlementDeadline && splitValid && phase === "idle";

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
          className={monoFieldClass}
          value={refereeAddress}
          onChange={(e) => setRefereeAddress(e.target.value)}
          placeholder="G…"
          required
        />
      </div>

      {/* Settlement Deadline */}
      <div className="mt-6">
        <label className={labelClass} htmlFor="settlementDeadline">
          Settlement Deadline
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
          Choose a time at least one hour and no more than 90 days away. It is stored on-chain as
          UTC.
        </p>
      </div>

      {/* Prize Split */}
      <fieldset className="mt-6">
        <legend className={labelClass}>Prize Split (%)</legend>
        <div className="grid grid-cols-3 gap-4">
          {(["1st", "2nd", "3rd"] as const).map((rank, i) => (
            <div key={rank}>
              <label className={labelClass} htmlFor={`split-${i}`}>
                {rank} %
              </label>
              <input
                id={`split-${i}`}
                type="number"
                min={0}
                max={100}
                className={monoFieldClass}
                value={splits[i]}
                onChange={(e) => {
                  const next = [...splits] as [number, number, number];
                  next[i] = Number(e.target.value);
                  setSplits(next);
                }}
                aria-describedby={!splitValid ? "split-error" : undefined}
              />
            </div>
          ))}
        </div>
        <p className="data-mono mt-3 text-sm text-on-surface-variant" aria-live="polite">
          {bps[0]} / {bps[1]} / {bps[2]} bps
        </p>
        {!splitValid && (
          <p id="split-error" role="alert" className="mt-1 text-sm text-error">
            Split must sum to 100 (currently {splitSum})
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
          accept="image/png,image/jpeg,image/webp"
          className={fieldClass}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleCoverUpload(file).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Upload failed");
              });
            }
          }}
        />
        {coverImageKey && (
          <p className="data-mono mt-1 text-xs text-on-surface-variant">
            Uploaded: {coverImageKey}
          </p>
        )}
      </div>

      {/* Wallet + Deploy */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <WalletButton expectedPassphrase={expectedPassphrase} onConnected={setOrganizerAddress} />
        <button
          type="submit"
          disabled={!isSubmittable}
          className="brutalist-border label-caps bg-electric-violet-strong px-8 py-4 uppercase italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          Deploy Soroban Contract
        </button>
      </div>

      {/* Inline error */}
      {error && (
        <p role="alert" className="mt-4 text-sm text-error" aria-live="assertive">
          {error}
        </p>
      )}

      {/* Progress modal */}
      <SubmitStateModal
        open={
          phase === "signing" ||
          phase === "submitting" ||
          phase === "initializing" ||
          phase === "error"
        }
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
