// Polymarket Protocol V2 position ID decoding. STUB: to be implemented.
//   [moduleId 8 | baseHash 128 | arity 16 | reserved 64 | resolutionChain 16 | conditionIndex 16 | outcomeIndex 8]
// https://docs.polymarket.com/resources/onchain-position-data

export type DecodedPositionId = {
  moduleId: number;
  /** bytes31 condition ID, lowercase 0x-hex (62 hex digits). */
  conditionId: string;
  outcomeIndex: number;
};

export function decodePositionId(_positionId: bigint): DecodedPositionId {
  throw new Error("not implemented");
}

/** bytes31 condition ID -> the right-padded bytes32 form Gamma, the CLOB and the Data API use. */
export function padConditionId(_conditionId: string): string {
  throw new Error("not implemented");
}
