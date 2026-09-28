"use client";

import { UserCircle } from "lucide-react";

interface CandidateCardProps {
  addr: string;
  used: boolean;
  ranks?: number[];
  onAssign: (rank: number) => void;
}

const rankLabel = (rank: number) => ["1st", "2nd", "3rd"][rank - 1] ?? `rank ${rank}`;

export function CandidateCard({ addr, used, ranks = [1, 2, 3], onAssign }: CandidateCardProps) {
  const shortAddress = `${addr.slice(0, 6)}…${addr.slice(-6)}`;
  return (
    <div
      draggable={!used}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", addr);
        event.dataTransfer.effectAllowed = "move";
      }}
      data-addr={addr}
      aria-label={`Participant ${shortAddress}`}
      className={`brutalist-border flex flex-col gap-2 rounded-none bg-surface-container p-3 ${used ? "opacity-30 grayscale" : "cursor-grab"}`}
    >
      <div className="flex items-center gap-3">
        <UserCircle className="h-5 w-5 shrink-0 text-on-surface-variant" aria-hidden="true" />
        <span className="data-mono text-on-surface">{shortAddress}</span>
      </div>
      {!used && (
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={`Assign ${shortAddress} to rank`}
        >
          {ranks.map((rank) => (
            <button
              key={rank}
              type="button"
              onClick={() => onAssign(rank)}
              className="label-caps rounded-none border border-outline px-2 py-1 text-xs text-on-surface-variant hover:border-acid-yellow hover:text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
              aria-label={`Assign ${rankLabel(rank)} to ${shortAddress}`}
            >
              Assign {rankLabel(rank)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
