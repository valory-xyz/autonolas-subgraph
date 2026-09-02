// Brier primitives are pure bigint math; a scale or sign slip here would
// silently skew every daily brierSum, so pin the fixed-point semantics.
import { describe, expect, it } from "vitest";
import {
  actualForOutcome,
  brierContribution,
  computeImpliedProbability,
} from "../src/brier";
import { HALF_PROBABILITY_SCALE, PROBABILITY_SCALE } from "../src/constants";

const USDC = (n: number) => BigInt(n) * 1_000_000n;
const P = (tenths: number) => (BigInt(tenths) * PROBABILITY_SCALE) / 10n;

describe("computeImpliedProbability", () => {
  it("is amount / shares scaled to 1e18 (0.4 USDC per share -> 4e17)", () => {
    expect(computeImpliedProbability(USDC(40), USDC(100))).toBe(P(4));
  });

  it("takes absolutes so negative sell amounts yield a positive price", () => {
    expect(computeImpliedProbability(-USDC(60), -USDC(100))).toBe(P(6));
  });

  it("returns the zero sentinel for a zero-share fill", () => {
    expect(computeImpliedProbability(USDC(1), 0n)).toBe(0n);
  });

  it("does not clamp above 1e18", () => {
    expect(computeImpliedProbability(USDC(120), USDC(100))).toBe(P(12));
  });
});

describe("brierContribution", () => {
  it("scores (p - actual)^2 at 1e18 scale", () => {
    expect(brierContribution(P(4), PROBABILITY_SCALE)).toBe(P(36) / 10n); // 0.36
    expect(brierContribution(P(4), 0n)).toBe(P(16) / 10n); // 0.16
    expect(brierContribution(P(4), HALF_PROBABILITY_SCALE)).toBe(P(1) / 10n); // 0.01
  });
});

describe("actualForOutcome", () => {
  it("is 1 for the winning index, 0 otherwise, 0.5 when invalid (-1)", () => {
    expect(actualForOutcome(1n, 1n)).toBe(PROBABILITY_SCALE);
    expect(actualForOutcome(0n, 1n)).toBe(0n);
    expect(actualForOutcome(0n, -1n)).toBe(HALF_PROBABILITY_SCALE);
    expect(actualForOutcome(1n, -1n)).toBe(HALF_PROBABILITY_SCALE);
  });
});
