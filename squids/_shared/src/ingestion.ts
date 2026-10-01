export type IngestSource = "portal" | "rpc";

export interface IngestionChain {
  chainId: number;
  portalDataset: string;
  defaultRpc: string;
  /** Set for private Portal datasets so explicit portal mode fails fast. */
  portalRequiresApiKey?: boolean;
}

// Structural options keep SDK runtime dependencies in each consuming squid.
export interface IngestionConfig {
  source: IngestSource;
  portal: string | { url: string; http: { headers: { "x-api-key": string } } };
  rpc: {
    url: string;
    network: number;
    rpc: { verifyBlockHash: true; verifyLogsBloom: true };
    rateLimit?: number;
  };
}

export function selectIngestSource(env: NodeJS.ProcessEnv = process.env): IngestSource {
  const explicit = env.INGEST_SOURCE?.trim().toLowerCase();
  if (explicit === "portal" || explicit === "rpc") return explicit;
  if (explicit) {
    throw new Error(`INGEST_SOURCE="${env.INGEST_SOURCE}" must be "portal" or "rpc"`);
  }
  return env.SQD_PORTAL_API_KEY ? "portal" : "rpc";
}

/** Shared portal authentication and RPC ingestion policy for dual-source squids. */
export function getIngestionConfig(
  chain: IngestionChain,
  env: NodeJS.ProcessEnv = process.env,
): IngestionConfig {
  const portalUrl = env.SQD_PORTAL_URL ?? chain.portalDataset;
  const source = selectIngestSource(env);
  const rawRateLimit = env.RPC_RATE_LIMIT;
  const rateLimit = rawRateLimit === undefined ? undefined : Number(rawRateLimit);
  if (rateLimit !== undefined && (!Number.isFinite(rateLimit) || rateLimit <= 0)) {
    throw new Error("RPC_RATE_LIMIT must be a positive finite number");
  }
  if (source === "portal" && chain.portalRequiresApiKey && !env.SQD_PORTAL_API_KEY) {
    throw new Error("SQD_PORTAL_API_KEY is required for this Portal dataset");
  }
  return {
    source,
    portal: env.SQD_PORTAL_API_KEY
      ? { url: portalUrl, http: { headers: { "x-api-key": env.SQD_PORTAL_API_KEY } } }
      : portalUrl,
    rpc: {
      url: env.RPC_HTTP ?? chain.defaultRpc,
      network: chain.chainId,
      // Explicit verification supports chains without an SDK preset. Finality
      // comes from the node's finalized tag; do not substitute a fixed depth.
      rpc: { verifyBlockHash: true, verifyLogsBloom: true },
      ...(rateLimit === undefined ? {} : { rateLimit }),
    },
  };
}
