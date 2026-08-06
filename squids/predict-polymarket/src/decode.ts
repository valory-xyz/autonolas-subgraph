// Pure decode-layer helpers, extracted from main.ts so they are unit-testable
// (importing main.ts would start the processor). See tests/decode.test.ts.
import { EventMeta } from "./logic";

/**
 * SQD block header timestamps are Unix MILLISECONDS (evm-stream converts the
 * portal's seconds to ms); entity fields keep the subgraph convention of
 * seconds.
 */
export function eventMeta(
  block: { number: number; timestamp: number },
  log: { transactionHash: string; logIndex: number },
): EventMeta {
  return {
    blockNumber: BigInt(block.number),
    blockTimestamp: BigInt(Math.floor(block.timestamp / 1000)),
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  };
}

/**
 * v1 OrderFilled direction: makerAssetId == 0 means the maker gave USDC and
 * received outcome tokens (BUY); otherwise the maker gave outcome tokens
 * (SELL). The traded outcome token is whichever asset id is non-zero.
 */
export function inferV1Direction(
  makerAssetId: bigint,
  takerAssetId: bigint,
): { isBuying: boolean; outcomeTokenId: bigint } {
  const isBuying = makerAssetId === 0n;
  return {
    isBuying,
    outcomeTokenId: isBuying ? takerAssetId : makerAssetId,
  };
}

/** v2 OrderFilled direction: explicit side param — 0 = BUY, 1 = SELL. */
export function inferV2Direction(side: number | bigint): boolean {
  return Number(side) === 0;
}
