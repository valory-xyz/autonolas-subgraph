// Restart-on-new-Safe ingestion.
//
// Every subgraph handler is gated on a tracked Safe, so instead of the
// chain-wide USDC/WETH Transfer streams and topic-only Safe events the
// squid asks the portal for exactly the tracked safes' logs:
//
// - ServiceRegistryL2 RegisterInstance / CreateMultisigWithAgents;
// - Transfer on any address with topic1 or topic2 = a service safe: the 13
//   tracked tokens, plus v2 LP and NFPM NFTs sent from or to a Safe outside a
//   Safe transaction (studio's pool templates see every LP Transfer); dispatch
//   drops tokens no handler tracks;
// - Safe events emitted by an address that has a Safe instance;
// - the Aerodrome v2 and Aero v2 PoolFactory PoolCreated and the Aero
//   GaugeManager GaugeCreated, chain-wide (few logs; they decide which pools
//   are tracked and which gauge pays an Aero v2 pool).
//
// The Transfer and Safe requests include every log of their transactions
// (`transactionLogs`). Agents act through their Safe's execTransaction, so
// that carries the NFPM, pool, gauge and LiFi events the position handlers
// read without streaming those contracts chain-wide; an agent position
// event outside a Safe or tracked-token transaction is not seen.
//
// The address lists come from the database (Service, SafeDataSource) when
// a stream starts. `cutAtSpawn` ends the stream right after the first block
// that registers a new Basius service; block.ts fetches that block's missing
// logs, and main.ts starts a new stream with the new safes subscribed.

import type { LogRequest } from "@subsquid/evm-stream";
import * as registry from "./abi/ServiceRegistryL2/events";
import { addressTopic } from "./block";
import * as gaugeManager from "./abi/AeroGaugeManager/events";
import * as aeroFactory from "./abi/AeroV2PoolFactory/events";
import * as poolFactory from "./abi/PoolFactory/events";
import {
  AERO_GAUGE_MANAGER,
  AERO_V2_STABLE_FACTORY,
  AERO_V2_VOLATILE_FACTORY,
  BASIUS_AGENT_ID,
  EXCLUDED_SERVICE_IDS,
  SERVICE_REGISTRY,
  START_BLOCKS,
  VELO_V2_FACTORY,
} from "./constants";
import { SAFE_TOPICS, TRANSFER_TOPIC } from "./dispatch";

export interface Tracked {
  /** Service ids (decimal) with an agentId-115 ServiceRegistration. */
  basiusServiceIds: Set<bigint>;
  /** Service entity ids (service safes). */
  serviceSafes: Set<string>;
  /** SafeDataSource ids (service and operator safes). */
  safeHosts: Set<string>;
}

export const emptyTracked = (): Tracked => ({
  basiusServiceIds: new Set(),
  serviceSafes: new Set(),
  safeHosts: new Set(),
});

/** `Bytes.fromUTF8(serviceId.toString())` hex back to the id. */
export const serviceIdFromKey = (key: string): bigint =>
  BigInt(Buffer.from(key.slice(2), "hex").toString("utf8"));

/** A log request, with the block it starts at when that is not the start block. */
export type LogQuery = LogRequest & { from?: number };

