"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5_000;
const MAX_REFRESH_ATTEMPTS = (15 * 60 * 1_000) / REFRESH_INTERVAL_MS;

export function SettlementSyncStatus({ contractUrl }: { contractUrl: string | null }) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const exhausted = attempts >= MAX_REFRESH_ATTEMPTS;

  useEffect(() => {
    if (exhausted) return;
    const interval = setInterval(() => {
      setAttempts((current) => current + 1);
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [exhausted, router]);

  return (
    <section
      aria-label="Winners"
      aria-live="polite"
      className="brutalist-border brutalist-border-active rounded-none p-6"
    >
      <p className="label-caps italic text-acid-yellow">
        {exhausted ? "Settlement Sync Needs Attention" : "Settlement Processing"}
      </p>
      <p className="mt-4 text-sm text-on-surface-variant">
        {exhausted
          ? "Winner data did not sync automatically. Retry now or verify the contract on Stellar Explorer."
          : "Winner and payout data is still syncing from the confirmed settlement. This page will refresh automatically."}
      </p>
      {exhausted && contractUrl && (
        <a
          href={contractUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="label-caps mt-4 block text-electric-violet underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          View contract on Stellar Explorer ↗
        </a>
      )}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="brutalist-border label-caps mt-4 bg-electric-violet-strong px-4 py-2 italic text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
      >
        Retry winner sync
      </button>
    </section>
  );
}
