"use client";

import { useState } from "react";

export function CopyTournamentLink({ url }: { url: string }) {
  const [feedback, setFeedback] = useState<"copied" | "error" | null>(null);

  async function copy() {
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("copied");
    } catch {
      setFeedback("error");
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className="label-caps text-xs text-electric-violet underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
      >
        Copy tournament link
      </button>
      {feedback === "copied" && (
        <span role="status" className="text-xs text-on-surface-variant">
          Link copied
        </span>
      )}
      {feedback === "error" && (
        <span role="alert" className="text-xs text-error">
          Could not copy tournament link
        </span>
      )}
    </span>
  );
}
