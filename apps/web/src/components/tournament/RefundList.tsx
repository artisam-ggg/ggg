// SERVER COMPONENT — no "use client" directive.
// Pure server render from props; lists claims made available by cancellation.

import { formatStroops } from "@/lib/format-stroops";

type Participant = { playerAddr: string; joinedAt: string };

function trunc(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

/**
 * Cancellation makes one entry-fee refund claim available to every participant.
 */
export function RefundList({
  participants,
  entryFee,
  asset,
}: {
  participants: Participant[];
  entryFee: string;
  asset: "XLM" | "USDC";
}) {
  if (participants.length === 0) {
    return (
      <p className="mt-4 text-sm text-on-surface-variant">
        No players had joined, so no refund claims are available.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="label-caps text-error">Registered players ({participants.length})</p>
      <p className="mt-2 text-sm text-on-surface-variant">
        Each registered player may claim {formatStroops(entryFee)} {asset} to their registered
        wallet.
      </p>
      <ul className="mt-3 flex flex-col gap-2" aria-label="Refund claims">
        {participants.map((p) => (
          <li
            key={p.playerAddr}
            data-testid="refund-row"
            className="flex items-center justify-between gap-4"
          >
            <span className="data-mono text-on-surface">{trunc(p.playerAddr)}</span>
            <span className="data-mono text-error">
              {formatStroops(entryFee)} {asset}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
