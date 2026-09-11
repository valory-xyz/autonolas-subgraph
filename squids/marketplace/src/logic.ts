// The pure half of the handlers: id shapes, transaction classification and
// the factory -> payment type / fee unit tables. No store, no network, so
// everything here is unit-testable in isolation (tests/logic.test.ts).

import {
  CHAIN,
  FEE_UNIT_NATIVE,
  FeeUnitName,
  MechFactoryConfig,
} from "./constants";

/**
 * What a handler needs to know about the log it is processing, instead of
 * graph-node's ambient `event`. Addresses are lowercase; timestamps are Unix
 * SECONDS (SQD block headers are ms — see decode.ts).
 */
export interface EventMeta {
  blockNumber: bigint;
  blockTimestamp: bigint;
  txHash: string;
  logIndex: number;
  /** `tx.from` — the subgraph's `event.transaction.from`. Null if not fetched. */
  txFrom: string | null;
  /** `tx.to` — the subgraph's `event.transaction.to`. Null for contract creation or if not fetched. */
  txTo: string | null;
  /** The contract that emitted the log. */
  address: string;
}

// --- Ids ----------------------------------------------------------------

/** Event-log rows and on-chain Deliver rows: `<txHash>-<logIndex>`. */
export function eventId(txHash: string, logIndex: number): string {
  return `${txHash}-${logIndex}`;
}

/**
 * Signed (off-chain) deliveries have no per-request log index of their own
 * on the mech, so the subgraph keyed them `txHash ++ requestId`. Same key,
 * with a separator.
 */
export function signedDeliverId(txHash: string, requestId: string): string {
  return `${txHash}-${requestId}`;
}

export function serviceEntityId(serviceId: bigint): string {
  return serviceId.toString();
}

// --- Classification -----------------------------------------------------

/**
 * The subgraph's `isMarketplaceTransaction`: the outermost tx `to` is the
 * marketplace. Marketplace txs are counted by the marketplace handlers and
 * the mech-side handlers then skip field assignment / counters.
 *
 * Known limitation carried over verbatim: a marketplace call routed through
 * another contract (a Safe `execTransaction`) classifies as "direct"; the
 * write-once guards in the handlers are what keep counters from
 * double-incrementing in that case.
 */
export function isMarketplaceTransaction(txTo: string | null): boolean {
  return txTo != null && txTo.toLowerCase() === CHAIN.mechMarketplace.address;
}

/**
 * Request / delivery payloads that are exactly 32 bytes are a raw IPFS
 * digest and are stored as `ipfsHashBytes`; anything else is skipped with a
 * warning, as in the subgraph. Nothing is fetched from IPFS in this squid.
 */
export function isIpfsPayload(hex: string): boolean {
  return hex.length === 66 && hex.startsWith("0x");
}

// --- Factory tables -----------------------------------------------------

export function factoryConfig(factory: string): MechFactoryConfig | undefined {
  const a = factory.toLowerCase();
  return CHAIN.mechFactories.find((f) => f.address === a);
}

/**
 * Payment type hash from the factory address. THROWS on an unknown factory,
 * exactly like the subgraph: a mech from a factory this table does not know
 * means the code was not updated before the factory went live, and every
 * later event of that mech would be misattributed. The batch fails and the
 * processor crash-loops loudly until the table is fixed (see README,
 * "Adding a mech factory").
 */
export function getPaymentTypeFromFactory(factory: string): string {
  const cfg = factoryConfig(factory);
  if (cfg == null) {
    throw new Error(
      `Unknown mech factory ${factory} on ${CHAIN.name}. Add it to ` +
        `CHAINS.${CHAIN.name}.mechFactories in src/constants.ts before the first ` +
        `mech is created from it.`
    );
  }
  return cfg.paymentType;
}

/**
 * Fee unit from the factory address. Unlike the payment type this does NOT
 * throw — the subgraph falls back to NATIVE with a warning — so the caller
 * gets `null` and decides. In practice getPaymentTypeFromFactory has already
 * thrown for an unknown factory at CreateMech time.
 */
export function getFeeUnitFromFactory(factory: string): FeeUnitName | null {
  return factoryConfig(factory)?.feeUnit ?? null;
}

/** Subgraph fallback for the fee unit when the factory is unknown. */
export const FEE_UNIT_FALLBACK: FeeUnitName = FEE_UNIT_NATIVE;

// --- Small helpers ------------------------------------------------------

export function pushUnique<T>(list: T[], value: T): T[] {
  return list.indexOf(value) === -1 ? [...list, value] : list;
}
