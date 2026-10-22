// Polymarket Protocol V2 results: BinaryModule ConditionResolved carries a
// payout vector in parts per million (1,000,000 = the whole payout).

/**
 * Winning outcome index of a payout vector: the index of the entry that
 * carries the full 1,000,000, or -1 when no entry does (no single winner),
 * the value QuestionResolution.winningIndex uses for V1 invalid answers.
 */
export function winningOutcomeFromResult(result: readonly bigint[]): bigint {
  throw new Error("not implemented");
}
