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
// restarts with the new safes in its filters (main.ts).

import { eventMeta, type EventMeta } from "@olas/squid-shared";
import { TRACKED_TOKENS } from "./constants";
import { dispatch, isSafeTopic, SAFE_TOPICS, TRANSFER_TOPIC, type RawLog } from "./dispatch";
import type { Ctx } from "./handlers";
import type { ChainReader } from "./rpc";

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
  const txs = new Map<string, Promise<{ to: string | null; value: bigint }>>();
  const out: RawLog[] = [];
  for (const l of logs) {
    let transaction: RawLog["transaction"];
    if (isSafeTopic(l)) {
      if (!txs.has(l.transactionHash)) txs.set(l.transactionHash, chain.getTransaction(l.transactionHash));
      transaction = await txs.get(l.transactionHash)!;
    }
    out.push({ ...l, transaction });
  }
  return out;
}

export type FetchMissing = (blockHash: string, services: string[], hosts: string[]) => Promise<RawLog[]>;

export async function processBlock(
  ctx: Ctx,
  block: BlockInput,
  stream: StreamState,
  fetchMissing: FetchMissing,
): Promise<void> {
  const queue = [...block.logs].sort((a, b) => a.logIndex - b.logIndex);
  const seen = new Set(queue.map((l) => l.logIndex));
  const newHosts = new Set<string>();
  const deferred: RawLog[] = [];
  const metaOf = (log: RawLog): EventMeta => eventMeta(block.header, log);

  for (let i = 0; i < queue.length; i++) {
    const log = queue[i];
    if (newHosts.has(log.address) && isSafeTopic(log)) {
      deferred.push(log);
      continue;
    }
    await dispatch(ctx, metaOf(log), log);
    if (ctx.spawnedSafes.length === 0 && ctx.newServices.length === 0) continue;

    const hosts = ctx.spawnedSafes.splice(0);
    const services = ctx.newServices.splice(0);
    hosts.forEach((a) => newHosts.add(a));
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

  deferred.sort((a, b) => a.logIndex - b.logIndex);
  for (const log of deferred) await dispatch(ctx, metaOf(log), log);
}
