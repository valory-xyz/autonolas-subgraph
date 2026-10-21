// Polymarket Protocol V2 position ID decoding (pure, no eth_call):
//   [moduleId 8 | baseHash 128 | arity 16 | reserved 64 | resolutionChain 16 | conditionIndex 16 | outcomeIndex 8]
// https://docs.polymarket.com/resources/onchain-position-data
// The condition ID is the position ID without its outcome byte (bytes31).

export type DecodedPositionId = {
  moduleId: number;
  /** bytes31 condition ID, lowercase 0x-hex (62 hex digits). */
  conditionId: string;
  outcomeIndex: number;
};

export function decodePositionId(positionId: bigint): DecodedPositionId {
  const hex = positionId.toString(16).padStart(64, "0");
  return {
    moduleId: parseInt(hex.slice(0, 2), 16),
    conditionId: `0x${hex.slice(0, 62)}`,
    outcomeIndex: parseInt(hex.slice(62), 16),
  };
}

/** bytes31 condition ID -> the right-padded bytes32 form Gamma, the CLOB and the Data API use. */
export function padConditionId(conditionId: string): string {
  return `${conditionId.toLowerCase()}00`;
}
