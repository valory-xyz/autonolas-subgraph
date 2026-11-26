import { DataSourceBuilder, type FieldSelection, type LogRequest } from "@subsquid/evm-stream";
import { getIngestionConfig } from "@olas/squid-shared";
// This adapter requires the SDK's optional evm-normalization and evm-rpc peers.
import { EvmRpcDataSourceBuilder } from "@subsquid/squid-sdk/evm/rpc";
import { assertPortalDataset, CHAIN } from "./constants";
import { logQueries, type LogQuery, type Tracked } from "./sources";

export { selectIngestSource, type IngestSource } from "@olas/squid-shared";

assertPortalDataset();
const ingestion = getIngestionConfig(CHAIN);

const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
  transaction: { from: true, to: true, value: true, input: true },
} satisfies FieldSelection;
export type Fields = typeof fields;

// Optional upper bound for reproducible verification (parity at a pinned head).
const end = process.env.BABYDEGEN_TO_BLOCK;
const to = end === undefined || end.trim() === "" ? undefined : Number(end);
if (to !== undefined && (!Number.isSafeInteger(to) || to < CHAIN.startBlock)) {
  throw new Error("BABYDEGEN_TO_BLOCK must be an integer at or after the start block");
}
export const BLOCK_RANGE = { from: CHAIN.startBlock, ...(to === undefined ? {} : { to }) };

export const INGEST_SOURCE = ingestion.source;

/**
 * The start block must reach the processor: block.ts runs the subgraph's
 * `once` LpSugar bootstrap there. It carries service 607's registration
 * today, but nothing guarantees a log-filtered stream delivers it, so it is
 * requested on its own.
 */
export const BOOTSTRAP_BLOCK = { from: CHAIN.startBlock, to: CHAIN.startBlock };

type Range = { from: number; to?: number };
export function addQueries<B extends { addLog(q: LogRequest & { range?: Range }): B; includeAllBlocks(range?: Range): B }>(
  builder: B,
  queries: LogQuery[],
  liveFrom?: number,
): B {
  let b = builder.includeAllBlocks(BOOTSTRAP_BLOCK);
  // From the chain head at start on, every block is delivered, so a due poll
  // block runs on time at the live head instead of waiting for the next
  // tracked log (scheduler.ts). Not for a pinned range: its end block is
  // enough there.
  if (liveFrom !== undefined && BLOCK_RANGE.to === undefined) b = b.includeAllBlocks({ from: Math.max(liveFrom, CHAIN.startBlock) });
  // A pinned end block always arrives, so the scheduler (block.ts) runs the
  // due poll blocks up to it even when it carries no tracked log.
  if (BLOCK_RANGE.to !== undefined) b = b.includeAllBlocks({ from: BLOCK_RANGE.to, to: BLOCK_RANGE.to });
  for (const { from, ...q } of queries) {
    if (from === undefined) {
      b = b.addLog(q);
    } else if (BLOCK_RANGE.to === undefined || BLOCK_RANGE.to >= from) {
      b = b.addLog({ ...q, range: { from, ...(BLOCK_RANGE.to === undefined ? {} : { to: BLOCK_RANGE.to }) } });
    }
  }
  return b;
}

/**
 * A data source subscribed to the tracked safes (rebuilt at every restart),
 * delivering every block from `liveFrom` (the head when the run started).
 */
export function buildDataSource(tracked: Tracked, liveFrom?: number) {
  const queries = logQueries(tracked);
  if (INGEST_SOURCE === "portal") {
    return addQueries(
      new DataSourceBuilder().setPortal(ingestion.portal).setBlockRange(BLOCK_RANGE).setFields(fields),
      queries,
      liveFrom,
    ).build();
  }
  return addQueries(
    new EvmRpcDataSourceBuilder().setRpc(ingestion.rpc).setBlockRange(BLOCK_RANGE).setFields(fields),
    queries,
    liveFrom,
  ).build();
}
