"use client";

import { AlertTriangle } from "lucide-react";

type ModalPhase = "signing" | "submitting" | "error";

interface SettlementModalProps {
  open: boolean;
  phase: ModalPhase;
  errorMessage?: string | null;
}

const phaseLabel: Record<ModalPhase, string> = {
  signing: "SIGNING…",
  submitting: "SUBMITTING…",
  error: "FAILED",
};

export function SettlementModal({ open, phase, errorMessage }: SettlementModalProps) {
  if (!open) return null;

  const isError = phase === "error";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isError ? "Settlement failed" : "Finalizing payouts"}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/85 backdrop-blur-md"
    >
      {/* Acid spinning ring — hidden on error; respects prefers-reduced-motion via global CSS */}
      {!isError && (
        <div
          aria-hidden="true"
          className="h-20 w-20 animate-spin rounded-full border-4 border-outline-variant border-t-acid-yellow motion-reduce:animate-none"
        />
      )}

      {isError && <AlertTriangle className="h-12 w-12 text-error shrink-0" aria-hidden="true" />}

      <p
        className={["label-caps mt-6 italic", isError ? "text-error" : "text-acid-yellow"].join(
          " ",
        )}
        role="status"
        aria-live="polite"
      >
        {isError ? (errorMessage ?? phaseLabel.error) : phaseLabel[phase]}
      </p>
    </div>
  );
}
