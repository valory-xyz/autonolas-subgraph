import { selectChain, type Address } from "@olas/squid-shared";

export type ChainName = "robinhood" | "base";

export interface ChainConfig {
  name: ChainName;
  chainId: number;
  portalDataset: string;
  portalRequiresApiKey: boolean;
  /** JSON-RPC used when INGEST_SOURCE=rpc. No contract reads are needed to index. */
  defaultRpc: string;
  /** Token deployment block, including the initial mint. */
  startBlock: number;
  olas: Address;
}

export const CHAINS: Record<ChainName, ChainConfig> = {
  robinhood: {
    name: "robinhood",
    chainId: 4663,
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    portalRequiresApiKey: true,
    defaultRpc: "https://rpc-gate.autonolas.tech/robinhood-rpc/",
    // First bytecode and initial Transfer mint, verified against archive RPC.
    startBlock: 56_201_065,
    olas: "0x092963938debd8013a2e545b3549f8a5ec0d2286",
  },
  base: {
    name: "base",
    chainId: 8453,
    // Public dataset; production sets SQD_PORTAL_URL + key for the private portal.
    portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
    portalRequiresApiKey: false,
    defaultRpc: "https://mainnet.base.org",
    // autonolas-subgraph-studio subgraphs/tokenomics-l2/subgraph.base.yaml; first
    // block with OLAS bytecode (none at 10,622,420).
    startBlock: 10_622_421,
    olas: "0x54330d28ca3357f294334bdc454a032e7f353416",
  },
};

export const CHAIN: ChainConfig = selectChain(
  "TOKENOMICS_CHAIN",
  CHAINS,
  "robinhood",
);
export const ZERO_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

/**
 * SQD_PORTAL_URL (blank = unset) may point at any portal host, but must name
 * this chain's dataset: otherwise the processor streams another chain, finds
 * no OLAS logs, and reports healthy.
 */
export function assertPortalDataset(
  chain: ChainConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const url = env.SQD_PORTAL_URL?.trim();
  if (!url) return;
  const dataset = chain.portalDataset.split("/").pop()!;
  if (!url.replace(/\/+$/, "").endsWith(`/datasets/${dataset}`)) {
    throw new Error(
      `SQD_PORTAL_URL "${url}" is not the ${dataset} dataset for TOKENOMICS_CHAIN=${chain.name}`,
    );
  }
}
