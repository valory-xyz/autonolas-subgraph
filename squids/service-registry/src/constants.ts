// Per-chain constants for the service-registry squid.
//
// One squid deployment indexes ONE chain, picked by SERVICE_REGISTRY_CHAIN
// (default `robinhood`). Adding a chain is a new CHAINS entry; nothing else
// in the code names a chain. Addresses and start blocks mirror
// `subgraphs/service-registry/networks.json` in autonolas-subgraph-studio
// for the chains that live there (Base); Robinhood is squid-only.
//
// Addresses are lowercased on export: SQD normalizes log addresses to
// lowercase and the dispatcher compares with `===`.
import { selectChain } from "@olas/squid-shared";

export type ChainName = "robinhood" | "base";

export interface ChainConfig {
  name: ChainName;
  /** SQD Portal dataset for this chain. */
  portalDataset: string;
  /** Private datasets refuse to start without SQD_PORTAL_API_KEY. */
  portalRequiresApiKey: boolean;
  /** ServiceRegistryL2 start block; also where the Safe subscription starts. */
  startBlock: number;
  serviceRegistryL2: string;
  identityRegistryBridger: string;
  /** The subgraph manifest's bridger startBlock (later than the registry's). */
  identityRegistryBridgerStartBlock: number;
}

export const CHAINS: Record<ChainName, ChainConfig> = {
  robinhood: {
    name: "robinhood",
    // Private dataset — not on the public portal listing. See .env.example.
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    portalRequiresApiKey: true,
    // ServiceRegistryL2 deployment block (eth_getCode binary search on an
    // archive node); the IdentityRegistryBridger proxy followed at 58,626,966.
    startBlock: 58_564_789,
    // autonolas-registries PR #325 (wave 1 on chain 4663)
    serviceRegistryL2: "0xe3607b00e75f6405248323a9417ff6b39b244b50",
    identityRegistryBridger: "0xe49cb081e8d96920c38aa7ab90cb0294ab4bc8ea",
    identityRegistryBridgerStartBlock: 58_564_789,
  },
  base: {
    name: "base",
    // Public dataset; production sets SQD_PORTAL_URL + key to the private
    // portal (the public one rate-limits a backfill).
    portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
    portalRequiresApiKey: false,
    // subgraph.base.yaml (autonolas-subgraph-studio)
    startBlock: 10_827_380,
    serviceRegistryL2: "0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE",
    identityRegistryBridger: "0x67722c823010ceb4bed5325fe109196c0f67d053",
    identityRegistryBridgerStartBlock: 41_675_072,
  },
};

/** This deployment's chain. */
export const CHAIN: ChainConfig = selectChain("SERVICE_REGISTRY_CHAIN", CHAINS, "robinhood");

export const START_BLOCK = CHAIN.startBlock;
export const SERVICE_REGISTRY_L2 = CHAIN.serviceRegistryL2.toLowerCase();
export const IDENTITY_REGISTRY_BRIDGER =
  CHAIN.identityRegistryBridger.toLowerCase();
export const IDENTITY_REGISTRY_BRIDGER_START_BLOCK =
  CHAIN.identityRegistryBridgerStartBlock;

/**
 * Portal options for `chain`. SQD_PORTAL_URL (blank = unset) overrides the
 * chain's dataset but must name the same dataset, or the processor would
 * stream another chain, match nothing, and report healthy. The key is sent
 * as x-api-key when set, and is mandatory for private datasets.
 */
export function portalFor(
  chain: ChainConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | { url: string; http: { headers: { "x-api-key": string } } } {
  const url = env.SQD_PORTAL_URL?.trim() || chain.portalDataset;
  const dataset = chain.portalDataset.split("/").pop()!;
  if (!url.includes(dataset)) {
    throw new Error(
      `SQD_PORTAL_URL "${url}" does not point at the ${dataset} dataset`,
    );
  }
  const apiKey = env.SQD_PORTAL_API_KEY?.trim();
  if (!apiKey) {
    if (chain.portalRequiresApiKey) {
      throw new Error(
        `SQD_PORTAL_API_KEY is required for the private ${dataset} dataset`,
      );
    }
    return url;
  }
  return { url, http: { headers: { "x-api-key": apiKey } } };
}

/** The subgraph keys its singleton on the empty string; kept for parity. */
export const GLOBAL_ID = "";

/** ERC-8004 default metadata written on ServiceAgentLinked. */
export const ERC8004_ECOSYSTEM_KEY = "ecosystem";
export const ERC8004_ECOSYSTEM_VALUE = "Olas";
export const ERC8004_SERVICE_REGISTRY_KEY = "serviceRegistry";
