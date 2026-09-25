import { formatStroops } from "@/lib/format-stroops";

type ConfirmedPayout = {
  rank: number;
  amount: string;
};

function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const remainder = bps % 100;
  return remainder === 0 ? `${whole}%` : `${whole}.${remainder.toString().padStart(2, "0")}%`;
}

function formatInteger(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function estimatedPayouts(pool: string, distributionBps: readonly number[]): bigint[] {
  const total = BigInt(pool);
  const amounts = distributionBps.map((bps) => (total * BigInt(bps)) / 10_000n);
  const distributed = amounts.reduce((sum, amount) => sum + amount, 0n);
  if (amounts[0] !== undefined) amounts[0] += total - distributed;
  return amounts;
}

export function PrizeBreakdown({
  distributionBps,
  asset,
  pool,
  confirmedPayouts,
  heading = "Prize breakdown",
}: {
  distributionBps: readonly number[];
  asset: "XLM" | "USDC";
  pool?: string;
  confirmedPayouts?: readonly ConfirmedPayout[];
  heading?: string;
}) {
  const totalBps = distributionBps.reduce((sum, bps) => sum + bps, 0);
  const confirmedByRank = new Map(
    confirmedPayouts?.map((payout) => [payout.rank, BigInt(payout.amount)]) ?? [],
  );
  const estimates = pool === undefined ? null : estimatedPayouts(pool, distributionBps);
  const isSettled = confirmedPayouts !== undefined;
  const hasConfirmedPayouts = (confirmedPayouts?.length ?? 0) > 0;

  return (
    <section
      aria-labelledby="prize-breakdown-heading"
      className="rounded-xl bg-surface-container p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="prize-breakdown-heading" className="label-caps text-on-surface">
          {heading}
        </h2>
        <p className="data-mono text-xs text-on-surface-variant">
          {formatInteger(totalBps)} BPS total ({formatBps(totalBps)})
        </p>
      </div>

      <p className="mt-2 text-sm text-on-surface-variant">
        {hasConfirmedPayouts
          ? "Confirmed on-chain payouts"
          : isSettled
            ? "Payout confirmation is syncing"
            : estimates
              ? "Estimated from the current confirmed prize pool"
              : "Amounts appear when a prize pool is available"}
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Prize distribution by rank">
        {distributionBps.map((bps, index) => {
          const rank = index + 1;
          const amount = isSettled ? confirmedByRank.get(rank) : estimates?.[index];
          return (
            <li
              key={rank}
              className="flex min-w-0 items-center justify-between gap-3 border-l-2 border-electric-violet px-3 py-2"
            >
              <span className="label-caps text-on-surface-variant">Rank {rank}</span>
              <span className="text-right">
                <span className="data-mono block text-on-surface">{formatBps(bps)}</span>
                {amount !== undefined && (
                  <span className="data-mono block text-sm text-acid-yellow">
                    {formatStroops(amount.toString())} {asset}
                  </span>
                )}
                {isSettled && amount === undefined && (
                  <span className="block text-xs text-on-surface-variant">
                    Awaiting confirmation
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
