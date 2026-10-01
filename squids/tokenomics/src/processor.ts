import {
  DataSourceBuilder,
  type FieldSelection,
  type LogRequest,
} from "@subsquid/evm-stream";
import { getIngestionConfig } from "@olas/squid-shared";
// This adapter requires the SDK’s optional evm-normalization and evm-rpc peers.
import { EvmRpcDataSourceBuilder } from "@subsquid/squid-sdk/evm/rpc";
import * as olas from "./abi/OLAS/events";
import { CHAIN } from "./constants";

export { selectIngestSource, type IngestSource } from "@olas/squid-shared";

const ingestion = getIngestionConfig(CHAIN);

const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
} satisfies FieldSelection;
export type Fields = typeof fields;
type LogQuery = LogRequest & { range?: { from: number; to?: number } };
export const LOG_QUERIES: LogQuery[] = [
  { where: { address: [CHAIN.olas], topic0: [olas.Transfer.topic] } },
];

function addQueries<B extends { addLog(q: LogQuery): B }>(builder: B): B {
  let b = builder;
  for (const q of LOG_QUERIES) b = b.addLog(q);
  return b;
}

// Optional upper bound for reproducible verification; never move the start past deployment.
const end = process.env.TOKENOMICS_TO_BLOCK;
const to = end === undefined ? undefined : Number(end);
if (to !== undefined && (!Number.isSafeInteger(to) || to < CHAIN.startBlock)) {
  throw new Error(
    "TOKENOMICS_TO_BLOCK must be an integer at or after token deployment",
  );
}
export const BLOCK_RANGE = {
  from: CHAIN.startBlock,
  ...(to === undefined ? {} : { to }),
};

export const INGEST_SOURCE = ingestion.source;

function buildPortalSource() {
  return addQueries(
    new DataSourceBuilder()
      .setPortal(ingestion.portal)
      .setBlockRange(BLOCK_RANGE)
      .setFields(fields),
  ).build();
}

function buildRpcSource() {
  return addQueries(
    new EvmRpcDataSourceBuilder()
      .setRpc(ingestion.rpc)
      .setBlockRange(BLOCK_RANGE)
      .setFields(fields),
  ).build();
}

export const dataSource =
  INGEST_SOURCE === "portal" ? buildPortalSource() : buildRpcSource();
