// Per-chain constants for the service-registry squid.
//
// A squid deployment is ONE chain. The table is keyed by chain anyway so a
// second chain is a new entry plus a change of `CHAIN`, not a rewrite.
// Addresses mirror `subgraphs/service-registry/networks.json` in
// autonolas-subgraph-studio for the chains that live there; Robinhood is
// squid-only.
//
// EVERY address here is lowercase: SQD normalizes log addresses and decoded
// address params to lowercase, and the handlers compare with `===`. A
// mixed-case literal is a silent no-match.

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

const CHAINS: Record<ChainName, ChainConfig> = {
  robinhood: {
    name: "robinhood",
    // Private dataset — not on the public portal listing. See .env.example.
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    // ServiceRegistryL2's first log is at 58,664,411 (2026-09-08); the
    // IdentityRegistryBridger proxy had none at the time of writing.
    startBlock: 58_664_000,
    // autonolas-registries PR #325 (wave 1 on chain 4663)
    serviceRegistryL2: "0xe3607b00e75f6405248323a9417ff6b39b244b50",
    identityRegistryBridger: "0xe49cb081e8d96920c38aa7ab90cb0294ab4bc8ea",
  },
};

export const CHAIN: ChainConfig = CHAINS.robinhood;

export const START_BLOCK = CHAIN.startBlock;
export const SERVICE_REGISTRY_L2 = CHAIN.serviceRegistryL2;
export const IDENTITY_REGISTRY_BRIDGER = CHAIN.identityRegistryBridger;

export const ONE_DAY = 86400n;

/** The subgraph keys its singleton on the empty string; kept for parity. */
export const GLOBAL_ID = "";

/** ERC-8004 default metadata written on ServiceAgentLinked. */
export const ERC8004_ECOSYSTEM_KEY = "ecosystem";
export const ERC8004_ECOSYSTEM_VALUE = "Olas";
export const ERC8004_SERVICE_REGISTRY_KEY = "serviceRegistry";
