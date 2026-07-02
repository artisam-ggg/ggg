"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { ensureWallet } from "@/lib/wallet";

interface WalletButtonProps {
  expectedPassphrase: string;
  onConnected: (address: string) => void;
}

export function WalletButton({ expectedPassphrase, onConnected }: WalletButtonProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  if (address) {
    return (
      <span
        className="data-mono inline-flex items-center gap-2 rounded-full border-2 border-acid-yellow px-3 py-1 text-acid-yellow"
        aria-label={`Wallet ${address}`}
      >
        <Wallet className="h-4 w-4 shrink-0 text-acid-yellow" aria-hidden="true" />
        {address.slice(0, 6)}…{address.slice(-5)}
      </span>
    );
  }

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const a = await ensureWallet(expectedPassphrase);
      setAddress(a);
      onConnected(a);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={connecting}
        onClick={handleConnect}
        className="label-caps rounded-lg bg-acid-yellow px-4 py-2 text-on-secondary-fixed transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong disabled:opacity-50"
      >
        {connecting ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-on-secondary-fixed border-t-transparent motion-reduce:animate-none"
              role="status"
              aria-label="Loading wallet"
            />
            Connecting…
          </span>
        ) : (
          "Connect Wallet"
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
