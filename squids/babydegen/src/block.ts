// One block, in graph-node order, including what graph-node does when a
// handler creates a data source mid-block.
//
// The stream only carries logs for the safes known when it started (see
// sources.ts). When CreateMultisigWithAgents registers a new Basius service
// in this block, two things are missing from it, and both are fetched here
// with eth_getLogs for this one block:
//
// - Token Transfers to/from the new service safe. Those are static data
//   sources in the subgraph, so they run in log order; the ones before the
//   registration hit no Service and are no-ops there and here.
// - Safe-template events of the new safes. graph-node re-scans the block for
//   a data source created in it and runs ALL of its triggers, earlier log
//   indexes included, after the block's other triggers. They are deferred to
//   the end of the block, in log order.
//
// The source then ends the stream after this block and the processor
// restarts with the new safes in its filters (main.ts). The fetched logs
// come with every other log of their transactions, as `transactionLogs`
// gives the stream, so the position, pool, gauge and LiFi events of those
// transactions run too.
//
// Pool templates (VeloV2Pool / AeroV2Pool) created in a block follow the
// same graph-node rule as Safe instances: their events in that block run
// after the block's other events. The streamed transaction logs already
// carry them, so nothing is fetched. The start block also runs the
// subgraph's `once` block handler (the LpSugar bootstrap), after its logs.

import { eventMeta, type EventMeta } from "@olas/squid-shared";
import { CHAIN, TRACKED_TOKENS } from "./constants";
import {
  dispatch,
  isPoolTopic,
  isSafeTopic,
  needsReceipt,
  needsTransaction,
  SAFE_TOPICS,
  TRANSFER_TOPIC,
  type RawLog,
} from "./dispatch";
import type { Ctx, ReceiptLog } from "./handlers";
import type { ChainReader } from "./rpc";
import { handleVeloV2Bootstrap } from "./v2";

/** What the running stream subscribes to. Grows in memory as safes are added. */
export interface StreamState {
  serviceSafes: Set<string>;
  safeHosts: Set<string>;
}

export interface BlockInput {
  header: { number: number; hash: string; timestamp: number };
  logs: RawLog[];
}

export const addressTopic = (address: string) => "0x" + "0".repeat(24) + address.slice(2).toLowerCase();

/** The logs a stream started before these safes existed did not carry. */
export async function fetchMissingLogs(
  chain: ChainReader,
  blockHash: string,
  services: string[],
  hosts: string[],
): Promise<RawLog[]> {
  const requests: Promise<RawLog[]>[] = [];
  if (services.length > 0) {
    const topics = services.map(addressTopic);
    requests.push(chain.getLogs({ blockHash, address: TRACKED_TOKENS, topics: [[TRANSFER_TOPIC], topics] }));
    requests.push(chain.getLogs({ blockHash, address: TRACKED_TOKENS, topics: [[TRANSFER_TOPIC], null, topics] }));
  }
  if (hosts.length > 0) {
    requests.push(chain.getLogs({ blockHash, address: hosts, topics: [SAFE_TOPICS] }));
  }
  const logs = (await Promise.all(requests)).flat();
  const txs = new Map<string, ReturnType<ChainReader["getTransaction"]>>();
  const receipts = new Map<string, ReturnType<ChainReader["getReceiptLogs"]>>();
  const memo = <T>(m: Map<string, T>, hash: string, get: () => T) => {
    if (!m.has(hash)) m.set(hash, get());
    return m.get(hash)!;
  };
  const out: RawLog[] = [];
  const seen = new Set<number>();
  const add = async (l: Omit<RawLog, "transaction" | "receipt">) => {
    if (seen.has(l.logIndex)) return;
    seen.add(l.logIndex);
    const hash = l.transactionHash;
    const transaction = needsTransaction(l) ? await memo(txs, hash, () => chain.getTransaction(hash)) : undefined;
    const receipt = needsReceipt(l) ? await memo(receipts, hash, () => chain.getReceiptLogs(hash)) : undefined;
    out.push({ ...l, transaction, receipt });
  };
  for (const l of logs) await add(l);
  // `transactionLogs`: every other log of those transactions.
  for (const hash of new Set(logs.map((l) => l.transactionHash))) {
    for (const r of await memo(receipts, hash, () => chain.getReceiptLogs(hash))) await add({ ...r, transactionHash: hash });
  }
  return out;
}

/**
 * graph-node's `event.receipt` for the streamed logs: every log of the same
 * transaction. The Transfer and Safe requests set `transactionLogs`, so the
 * block carries the whole transaction for any log that reads its receipt.
 */
