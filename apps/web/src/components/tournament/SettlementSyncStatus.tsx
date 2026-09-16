"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5_000;

export function SettlementSyncStatus() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <section
      aria-label="Winners"
      aria-live="polite"
      className="brutalist-border brutalist-border-active rounded-none p-6"
    >
      <p className="label-caps italic text-acid-yellow">Settlement Processing</p>
      <p className="mt-4 text-sm text-on-surface-variant">
        Winner and payout data is still syncing from the confirmed settlement. This page will
        refresh automatically.
      </p>
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
