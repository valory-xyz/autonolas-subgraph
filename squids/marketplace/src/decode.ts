// Decode helpers used by the dispatch loop.
//
// These live outside main.ts because main.ts calls run(...) at module scope:
// importing it from a test would start the real processor.

import * as marketplaceV1 from "./abi/MechMarketplaceV1/events";
import * as marketplaceV2 from "./abi/MechMarketplaceV2/events";
import * as factoryNative from "./abi/MechFactoryFixedPriceNative/events";
import * as factoryToken from "./abi/MechFactoryFixedPriceToken/events";
import * as factoryTokenUsdc from "./abi/MechFactoryFixedPriceTokenUSDC/events";
import * as factoryNvmNative from "./abi/MechFactoryNvmSubscriptionNative/events";
import * as factoryNvmUsdc from "./abi/MechFactoryNvmSubscriptionTokenUSDC/events";

/**
 * Event metadata is the shared helper's (ms -> s, lowercase addresses,
 * transaction fields when the subscription included the transaction).
 */
export { eventMeta } from "@olas/squid-shared";

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

// --- MechMarketplace V1 / V2 ------------------------------------------------

/**
 * The marketplace ABI a block was emitted under: V1 up to and including
 * `v1EndBlock` (the subgraph's MechMarketplaceV1 `endBlock`), V2 after.
 */
export function marketplaceAbiAt(blockNumber: number, v1EndBlock: number | null) {
  return v1EndBlock != null && blockNumber <= v1EndBlock ? marketplaceV1 : marketplaceV2;
}

/** Topics of the marketplace subscription for one ABI generation. */
export function marketplaceTopics(abi: typeof marketplaceV1 | typeof marketplaceV2): string[] {
  return [
    abi.CreateMech.topic,
    abi.MarketplaceRequest.topic,
    abi.MarketplaceDelivery.topic,
    abi.MarketplaceDeliveryWithSignatures.topic,
    abi.Deliver.topic, // signed (off-chain) per-request delivery
  ];
}

export type MarketplaceEvent =
  | { kind: "CreateMech"; mech: string; serviceId: bigint; mechFactory: string }
  | {
      kind: "MarketplaceRequest";
      priorityMech: string;
      requester: string;
      numRequests: bigint;
      requestIds: string[];
    }
  | {
      kind: "MarketplaceDelivery";
      deliveryMech: string;
      numDeliveries: bigint;
      requestIds: string[];
      deliveredRequests: boolean[];
    }
  | {
      kind: "MarketplaceDeliveryWithSignatures";
      deliveryMech: string;
      requester: string;
      numDeliveries: bigint;
      requestIds: string[];
    }
  | {
      kind: "Deliver";
      mech: string;
      mechServiceMultisig: string;
      requestId: string;
      deliveryRate: bigint;
      deliveryData: string;
    };

const lower = (s: string) => s.toLowerCase();

/**
 * Decode a MechMarketplace log with the ABI of its block. The two
 * generations differ in `MarketplaceRequest` (V2 adds `requestDatas`) and
 * `Deliver` (V1 `data` vs V2 `requestData` + `deliveryData`) — different
 * topic0s — and in `MarketplaceDelivery`, where V1 indexes `requesters`
 * under the SAME topic0 (one more topic). None of the differing fields is
 * read. Null for a topic the subgraph does not handle.
 */
export function decodeMarketplaceLog(
  log: { topics: string[]; data: string },
  blockNumber: number,
  v1EndBlock: number | null
): MarketplaceEvent | null {
  const abi = marketplaceAbiAt(blockNumber, v1EndBlock);
  const topic0 = log.topics[0];
  if (topic0 === abi.CreateMech.topic) {
    const e = abi.CreateMech.decode(log);
    return { kind: "CreateMech", mech: lower(e.mech), serviceId: e.serviceId, mechFactory: lower(e.mechFactory) };
  }
  if (topic0 === abi.MarketplaceRequest.topic) {
    const e = abi.MarketplaceRequest.decode(log);
    return {
      kind: "MarketplaceRequest",
      priorityMech: lower(e.priorityMech),
      requester: lower(e.requester),
      numRequests: e.numRequests,
      requestIds: e.requestIds.map(lower),
    };
  }
  if (topic0 === abi.MarketplaceDelivery.topic) {
    const e = abi.MarketplaceDelivery.decode(log);
    return {
      kind: "MarketplaceDelivery",
      deliveryMech: lower(e.deliveryMech),
      numDeliveries: e.numDeliveries,
      requestIds: e.requestIds.map(lower),
      deliveredRequests: [...e.deliveredRequests],
    };
  }
  if (topic0 === abi.MarketplaceDeliveryWithSignatures.topic) {
    const e = abi.MarketplaceDeliveryWithSignatures.decode(log);
    return {
      kind: "MarketplaceDeliveryWithSignatures",
      deliveryMech: lower(e.deliveryMech),
      requester: lower(e.requester),
      numDeliveries: e.numDeliveries,
      requestIds: e.requestIds.map(lower),
    };
  }
  if (abi === marketplaceV1 && topic0 === marketplaceV1.Deliver.topic) {
    const e = marketplaceV1.Deliver.decode(log);
    return {
      kind: "Deliver",
      mech: lower(e.mech),
      mechServiceMultisig: lower(e.mechServiceMultisig),
      requestId: lower(e.requestId),
      deliveryRate: e.deliveryRate,
      deliveryData: lower(e.data),
    };
  }
  if (abi === marketplaceV2 && topic0 === marketplaceV2.Deliver.topic) {
    const e = marketplaceV2.Deliver.decode(log);
    return {
      kind: "Deliver",
      mech: lower(e.mech),
      mechServiceMultisig: lower(e.mechServiceMultisig),
      requestId: lower(e.requestId),
      deliveryRate: e.deliveryRate,
      deliveryData: lower(e.deliveryData),
    };
  }
  return null;
}

// --- Mech factories ---------------------------------------------------------

/**
 * Factory creation events by Solidity name. All five carry the same fields
 * (mech, serviceId, maxDeliveryRate); each name is its own topic0.
 */
export const FACTORY_EVENTS = {
  CreateMechFixedPriceNative: factoryNative.CreateMechFixedPriceNative,
  CreateMechFixedPriceToken: factoryToken.CreateMechFixedPriceToken,
  CreateMechFixedPriceTokenUSDC: factoryTokenUsdc.CreateMechFixedPriceTokenUSDC,
  CreateMechNvmSubscriptionNative: factoryNvmNative.CreateMechNvmSubscriptionNative,
  CreateMechNvmSubscriptionTokenUSDC: factoryNvmUsdc.CreateMechNvmSubscriptionTokenUSDC,
} as const;

export type FactoryEventName = keyof typeof FACTORY_EVENTS;

export function factoryEvent(name: string) {
  const ev = (FACTORY_EVENTS as Record<string, (typeof FACTORY_EVENTS)[FactoryEventName]>)[name];
  if (ev == null) throw new Error(`Unknown mech factory event ${name}`);
  return ev;
}

/** Decode a factory creation log by topic0; null for any other topic. */
export function decodeFactoryLog(
  log: { topics: string[]; data: string }
): { mech: string; serviceId: bigint; maxDeliveryRate: bigint } | null {
  for (const ev of Object.values(FACTORY_EVENTS)) {
    if (log.topics[0] === ev.topic) {
      const e = ev.decode(log);
      return { mech: lower(e.mech), serviceId: e.serviceId, maxDeliveryRate: e.maxDeliveryRate };
    }
  }
  return null;
}
