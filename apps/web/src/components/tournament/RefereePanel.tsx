"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ensureWallet } from "@/lib/wallet";
import { captureWalletConnected } from "@/lib/analytics";

type State = "idle" | "match" | "mismatch" | "error";

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
  const lastCapturedAddress = useRef<string | null>(null);

  async function handleVerify() {
    setState("idle");
    try {
      const address = await ensureWallet(passphrase);
      if (address !== lastCapturedAddress.current) {
        lastCapturedAddress.current = address;
        captureWalletConnected(address);
      }
      // Stellar G-addresses are case-sensitive — exact match required
      setState(address === refereeAddr ? "match" : "mismatch");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="violet-accent rounded-xl bg-surface-container p-6">
      <p className="label-caps text-electric-violet">Referee</p>

      {state === "match" ? (
        <Link
          href={`/tournaments/${tournamentId}/settle`}
          className="brutalist-border label-caps mt-4 inline-block bg-electric-violet-strong px-6 py-3 italic text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          Open Settlement Console
        </Link>
      ) : (
        <button
          type="button"
          className="label-caps mt-4 rounded-lg border-2 border-outline px-4 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
          onClick={handleVerify}
        >
          Verify Referee Wallet
        </button>
      )}

      {state === "mismatch" && (
        <p className="mt-3 text-error" role="alert">
          Connected wallet is not the referee for this tournament.
        </p>
      )}

      {state === "error" && (
        <p className="mt-3 text-error" role="alert">
          Failed to connect wallet. Please try again.
        </p>
      )}
    </div>
  );
}
