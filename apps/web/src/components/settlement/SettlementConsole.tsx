"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CandidateCard } from "./CandidateCard";
import { PodiumSlot } from "./PodiumSlot";
import { SettlementModal } from "./SettlementModal";
import { WalletButton } from "@/components/tournament/WalletButton";
import { signAndSubmit } from "@/lib/wallet";
import { BackButton } from "@/components/ui/BackButton";

type Phase = "idle" | "submitting" | "signing" | "error";

type Participant = { playerAddr: string; joinedAt: string };

interface SettlementConsoleProps {
  tournamentId: string;
  refereeAddr: string;
  participants: Participant[];
  passphrase: string;
}

export function SettlementConsole({
  tournamentId,
  refereeAddr,
  participants,
  passphrase,
}: SettlementConsoleProps) {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [slots, setSlots] = useState<[string | null, string | null, string | null]>([
    null,
    null,
    null,
  ]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const assignedSet = new Set(slots.filter((s): s is string => s !== null));

  function assign(rank: 1 | 2 | 3, addr: string) {
    setSlots((prev) => {
      const next = prev.map((s) => (s === addr ? null : s)) as [
        string | null,
        string | null,
        string | null,
      ];
      next[rank - 1] = addr;
      return next;
    });
  }

  function clear(rank: 1 | 2 | 3) {
    setSlots((prev) => {
      const next = [...prev] as [string | null, string | null, string | null];
      next[rank - 1] = null;
      return next;
    });
  }

  const isReferee = wallet !== null && wallet === refereeAddr;
  const allFilled = slots.every((s) => s !== null);
  const allDistinct = new Set(slots).size === 3;
  const ready = isReferee && allFilled && allDistinct;

  async function finalize() {
    setError(null);
    try {
      setPhase("submitting");
      const res = await fetch(`/api/tournaments/${tournamentId}/finalize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wallet-address": wallet!,
        },
        body: JSON.stringify({
          first: slots[0],
          second: slots[1],
          third: slots[2],
        }),
      });
      const built = (await res.json()) as {
        ok: boolean;
        data?: { unsignedXdr: string; network: string };
        error?: string;
      };
      if (!built.ok) {
        throw new Error(built.error ?? "Finalize request failed");
      }

      setPhase("signing");
      await signAndSubmit(
        built.data!.unsignedXdr,
        "finalize",
        `/api/tournaments/${tournamentId}/submit`,
        passphrase,
      );

      router.push(`/tournaments/${tournamentId}`);
    } catch (e: unknown) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Finalization failed");
    }
  }

  const modalOpen = phase === "submitting" || phase === "signing";

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {slots[0] && `1st place: ${slots[0].slice(0, 6)}…${slots[0].slice(-6)}`}
        {slots[1] && ` | 2nd place: ${slots[1].slice(0, 6)}…${slots[1].slice(-6)}`}
        {slots[2] && ` | 3rd place: ${slots[2].slice(0, 6)}…${slots[2].slice(-6)}`}
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Main panel */}
        <section
          className="brutalist-border rounded-none p-8 lg:col-span-8"
          aria-label="Settlement console"
        >
          {/* 👇 Added BackButton */}
          <div className="mb-6">
            <BackButton />
          </div>

          <h1 className="text-[32px] font-bold italic -tracking-[0.02em] text-on-surface">
            Referee Settlement Console
          </h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Referee-only: drag or use keyboard buttons to assign 1st, 2nd, and 3rd place.
          </p>

          {/* Podium slots */}
          <div className="mt-6 grid grid-cols-3 gap-4" aria-label="Podium positions">
            {([1, 2, 3] as const).map((r) => (
              <PodiumSlot
                key={r}
                rank={r}
                addr={slots[r - 1] ?? null}
                onAssign={(addr) => assign(r, addr)}
                onClear={() => clear(r)}
              />
            ))}
          </div>

          {/* Wallet connect + finalize */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <WalletButton expectedPassphrase={passphrase} onConnected={setWallet} />
            <button
              type="button"
              disabled={!ready}
              onClick={finalize}
              className="brutalist-border label-caps bg-electric-violet-strong px-8 py-4 italic text-background shadow-[4px_4px_0_0_var(--color-acid-yellow)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
              aria-describedby={!ready ? "finalize-hint" : undefined}
            >
              Finalize Payouts
            </button>
          </div>

          {/* Hints and errors */}
          {!ready && (
            <p id="finalize-hint" className="mt-3 text-sm text-on-surface-variant">
              {!wallet && "Connect referee wallet to enable finalization."}
              {wallet && !isReferee && "Connected wallet is not the referee for this tournament."}
              {wallet &&
                isReferee &&
                (!allFilled || !allDistinct) &&
                "Assign 3 distinct participants to all podium slots to enable finalization."}
            </p>
          )}

          {wallet && !isReferee && (
            <p className="mt-3 text-error" role="alert">
              Connected wallet is not the referee for this tournament.
            </p>
          )}

          {error && (
            <p className="mt-3 text-error" role="alert">
              {error}
            </p>
          )}
        </section>

        {/* Candidates sidebar */}
        <aside
          className="glass-panel rounded-xl p-6 lg:col-span-4"
          aria-label="Candidate participants"
        >
          <p className="label-caps text-on-surface-variant">Candidates</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Drag a card onto a slot, or use the Assign buttons.
          </p>
          <div className="mt-4 flex flex-col gap-3" role="list" aria-label="Participants">
            {participants.map((p) => (
              <div key={p.playerAddr} role="listitem">
                <CandidateCard
                  addr={p.playerAddr}
                  used={assignedSet.has(p.playerAddr)}
                  onAssign={(rank) => assign(rank, p.playerAddr)}
                />
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Full-screen signing/submitting overlay */}
      <SettlementModal
        open={modalOpen}
        phase={phase === "error" ? "error" : phase === "signing" ? "signing" : "submitting"}
        errorMessage={error}
      />
    </>
  );
}
