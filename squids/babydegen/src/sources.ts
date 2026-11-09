// Restart-on-new-Safe ingestion.
//
// Every subgraph handler is gated on a tracked Safe, so instead of the
// chain-wide USDC/WETH Transfer streams and topic-only Safe events the
// squid asks the portal for exactly the tracked safes' logs:
//
// - ServiceRegistryL2 RegisterInstance / CreateMultisigWithAgents;
// - Transfer on the 13 tracked tokens with topic1 or topic2 = a service safe;
// - Safe events emitted by an address that has a Safe instance.
//
// The address lists come from the database (Service, SafeDataSource) when
// a stream starts. `cutAtSpawn` ends the stream right after the first block
// that registers a new Basius service; block.ts fetches that block's missing
// logs, and main.ts starts a new stream with the new safes subscribed.

import type { LogRequest } from "@subsquid/evm-stream";
import * as registry from "./abi/ServiceRegistryL2/events";
import { addressTopic } from "./block";
import { BASIUS_AGENT_ID, EXCLUDED_SERVICE_IDS, SERVICE_REGISTRY, TRACKED_TOKENS } from "./constants";
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

export function logQueries(tracked: Tracked): LogRequest[] {
  const queries: LogRequest[] = [
    {
      where: {
        address: [SERVICE_REGISTRY],
        topic0: [registry.RegisterInstance.topic, registry.CreateMultisigWithAgents.topic],
      },
    },
  ];
  const services = [...tracked.serviceSafes].sort();
  if (services.length > 0) {
    const topics = services.map(addressTopic);
    // Transfer handlers read the transaction (its sender) and the receipt.
    const include = { transaction: true, transactionLogs: true };
    queries.push({ where: { address: TRACKED_TOKENS, topic0: [TRANSFER_TOPIC], topic1: topics }, include });
    queries.push({ where: { address: TRACKED_TOKENS, topic0: [TRANSFER_TOPIC], topic2: topics }, include });
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