export function logQueries(tracked: Tracked): LogQuery[] {
  const queries: LogQuery[] = [
    {
      where: {
        address: [SERVICE_REGISTRY],
        topic0: [registry.RegisterInstance.topic, registry.CreateMultisigWithAgents.topic],
      },
    },
    { where: { address: [VELO_V2_FACTORY], topic0: [poolFactory.PoolCreated.topic] } },
    {
      where: { address: [AERO_V2_VOLATILE_FACTORY, AERO_V2_STABLE_FACTORY], topic0: [aeroFactory.PoolCreated.topic] },
      from: Math.min(START_BLOCKS.aeroV2VolatileFactory, START_BLOCKS.aeroV2StableFactory),
    },
    {
      where: { address: [AERO_GAUGE_MANAGER], topic0: [gaugeManager.GaugeCreated.topic] },
      from: START_BLOCKS.aeroGaugeManager,
    },
  ];
  const services = [...tracked.serviceSafes].sort();
  if (services.length > 0) {
    const topics = services.map(addressTopic);
    // Transfer handlers read the transaction (its sender) and the receipt.
    const include = { transaction: true, transactionLogs: true };
    // No address filter: an LP or NFT sent straight to the Safe by another wallet emits no Safe event.
    queries.push({ where: { topic0: [TRANSFER_TOPIC], topic1: topics }, include });
    queries.push({ where: { topic0: [TRANSFER_TOPIC], topic2: topics }, include });
  }
  const hosts = [...tracked.safeHosts].sort();
  if (hosts.length > 0) {
    // Safe handlers read the transaction's from/to/value/input; ExecutionSuccess the receipt.
    queries.push({ where: { address: hosts, topic0: SAFE_TOPICS }, include: { transaction: true, transactionLogs: true } });
  }
  return queries;
}

interface ScanLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
}

/**
 * Index of the first block that creates a new Basius Service, or -1. Mirrors
 * the handler gate: an agentId-115 RegisterInstance followed by
 * CreateMultisigWithAgents for a multisig that is not a Service yet. Erring
 * towards a cut only costs a restart.
 *
 * `basius` holds every Basius id known to this stream (the database snapshot
 * plus registrations already scanned) and is added to here, because a
 * registration and its deploy are separate transactions and usually land in
 * different batches (at the head a batch is about one block).
 */
export function firstSpawnIndex(
  blocks: { logs: ScanLog[] }[],
  tracked: Tracked,
  basius: Set<bigint> = new Set(tracked.basiusServiceIds),
): number {
  for (let b = 0; b < blocks.length; b++) {
    const logs = [...blocks[b].logs].sort((x, y) => x.logIndex - y.logIndex);
    for (const log of logs) {
      if (log.address !== SERVICE_REGISTRY) continue;
      if (registry.RegisterInstance.is(log)) {
        const e = registry.RegisterInstance.decode(log);
        if (e.agentId === BASIUS_AGENT_ID && !EXCLUDED_SERVICE_IDS.includes(e.serviceId)) basius.add(e.serviceId);
      } else if (registry.CreateMultisigWithAgents.is(log)) {
        const e = registry.CreateMultisigWithAgents.decode(log);
        if (basius.has(e.serviceId) && !tracked.serviceSafes.has(e.multisig.toLowerCase())) return b;
      }
    }
  }
  return -1;
}

export interface Batch<B> {
  blocks: B[];
  finalizedHead?: { number: number; hash: string };
}

export interface CutState {
  cut: boolean;
}

/**
 * Pass batches through until one holds a spawn; emit it up to and including
 * that block, then end the stream.
 */
export async function* cutAtSpawn<B extends { logs: ScanLog[] }>(
  stream: AsyncIterable<Batch<B>>,
  tracked: Tracked,
  state: CutState,
): AsyncIterable<Batch<B>> {
  // One set for the whole stream: a registration seen in an earlier batch
  // must still gate the deploy in a later one.
  const basius = new Set(tracked.basiusServiceIds);
  for await (const batch of stream) {
    const at = firstSpawnIndex(batch.blocks, tracked, basius);
    if (at < 0) {
      yield batch;
      continue;
    }
    state.cut = true;
    yield { ...batch, blocks: batch.blocks.slice(0, at + 1) };
    return;
  }
}

/** Wrap an SDK data source so both of its streams end at the first spawn. */
export function cuttingSource<S extends {
  getStream(req: any): AsyncIterable<Batch<any>>;
  getFinalizedStream(req: any): AsyncIterable<Batch<any>>;
}>(src: S, tracked: Tracked, state: CutState): S {
  return new Proxy(src, {
    get(target, prop, receiver) {
      if (prop === "getStream" || prop === "getFinalizedStream") {
        return (req: unknown) => cutAtSpawn(target[prop](req), tracked, state);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
