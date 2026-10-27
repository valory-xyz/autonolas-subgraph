// Protocol V2 payout vectors (BinaryModule ConditionResolved, parts per
// million) -> winning outcome index.
import { expect, it } from "vitest";
import { winningOutcomeFromResult } from "../src/resolution";

it.each([
  // recorded on Polygon: YES won, NO won, 50/50
  [[1_000_000n, 0n], 0n],
  [[0n, 1_000_000n], 1n],
  [[500_000n, 500_000n], -1n],
  // the full entry wins wherever it sits
  [[0n, 0n, 1_000_000n], 2n],
])("maps [%s] to outcome %s", (result, expected) => {
  expect(winningOutcomeFromResult(result)).toBe(expected);
});
