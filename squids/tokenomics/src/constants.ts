import { selectChain, type Address } from "@olas/squid-shared";

export type ChainName = "robinhood";

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
};

export const CHAIN: ChainConfig = selectChain(
  "TOKENOMICS_CHAIN",
  CHAINS,
  "robinhood",
);
export const ZERO_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";
