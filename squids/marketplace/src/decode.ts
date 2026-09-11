// Decode helpers used by the dispatch loop.
//
// These live outside main.ts because main.ts calls run(...) at module scope:
// importing it from a test would start the real processor.

import { EventMeta } from "./logic";

const lc = (s: string | undefined | null): string | null =>
  s == null ? null : s.toLowerCase();

/**
 * SQD block header timestamps are Unix MILLISECONDS (evm-stream converts the
 * portal's seconds to ms); entity fields keep the subgraph convention of
 * seconds.
 *
 * `log.transaction` is only present on logs whose subscription asked for
 * `include: {transaction: true}` (processor.ts); the marketplace and mech
 * subscriptions do, because `Mech.owner`, direct-path `Request.sender` and
 * the marketplace-vs-direct classification all come from the transaction.
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
  return {
    blockNumber: BigInt(block.number),
    blockTimestamp: BigInt(Math.floor(block.timestamp / 1000)),
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    txFrom: lc(log.transaction?.from),
    txTo: lc(log.transaction?.to),
    address: log.address.toLowerCase(),
  };
}

/**
 * Decode a log from an ADDRESS-LESS subscription, returning null when the
 * log is not actually the event we mean.
 *
 * The mech-side events (`Request`, `Deliver`, `MaxDeliveryRateUpdated`) are
 * subscribed by topic with no address filter — SQD has no graph-node
 * templates, and mech addresses are only known once `CreateMech` fires.
 * topic0 is keccak of the event signature, and indexed-ness is NOT part of
 * that signature, so an unrelated contract with a same-named event but a
 * different indexed layout produces the same topic0 with a different topic
 * count; the decoder rightly rejects it, and that must not kill the batch.
 *
 * Only shape mismatches are swallowed. Any other failure propagates so a
 * genuine decoding bug still crashes the batch rather than dropping data.
 */
export function decodeForeign<T>(
  event: { decode(log: any): T },
  log: any
): T | null {
  try {
    // Called as a method: the decoder reads `this.topicCount`, so a bare
    // function reference would lose its receiver.
    return event.decode(log);
  } catch (err) {
    if ((err as { name?: string })?.name === "DecodingError") return null;
    throw err;
  }
}
