import { Trophy, Medal, Award } from "lucide-react";

type Winner = {
  rank: number;
  playerAddr: string;
  amount: string;
  txHash: string | null;
  explorerUrl: string | null;
};

/** Convert a stroop string to human-readable decimal (7 decimal places). */
function fmt(stroops: string): string {
  const n = BigInt(stroops);
  return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`;
}

export function WinnersPanel({ winners, asset }: { winners: Winner[]; asset: "XLM" | "USDC" }) {
  // Dynamic rendering helper for the Lucide SVGs based on placement rank
  const renderRankIcon = (rank: number) => {
    const baseClass = "h-5 w-5 shrink-0";

    switch (rank) {
      case 1:
        // 1st Place - Acid Yellow Trophy
        return <Trophy className={`${baseClass} text-acid-yellow`} aria-label="1st Place Trophy" />;
      case 2:
        // 2nd Place - Dull Silver/Variant Medal
        return (
          <Medal className={`${baseClass} text-on-surface-variant`} aria-label="2nd Place Medal" />
        );
      case 3:
        // 3rd Place - Bronze Award Badge
        return <Award className={`${baseClass} text-amber-700`} aria-label="3rd Place Ribbon" />;
      default:
        // Fallback badge for multi-tier rankings
        return (
          <Award className={`${baseClass} text-on-surface-variant`} aria-label="Winner Ribbon" />
        );
    }
  };

  return (
    <div className="brutalist-border brutalist-border-active rounded-none p-6">
      <p className="label-caps italic text-acid-yellow">Settlement Complete</p>
      <ul className="mt-4 flex flex-col gap-3" aria-label="Tournament winners">
        {winners.map((w) => (
          <li
            key={w.rank}
            data-testid="payout-row"
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-3">
              {/* Renders clean, standalone inline SVG directly without custom stylesheets */}
              {renderRankIcon(w.rank)}

              <span className="data-mono text-on-surface">
                {w.playerAddr.slice(0, 6)}…{w.playerAddr.slice(-6)}
              </span>
            </span>
            <span className="flex items-center gap-4">
              <span className="data-mono text-acid-yellow">
                {fmt(w.amount)} {asset}
              </span>
              {w.explorerUrl && (
                <a
                  href={w.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="explorer-link"
                  className="label-caps text-electric-violet underline"
                  aria-label={`View rank ${w.rank} transaction on explorer`}
                >
                  Explorer
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
