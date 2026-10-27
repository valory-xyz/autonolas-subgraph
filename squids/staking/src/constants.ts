import { selectChain, type Address } from "@olas/squid-shared";

export type ChainName = "robinhood" | "base";

export interface ChainConfig {
  name: ChainName;
  chainId: number;
  portalDataset: string;
  portalRequiresApiKey: boolean;
  /** Archive RPC used for historical contract reads and optional ingestion. */
  defaultRpc: string;
  /** Factory deployment block; indexing must include the full staking history. */
  startBlock: number;
  stakingFactory: Address;
  olas: Address;
}

export const CHAINS: Record<ChainName, ChainConfig> = {
  robinhood: {
    name: "robinhood",
    chainId: 4663,
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    portalRequiresApiKey: true,
    defaultRpc: "https://rpc-gate.autonolas.tech/robinhood-rpc/",
    // First block with factory bytecode, verified against archive RPC.
    startBlock: 58_661_778,
    stakingFactory: "0x1bd1505b711fb58c54ca3712e6bef47a133892d9",
    olas: "0x092963938debd8013a2e545b3549f8a5ec0d2286",
  },
  base: {
    name: "base",
    chainId: 8453,
    // Public dataset; production sets SQD_PORTAL_URL + key for the private portal.
    portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
    portalRequiresApiKey: false,
    // Archive eth_call without a key; rate-limited, so production sets RPC_HTTP.
    defaultRpc: "https://mainnet.base.org",
    // autonolas-subgraph-studio subgraphs/staking/subgraph.base.yaml; first
    // block with factory bytecode (none at 17,310,018).
    startBlock: 17_310_019,
    stakingFactory: "0x1cee30d08943eb58eff84dd1ab44a6ee6feff63a",
    // studio shared/constants.ts OLAS_ADDRESS_BASE
    olas: "0x54330d28ca3357f294334bdc454a032e7f353416",
  },
};

export const CHAIN: ChainConfig = selectChain(
  "STAKING_CHAIN",
  CHAINS,
  "robinhood",
);

/**
 * SQD_PORTAL_URL (blank = unset) may point at any portal host, but must name
 * this chain's dataset: otherwise the processor streams another chain, finds
 * no factory logs, and reports healthy.
 */
export function assertPortalDataset(
  chain: ChainConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const url = env.SQD_PORTAL_URL?.trim();
  if (!url) return;
  const dataset = chain.portalDataset.split("/").pop()!;
  // Same rule as pearl-transactions: compare the .../datasets/<name> segment,
  // so a trailing slash, sub-path or query string on a private host passes.
  const got = /\/datasets\/([^/?#]+)/.exec(url)?.[1]?.toLowerCase();
  if (got !== dataset) {
    throw new Error(
      `SQD_PORTAL_URL "${url}" is not the ${dataset} dataset for STAKING_CHAIN=${chain.name}`,
    );
  }
}
