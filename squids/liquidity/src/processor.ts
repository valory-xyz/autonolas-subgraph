import { DataSourceBuilder, FieldSelection, LogRequest } from "@subsquid/evm-stream";
import { getIngestionConfig } from "@olas/squid-shared";
import { EvmRpcDataSourceBuilder } from "@subsquid/squid-sdk/evm/rpc";
import * as pair from "./abi/UniswapV2Pair/events";
import * as vault from "./abi/BalancerV2Vault/events";
import { CHAIN, START_BLOCK } from "./constants";

export { selectIngestSource, type IngestSource } from "@olas/squid-shared";

/**
 * Optional upper bound for validation runs: the processor indexes up to this
 * block and exits. Unset in production (follows the head).
 */
export function selectEndBlock(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.LIQUIDITY_END_BLOCK?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`LIQUIDITY_END_BLOCK="${raw}" must be a positive integer`);
  return n;
}

const ingestion = getIngestionConfig(CHAIN);

// The modern SDK has no implicit field defaults: every field the handlers
// read must be listed here. `logIndex` and `block.number` are always present.
const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
} satisfies FieldSelection;

export type Fields = typeof fields;

type LogQuery = LogRequest & { range?: { from: number; to?: number } };

/** The subscriptions, identical for both sources. */
export const LOG_QUERIES: LogQuery[] = [];

for (const p of CHAIN.pools) {
  // LP token Transfer: supply, mint/burn, and (Balancer) the reserve refetch.
  // Same signature on both pool kinds; the pair decoder is used for both.
  LOG_QUERIES.push({
    where: { address: [p.address], topic0: [pair.Transfer.topic] },
    range: { from: p.startBlock },
  });
  if (p.dex === "uniswap-v2") {
    LOG_QUERIES.push({
      where: { address: [p.address], topic0: [pair.Sync.topic, pair.Swap.topic] },
      range: { from: p.startBlock },
    });
  }
}

// Balancer: the Vault emits Swap for EVERY pool on the chain; the handler
// keeps only the tracked pool ids. One subscription from the earliest
// Balancer pool's start block.
const balancerPools = CHAIN.pools.filter((p) => p.dex === "balancer-v2");
if (balancerPools.length > 0) {
  LOG_QUERIES.push({
    where: { address: [CHAIN.balancerVault], topic0: [vault.Swap.topic] },
    range: { from: Math.min(...balancerPools.map((p) => p.startBlock)) },
  });
}

export const INGEST_SOURCE = ingestion.source;
export const END_BLOCK = selectEndBlock();
const blockRange = END_BLOCK == null ? { from: START_BLOCK } : { from: START_BLOCK, to: END_BLOCK };

function addQueries<B extends { addLog(q: LogQuery): B }>(b: B): B {
  for (const q of LOG_QUERIES) b = b.addLog(q);
  return b;
}

function buildPortalSource() {
  return addQueries(new DataSourceBuilder().setPortal(ingestion.portal).setBlockRange(blockRange).setFields(fields)).build();
}

function buildRpcSource() {
  return addQueries(
    new EvmRpcDataSourceBuilder()
      .setRpc(ingestion.rpc)
      .setBlockRange(blockRange)
      .setFields(fields),
  ).build();
}

export const dataSource = INGEST_SOURCE === "portal" ? buildPortalSource() : buildRpcSource();
