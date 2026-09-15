// Per-chain constants for the service-registry squid.
//
// One squid deployment indexes ONE chain, picked by SERVICE_REGISTRY_CHAIN
// (default `robinhood`). Adding a chain is a new CHAINS entry; nothing else
// in the code names a chain. Addresses mirror
// `subgraphs/service-registry/networks.json` in autonolas-subgraph-studio
// for the chains that live there; Robinhood is squid-only.
//
// Addresses are lowercased on export: SQD normalizes log addresses to
// lowercase and the dispatcher compares with `===`.
import { selectChain } from "@olas/squid-shared";

export type ChainName = "robinhood";

export interface ChainConfig {
  name: ChainName;
  /** SQD Portal dataset for this chain. */
  portalDataset: string;
  /** Earliest block any tracked contract emitted a log at, rounded down. */
  startBlock: number;
  serviceRegistryL2: string;
  identityRegistryBridger: string;
}

export const CHAINS: Record<ChainName, ChainConfig> = {
  robinhood: {
    name: "robinhood",
    // Private dataset — not on the public portal listing. See .env.example.
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    // ServiceRegistryL2 deployment block (eth_getCode binary search on an
    // archive node); the IdentityRegistryBridger proxy followed at 58,626,966.
    startBlock: 58_564_789,
    // autonolas-registries PR #325 (wave 1 on chain 4663)
    serviceRegistryL2: "0xe3607b00e75f6405248323a9417ff6b39b244b50",
    identityRegistryBridger: "0xe49cb081e8d96920c38aa7ab90cb0294ab4bc8ea",
  },
};

/** This deployment's chain. */
export const CHAIN: ChainConfig = selectChain("SERVICE_REGISTRY_CHAIN", CHAINS, "robinhood");

export const START_BLOCK = CHAIN.startBlock;
export const SERVICE_REGISTRY_L2 = CHAIN.serviceRegistryL2.toLowerCase();
export const IDENTITY_REGISTRY_BRIDGER =
  CHAIN.identityRegistryBridger.toLowerCase();

/** The subgraph keys its singleton on the empty string; kept for parity. */
export const GLOBAL_ID = "";

/** ERC-8004 default metadata written on ServiceAgentLinked. */
export const ERC8004_ECOSYSTEM_KEY = "ecosystem";
export const ERC8004_ECOSYSTEM_VALUE = "Olas";
export const ERC8004_SERVICE_REGISTRY_KEY = "serviceRegistry";
