export const ONE_DAY = 86400n;

/** UTC-midnight bucket in seconds, the subgraphs' `timestamp / 86400 * 86400`. */
export function dayTimestamp(ts: bigint): bigint {
  return (ts / ONE_DAY) * ONE_DAY;
}

export type EventMeta = {
  blockNumber: bigint;
  /** Unix seconds (SQD block headers carry ms; converted here). */
  blockTimestamp: bigint;
  txHash: string;
  logIndex: number;
  /** Lowercase emitter address. */
  address: string;
  /** Present only when the log's subscription asked for `include: {transaction: true}`. */
  txFrom: string | null;
  txTo: string | null;
};

/**
 * SQD block header timestamps are Unix MILLISECONDS (evm-stream converts the
 * portal's seconds to ms); entity fields keep the subgraph convention of seconds.
 */
export function eventMeta(
  block: { number: number; timestamp: number },
  log: {
    address: string;
    transactionHash: string;
    logIndex: number;
    transaction?: { from?: string; to?: string | null } | null;
  }
): EventMeta {
  const from = log.transaction?.from;
  const to = log.transaction?.to;
  return {
    blockNumber: BigInt(block.number),
    blockTimestamp: BigInt(Math.floor(block.timestamp / 1000)),
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    address: log.address.toLowerCase(),
    txFrom: from == null ? null : from.toLowerCase(),
    txTo: to == null ? null : to.toLowerCase(),
  };
}

/**
 * Number and timestamp (seconds) of the last block in a batch, for the
 * per-squid IndexerStatus row. Null for an empty batch.
 */
export function lastBlock(
  blocks: ReadonlyArray<{ header: { number: number; timestamp: number } }>
): { number: bigint; timestamp: bigint } | null {
  if (blocks.length === 0) return null;
  const h = blocks[blocks.length - 1].header;
  return { number: BigInt(h.number), timestamp: BigInt(Math.floor(Number(h.timestamp) / 1000)) };
}

/** `<txHash>-<logIndex>`, the id scheme for event-log rows across the squids. */
export const logId = (meta: { txHash: string; logIndex: number }): string =>
  `${meta.txHash}-${meta.logIndex}`;
