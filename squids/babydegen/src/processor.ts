import { DataSourceBuilder, type FieldSelection, type LogRequest } from "@subsquid/evm-stream";
import { getIngestionConfig } from "@olas/squid-shared";
// This adapter requires the SDK's optional evm-normalization and evm-rpc peers.
import { EvmRpcDataSourceBuilder } from "@subsquid/squid-sdk/evm/rpc";
import { assertPortalDataset, CHAIN } from "./constants";
import { logQueries, type Tracked } from "./sources";

export { selectIngestSource, type IngestSource } from "@olas/squid-shared";

assertPortalDataset();
const ingestion = getIngestionConfig(CHAIN);

const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
  transaction: { to: true, value: true },
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

function addQueries<B extends { addLog(q: LogRequest & { range?: { from: number; to?: number } }): B }>(
  builder: B,
  queries: LogRequest[],
): B {
  let b = builder;
  for (const q of queries) b = b.addLog(q);
  return b;
}

/** A data source subscribed to the tracked safes (rebuilt at every restart). */
export function buildDataSource(tracked: Tracked) {
  const queries = logQueries(tracked);
  if (INGEST_SOURCE === "portal") {
    return addQueries(
      new DataSourceBuilder().setPortal(ingestion.portal).setBlockRange(BLOCK_RANGE).setFields(fields),
      queries,
    ).build();
  }
  return addQueries(
    new EvmRpcDataSourceBuilder().setRpc(ingestion.rpc).setBlockRange(BLOCK_RANGE).setFields(fields),
    queries,
  ).build();
}
