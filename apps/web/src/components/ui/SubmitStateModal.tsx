"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";

type Phase = "idle" | "signing" | "submitting" | "initializing" | "success" | "error";

interface SubmitStateModalProps {
  open: boolean;
  phase: Phase;
  message?: string;
  onClose?: () => void;
}

const phaseLabel: Record<Phase, string> = {
  idle: "",
  signing: "SIGNING…",
  submitting: "SUBMITTING…",
  initializing: "INITIALISING…",
  success: "SETTLED",
  error: "FAILED",
};

const phaseAriaLabel: Record<Phase, string> = {
  idle: "Transaction",
  signing: "Signing transaction",
  submitting: "Submitting transaction",
  initializing: "Initialising contract",
  success: "Transaction settled",
  error: "Transaction failed",
};

export function SubmitStateModal({ open, phase, message, onClose }: SubmitStateModalProps) {
  if (!open) return null;

  const label = phase === "error" ? (message ?? "FAILED") : phaseLabel[phase];
  const isDone = phase === "success" || phase === "error";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={phaseAriaLabel[phase]}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
    >
      {/* Spinner — hidden on success/error, respects prefers-reduced-motion via globals.css */}
      {!isDone && (
        <div
          aria-hidden="true"
          className="h-16 w-16 animate-spin rounded-full border-4 border-outline-variant border-t-acid-yellow motion-reduce:animate-none"
        />
      )}

      {phase === "success" && (
        <CheckCircle2 className="h-12 w-12 text-acid-yellow shrink-0" aria-hidden="true" />
      )}

      {phase === "error" && (
        <AlertTriangle className="h-12 w-12 text-error shrink-0" aria-hidden="true" />
      )}

      <p
        className={`label-caps mt-6 ${phase === "error" ? "text-error" : "text-acid-yellow"}`}
        role="status"
        aria-live="polite"
      >
        {label}
      </p>

      {/* Close button only shown when done */}
      {isDone && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="label-caps mt-6 rounded-lg border-2 border-outline px-4 py-2 text-on-surface transition-colors hover:border-acid-yellow hover:text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
        >
          Close
        </button>
      )}
    </div>
  );
}
