const TOTAL_BPS = 10_000;
const MAX_WINNERS = 10;

export const isValidEscrowDistribution = (values: unknown): values is number[] =>
  Array.isArray(values) &&
  values.length >= 1 &&
  values.length <= MAX_WINNERS &&
  values.every((value) => Number.isInteger(value) && value > 0 && value <= TOTAL_BPS) &&
  values.reduce((sum, value) => sum + value, 0) === TOTAL_BPS;

/** Divide the BPS remaining after first place equally, assigning extra BPS by rank. */
export function calculateEqualPayoutDistribution(
  firstPlaceBps: number,
  winnerCount: number,
): number[] {
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > MAX_WINNERS) {
    throw new RangeError("Winner count must be an integer from 1 to 10");
  }
  if (winnerCount === 1) return [TOTAL_BPS];
  if (!Number.isInteger(firstPlaceBps)) {
    throw new RangeError("First place must be a whole number of basis points");
  }

  const remaining = TOTAL_BPS - firstPlaceBps;
  const otherRanks = winnerCount - 1;
  if (firstPlaceBps <= 0 || remaining < otherRanks) {
    throw new RangeError("First place must leave at least one basis point for every other rank");
  }

  const equalShare = Math.floor(remaining / otherRanks);
  const extraBps = remaining % otherRanks;
  return [
    firstPlaceBps,
    ...Array.from({ length: otherRanks }, (_, index) => equalShare + (index < extraBps ? 1 : 0)),
  ];
}

/** Divide the BPS remaining after first place using descending rank weights. */
export function calculateDescendingPayoutDistribution(
  firstPlaceBps: number,
  winnerCount: number,
): number[] {
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > MAX_WINNERS) {
    throw new RangeError("Winner count must be an integer from 1 to 10");
  }
  if (winnerCount === 1) return [TOTAL_BPS];
  if (!Number.isInteger(firstPlaceBps)) {
    throw new RangeError("First place must be a whole number of basis points");
  }

  const remaining = TOTAL_BPS - firstPlaceBps;
  const otherRanks = winnerCount - 1;
  if (firstPlaceBps <= 0 || remaining < otherRanks) {
    throw new RangeError("First place must leave at least one basis point for every other rank");
  }

  const weightTotal = (otherRanks * (otherRanks + 1)) / 2;
  let shares = Array.from({ length: otherRanks }, (_, index) =>
    Math.floor((remaining * (otherRanks - index)) / weightTotal),
  );
  if (shares.includes(0)) {
    // Extremely small remainders still reserve one BPS for every winning rank.
    const distributable = remaining - otherRanks;
    shares = shares.map(
      (_, index) => 1 + Math.floor((distributable * (otherRanks - index)) / weightTotal),
    );
  }

  const extraBps = remaining - shares.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < extraBps; index += 1) shares[index]! += 1;

  return [firstPlaceBps, ...shares];
}
