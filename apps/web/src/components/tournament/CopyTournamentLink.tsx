"use client";

import { useEffect, useRef, useState } from "react";

export function CopyTournamentLink({ url }: { url: string }) {
  const [feedback, setFeedback] = useState<"copied" | "error" | null>(null);
  const latestCopy = useRef(0);

  useEffect(() => {
    if (feedback !== "copied") return;
    const timer = setTimeout(() => setFeedback(null), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function copy() {
    const request = ++latestCopy.current;
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(url);
      if (request === latestCopy.current) setFeedback("copied");
    } catch {
      if (request === latestCopy.current) setFeedback("error");
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
      <span role="status" aria-live="polite" className="text-xs text-on-surface-variant">
        {feedback === "copied" ? "Link copied" : ""}
      </span>
      {feedback === "error" && (
        <span role="alert" className="text-xs text-error">
          Could not copy tournament link
        </span>
      )}
    </span>
  );
}
