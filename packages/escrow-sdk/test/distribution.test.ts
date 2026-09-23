import { describe, expect, it } from "vitest";
import {
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
