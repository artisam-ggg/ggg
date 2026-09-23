import { describe, expect, it } from "vitest";
import {
  calculateDescendingPayoutDistribution,
  calculateEqualPayoutDistribution,
  isValidEscrowDistribution,
} from "../src/distribution.js";

describe("calculateEqualPayoutDistribution", () => {
  it("fixes one-winner tournaments at 100%", () => {
    expect(calculateEqualPayoutDistribution(1, 1)).toEqual([10_000]);
  });

  it("divides the remainder equally among several winners", () => {
    expect(calculateEqualPayoutDistribution(6_000, 3)).toEqual([6_000, 2_000, 2_000]);
  });

  it("assigns indivisible basis points in rank order", () => {
    expect(calculateEqualPayoutDistribution(5_000, 4)).toEqual([5_000, 1_667, 1_667, 1_666]);
  });

  it.each([
    [6_000.5, 3],
    [0, 3],
    [9_999, 3],
    [5_000, 0],
    [5_000, 11],
  ])("rejects invalid first-place BPS or winner counts", (firstPlaceBps, winnerCount) => {
    expect(() => calculateEqualPayoutDistribution(firstPlaceBps, winnerCount)).toThrow(RangeError);
  });

  it("always returns a valid distribution", () => {
    expect(isValidEscrowDistribution(calculateEqualPayoutDistribution(5_001, 10))).toBe(true);
  });
});

describe("calculateDescendingPayoutDistribution", () => {
  it("fixes one-winner tournaments at 100%", () => {
    expect(calculateDescendingPayoutDistribution(1, 1)).toEqual([10_000]);
  });

  it("uses descending weights for five winners", () => {
    expect(calculateDescendingPayoutDistribution(6_000, 5)).toEqual([
      6_000, 1_600, 1_200, 800, 400,
    ]);
    expect(calculateDescendingPayoutDistribution(5_000, 5)).toEqual([
      5_000, 2_000, 1_500, 1_000, 500,
    ]);
  });

  it("assigns indivisible basis points to higher ranks", () => {
    expect(calculateDescendingPayoutDistribution(6_000, 4)).toEqual([6_000, 2_001, 1_333, 666]);
  });

  it("keeps every winner positive when only the minimum remainder is available", () => {
    expect(calculateDescendingPayoutDistribution(9_991, 10)).toEqual([
      9_991, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])(
    "returns a valid strictly descending remainder for %i winners",
    (winnerCount) => {
      const distribution = calculateDescendingPayoutDistribution(6_000, winnerCount);
      expect(isValidEscrowDistribution(distribution)).toBe(true);
      expect(
        distribution
          .slice(1)
          .every((value, index, values) => index === 0 || value < values[index - 1]!),
      ).toBe(true);
    },
  );

  it.each([
    [6_000.5, 3],
    [0, 3],
    [9_999, 3],
    [5_000, 0],
    [5_000, 11],
  ])("rejects invalid inputs (%s, %s)", (firstPlaceBps, winnerCount) => {
    expect(() => calculateDescendingPayoutDistribution(firstPlaceBps, winnerCount)).toThrow(
      RangeError,
    );
  });
});
