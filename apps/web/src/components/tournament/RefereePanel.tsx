"use client";
import Link from "next/link";
import { useState } from "react";
import { Guidelines } from "@/components/ui/Guidelines";
import { WalletButton } from "./WalletButton";

type State = "idle" | "match" | "mismatch";

export function RefereePanel({
  tournamentId,
  refereeAddr,
  passphrase,
}: {
  tournamentId: string;
  refereeAddr: string;
  passphrase: string;
}) {
  const [state, setState] = useState<State>("idle");

  return (
    <div className="kinetic-glass rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-on-surface">Referee</h2>
      <div className="mt-3">
        <Guidelines journey="referee" />
      </div>

      <div className="mt-4">
        <WalletButton
          expectedPassphrase={passphrase}
          onConnected={(address) => {
            if (address === null) setState("idle");
            else setState(address === refereeAddr ? "match" : "mismatch");
          }}
        />
      </div>

      {state === "match" ? (
        <Link
          href={`/tournaments/${tournamentId}/settle`}
          className="brutalist-border label-caps mt-4 inline-block bg-electric-violet-strong px-6 py-3 italic text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          Open Settlement Console
        </Link>
      ) : null}

      {state === "mismatch" && (
        <p className="mt-3 text-error" role="alert">
          Connected wallet is not the referee for this tournament.
        </p>
      )}

      {(state === "idle" || state === "match") && (
        <p aria-live="polite" className="mt-3 text-sm text-on-surface-variant">
          {state === "match"
            ? "Configured referee wallet verified. Settlement Console is available."
            : "Connect the configured referee wallet to open Settlement Console."}
        </p>
      )}
    </div>
  );
}
