// Brier-score primitives (same fixed-point semantics as predict-omen). Pure
// bigint math so they are unit-testable — see tests/brier.test.ts.
import { HALF_PROBABILITY_SCALE, PROBABILITY_SCALE } from "./constants";

const abs = (x: bigint) => (x < 0n ? -x : x);

/**
 * Per-token price of a fill, 1e18-scaled. Sells are stored with negative
 * amount/shares, so both are taken absolute. Zero shares -> 0 sentinel.
 * Not clamped: an above-1e18 price is a real (mispriced) fill and is scored as such.
 */
export function computeImpliedProbability(
  amount: bigint,
  shares: bigint,
): bigint {
  if (shares === 0n) return 0n;
  return (abs(amount) * PROBABILITY_SCALE) / abs(shares);
}

/** (p - actual)^2 / 1e18, both inputs 1e18-scaled. */
export function brierContribution(
  impliedProbability: bigint,
  actual: bigint,
): bigint {
  const diff = impliedProbability - actual;
  return (diff * diff) / PROBABILITY_SCALE;
}

/**
 * Resolved value of a bet's outcome, 1e18-scaled. `winningOutcome === -1n`
 * is the invalid/unresolvable market (payouts split evenly) -> 0.5.
 */
export function actualForOutcome(
  betOutcomeIndex: bigint,
  winningOutcome: bigint,
): bigint {
  if (winningOutcome === -1n) return HALF_PROBABILITY_SCALE;
  return betOutcomeIndex === winningOutcome ? PROBABILITY_SCALE : 0n;
}