export function attachReceipts(logs: RawLog[]): void {
  const byTx = new Map<string, RawLog[]>();
  for (const l of logs) {
    const group = byTx.get(l.transactionHash);
    if (group) group.push(l);
    else byTx.set(l.transactionHash, [l]);
  }
  const receipts = new Map<string, ReceiptLog[]>();
  for (const l of logs) {
    if (l.receipt !== undefined || !needsReceipt(l)) continue;
    let receipt = receipts.get(l.transactionHash);
    if (receipt == null) {
      receipt = byTx
        .get(l.transactionHash)!
        .sort((a, b) => a.logIndex - b.logIndex)
        .map((r) => ({ address: r.address, topics: r.topics, data: r.data, logIndex: r.logIndex }));
      receipts.set(l.transactionHash, receipt);
    }
    l.receipt = receipt;
  }
}

export type FetchMissing = (blockHash: string, services: string[], hosts: string[]) => Promise<RawLog[]>;

export async function processBlock(
  ctx: Ctx,
  block: BlockInput,
  stream: StreamState,
  fetchMissing: FetchMissing,
): Promise<void> {
  attachReceipts(block.logs);
  const queue = [...block.logs].sort((a, b) => a.logIndex - b.logIndex);
  const seen = new Set(queue.map((l) => l.logIndex));
  const newHosts = new Set<string>();
  const newPools = new Set<string>();
  const deferred: RawLog[] = [];
  const metaOf = (log: RawLog): EventMeta => eventMeta(block.header, log);
  const isNewTemplateLog = (log: RawLog) =>
    (newHosts.has(log.address) && isSafeTopic(log)) || (newPools.has(log.address) && isPoolTopic(log));
  /** Pools created so far: their events in this block, earlier ones included, run after it. */
  const drainPools = (upTo: number) => {
    const pools = ctx.spawnedPools.splice(0);
    if (pools.length === 0) return;
    pools.forEach((a) => newPools.add(a));
    for (const past of queue.slice(0, upTo)) {
      if (pools.includes(past.address) && isPoolTopic(past) && !deferred.includes(past)) deferred.push(past);
    }
  };

  for (let i = 0; i < queue.length; i++) {
    const log = queue[i];
    if (isNewTemplateLog(log)) {
      deferred.push(log);
      continue;
    }
    await dispatch(ctx, metaOf(log), log);
    drainPools(i);
    if (ctx.spawnedSafes.length === 0 && ctx.newServices.length === 0) continue;

    const hosts = ctx.spawnedSafes.splice(0);
    const services = ctx.newServices.splice(0);
    hosts.forEach((a) => newHosts.add(a));
    // After a hot-block rollback the stream can already carry a new host, so
    // its earlier Safe events are in the queue and were dropped in place.
    for (const past of queue.slice(0, i)) {
      if (hosts.includes(past.address) && isSafeTopic(past)) deferred.push(past);
    }
    const missingHosts = hosts.filter((a) => !stream.safeHosts.has(a));
    const missingServices = services.filter((a) => !stream.serviceSafes.has(a));
    missingHosts.forEach((a) => stream.safeHosts.add(a));
    missingServices.forEach((a) => stream.serviceSafes.add(a));
    if (missingHosts.length === 0 && missingServices.length === 0) continue;

    for (const extra of await fetchMissing(block.header.hash, missingServices, missingHosts)) {
      if (seen.has(extra.logIndex)) continue;
      seen.add(extra.logIndex);
      if (extra.logIndex < log.logIndex) {
        // Already past: only a new host's Safe event still runs (deferred).
        // An earlier Transfer of the new service safe found no Service.
        if (newHosts.has(extra.address) && isSafeTopic(extra)) deferred.push(extra);
        continue;
      }
      let at = i + 1;
      while (at < queue.length && queue[at].logIndex < extra.logIndex) at++;
      queue.splice(at, 0, extra);
    }
  }

  // Block handlers run after the block's log triggers.
  if (block.header.number === CHAIN.startBlock) {
    const at = { blockNumber: BigInt(block.header.number), blockTimestamp: BigInt(Math.floor(block.header.timestamp / 1000)) };
    await handleVeloV2Bootstrap(ctx, at);
    drainPools(queue.length);
  }

  deferred.sort((a, b) => a.logIndex - b.logIndex);
  for (const log of deferred) await dispatch(ctx, metaOf(log), log);
}
