import { DataSourceBuilder, FieldSelection, LogRequest } from "@subsquid/evm-stream";
import type { PortalClientOptions } from "@subsquid/portal-client";
import { EvmRpcDataSourceBuilder } from "@subsquid/squid-sdk/evm/rpc";
import * as native from "./abi/BalanceTrackerFixedPriceNative/events";
import { CHAIN, START_BLOCK } from "./constants";

// Where blocks come from: INGEST_SOURCE=portal | rpc; unset = portal when
// SQD_PORTAL_API_KEY is set, rpc otherwise (same rule as the sibling squids).
export type IngestSource = "portal" | "rpc";

export function selectIngestSource(env: NodeJS.ProcessEnv = process.env): IngestSource {
  const explicit = env.INGEST_SOURCE?.trim().toLowerCase();
  if (explicit === "portal" || explicit === "rpc") return explicit;
  if (explicit) throw new Error(`INGEST_SOURCE="${env.INGEST_SOURCE}" must be "portal" or "rpc"`);
  return env.SQD_PORTAL_API_KEY ? "portal" : "rpc";
}

/** Optional upper bound for validation runs: index up to this block and exit. */
export function selectEndBlock(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.MECH_FEES_END_BLOCK?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`MECH_FEES_END_BLOCK="${raw}" must be a positive integer`);
  return n;
}

const portalUrl = process.env.SQD_PORTAL_URL ?? CHAIN.portalDataset;
const portal: string | PortalClientOptions = process.env.SQD_PORTAL_API_KEY
  ? { url: portalUrl, http: { headers: { "x-api-key": process.env.SQD_PORTAL_API_KEY } } }
  : portalUrl;

// The modern SDK has no implicit field defaults: every field the handlers
// read must be listed here. `logIndex` and `block.number` are always present.
const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
} satisfies FieldSelection;

export type Fields = typeof fields;

type LogQuery = LogRequest & { range?: { from: number; to?: number } };

// The three events have the same signatures on every tracker kind, so the
// native tracker's ABI decodes all of them (only that ABI is typegen'd); one
// address-filtered subscription per tracker from its own deployment block.
export const LOG_QUERIES: LogQuery[] = CHAIN.trackers.map((t) => ({
  where: {
    address: [t.address],
    topic0: [native.MechBalanceAdjusted.topic, native.Withdraw.topic, native.Drained.topic],
  },
  range: { from: t.startBlock },
}));

export const INGEST_SOURCE: IngestSource = selectIngestSource();
export const END_BLOCK = selectEndBlock();
const blockRange = END_BLOCK == null ? { from: START_BLOCK } : { from: START_BLOCK, to: END_BLOCK };

function addQueries<B extends { addLog(q: LogQuery): B }>(b: B): B {
  for (const q of LOG_QUERIES) b = b.addLog(q);
  return b;
}

function buildPortalSource() {
  return addQueries(new DataSourceBuilder().setPortal(portal).setBlockRange(blockRange).setFields(fields)).build();
}

function buildRpcSource() {
  const url = process.env.RPC_HTTP ?? CHAIN.defaultRpc;
  const rateLimit = process.env.RPC_RATE_LIMIT ? Number(process.env.RPC_RATE_LIMIT) : undefined;
  return addQueries(
    new EvmRpcDataSourceBuilder()
      .setRpc({
        url,
        network: CHAIN.chainId,
        rpc: { verifyBlockHash: true, verifyLogsBloom: true },
        ...(rateLimit != null && Number.isFinite(rateLimit) ? { rateLimit } : {}),
      })
      .setBlockRange(blockRange)
      .setFields(fields)
  ).build();
}

export const dataSource = INGEST_SOURCE === "portal" ? buildPortalSource() : buildRpcSource();
