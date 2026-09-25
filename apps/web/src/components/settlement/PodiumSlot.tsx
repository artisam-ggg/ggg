"use client";
import { useState } from "react";

const rankLabel = (rank: number) =>
  `${rank}${rank % 100 >= 11 && rank % 100 <= 13 ? "th" : rank % 10 === 1 ? "st" : rank % 10 === 2 ? "nd" : rank % 10 === 3 ? "rd" : "th"}`;

interface PodiumSlotProps {
  rank: number;
  addr: string | null;
  onAssign: (addr: string) => void;
  onClear: () => void;
}

export function PodiumSlot({ rank, addr, onAssign, onClear }: PodiumSlotProps) {
  const [active, setActive] = useState(false);
  const label = rankLabel(rank);

  return (
    <div
      data-testid={`slot-${rank}`}
      role="group"
      aria-label={`${label} place slot${addr ? `: ${addr.slice(0, 6)}…${addr.slice(-6)} assigned` : ": empty"}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        const dropped = e.dataTransfer.getData("text/plain");
        if (dropped) onAssign(dropped);
      }}
      className={[
        "flex h-28 flex-col items-center justify-center gap-1 rounded-none border-2 p-4 transition-colors",
        active
          ? "border-acid-yellow bg-surface-container-high"
          : addr
            ? "border-electric-violet-strong shadow-[4px_4px_0_0_var(--color-electric-violet-strong)]"
            : "border-dashed border-outline",
      ].join(" ")}
    >
      <span className="label-caps italic text-acid-yellow">{label}</span>
      {addr ? (
        <div className="flex flex-col items-center gap-1">
          <span className="data-mono text-sm text-on-surface">
            {addr.slice(0, 6)}…{addr.slice(-6)}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="label-caps text-xs text-on-surface-variant hover:text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
            aria-label={`Remove ${addr.slice(0, 6)}…${addr.slice(-6)} from ${label}`}
          >
            Remove
          </button>
        </div>
      ) : (
        <span className="data-mono text-sm text-on-surface-variant">drop a player</span>
      )}
    </div>
  );
}
