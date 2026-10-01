import { selectChain, type Address } from "@olas/squid-shared";

export type ChainName = "robinhood";

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
};

export const CHAIN: ChainConfig = selectChain(
  "STAKING_CHAIN",
  CHAINS,
  "robinhood",
);
