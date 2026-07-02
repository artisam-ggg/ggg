"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

function truncate(v: string): string {
  return v.length > 14 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v;
}

export function ContractAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 1500);
    }
  }

  return (
    <button
      type="button"
      aria-label={`Copy address ${value}`}
      title={copyFailed ? "Copy failed" : undefined}
      onClick={handleCopy}
      className="data-mono inline-flex items-center gap-2 rounded-lg bg-surface-container px-2 py-1 text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
    >
      <span aria-hidden="true">{truncate(value)}</span>

      {copied ? (
        <Check className="h-4 w-4 shrink-0 text-acid-yellow" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4 shrink-0 text-acid-yellow" aria-hidden="true" />
      )}

      {copied && <span className="sr-only">Copied!</span>}
      {copyFailed && <span className="sr-only">Copy failed</span>}
    </button>
  );
}
