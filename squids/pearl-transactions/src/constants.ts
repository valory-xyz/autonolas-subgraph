// Per-chain constants for the pearl-transactions squid.
//
// A squid deployment is ONE chain (unlike the subgraph's 4-manifest
// generator), so there is no `dataSource.network()` switch here — the chain
// is picked once, below. The per-chain table is kept in full anyway so
// Gnosis / Optimism / Base can be brought up by changing `CHAIN` and the
// portal dataset, not by rewriting this file. Addresses mirror
// `subgraphs/pearl-transactions/networks.json` in autonolas-subgraph-studio.
//
// EVERY address here is lowercase: SQD normalizes log addresses and event
// address params to lowercase, and the handlers compare with `===`. A
// mixed-case literal is a silent no-match, so keep them lowercase.

export type ChainName = "gnosis" | "matic" | "optimism" | "base";

export interface ChainConfig {
  name: ChainName;
  /** SQD Portal dataset for this chain. */
  portalDataset: string;
  /** Earliest block any tracked contract was deployed at. */
  startBlock: number;
  serviceRegistryL2: string;
  serviceRegistryTokenUtility: string;
  stakingFactory: string;
  olas: string;
  wrappedNative: string;
  wrappedNativeSymbol: string;
  /** address -> display symbol. All 6 decimals. */
  stablecoins: Record<string, string>;
  /** StakingProxy implementations this indexer accepts (see below). */
  allowedStakingImplementations: string[];
}

// isAllowedImplementation equivalent: the Olas staking ecosystem allows
// multiple StakingProxy implementations, but pearl-transactions only indexes
// proxies whose implementation is on this per-chain allow-list. Sourced from
// `subgraphs/staking/src/utils.ts` (the canonical list).
const CHAINS: Record<ChainName, ChainConfig> = {
  matic: {
    name: "matic",
    portalDataset: "https://portal.sqd.dev/datasets/polygon-mainnet",
    startBlock: 80_360_433,
    serviceRegistryL2: "0xe3607b00e75f6405248323a9417ff6b39b244b50",
    serviceRegistryTokenUtility: "0xa45e64d13a30a51b91ae0eb182e88a40e9b18ed8",
    stakingFactory: "0x46c0d07f55d4f9b5eed2fc9680b5953e5fd7b461",
    olas: "0xfef5d947472e72efbb2e388c730b7428406f2f95",
    wrappedNative: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    wrappedNativeSymbol: "WPOL",
    stablecoins: {
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USDC",
      "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "USDC.e",
      "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb": "pUSD",
    },
    allowedStakingImplementations: [
      "0x4aba1cf7a39a51d75cba789f5f21cf4882162519",
    ],
  },
  gnosis: {
    name: "gnosis",
    portalDataset: "https://portal.sqd.dev/datasets/gnosis-mainnet",
    startBlock: 27_871_084,
    serviceRegistryL2: "0x9338b5153ae39bb89f50468e608ed9d764b755fd",
    serviceRegistryTokenUtility: "0xa45e64d13a30a51b91ae0eb182e88a40e9b18ed8",
    stakingFactory: "0xb0228ca253a88bc8eb4ca70bcac8f87b381f4700",
    olas: "0xce11e14225575945b8e6dc0d4f2dd4c570f79d9f",
    wrappedNative: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
    wrappedNativeSymbol: "WXDAI",
    stablecoins: {
      "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83": "USDC",
      "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0": "USDC.e",
    },
    allowedStakingImplementations: [
      "0xea00be6690a871827fafd705440d20dd75e67ab1",
    ],
  },
  optimism: {
    name: "optimism",
    portalDataset: "https://portal.sqd.dev/datasets/optimism-mainnet",
    startBlock: 116_423_039,
    serviceRegistryL2: "0x3d77596beb0f130a4415df3d2d8232b3d3d31e44",
    serviceRegistryTokenUtility: "0xbb7e1d6cb6f243d6bde81ce92a9f2aff7fbe7eac",
    stakingFactory: "0xa45e64d13a30a51b91ae0eb182e88a40e9b18ed8",
    olas: "0xfc2e6e6bcbd49ccf3a5f029c79984372dcbfe527",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    wrappedNativeSymbol: "WETH",
    stablecoins: {
      "0x0b2c639c533813f4aa9d7837caf62653d097ff85": "USDC",
      "0x7f5c764cbc14f9669b88837ca1490cca17c31607": "USDC.e",
    },
    allowedStakingImplementations: [
      "0x63c2c53c09de534dd3bc0b7771bf976070936bac",
    ],
  },
  base: {
    name: "base",
    portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
    startBlock: 10_827_380,
    serviceRegistryL2: "0x3c1ff68f5aa342d296d4dee4bb1cacca912d95fe",
    serviceRegistryTokenUtility: "0x34c895f302d0b5cf52ec0edd3945321eb0f83dd5",
    stakingFactory: "0x1cee30d08943eb58eff84dd1ab44a6ee6feff63a",
    olas: "0x54330d28ca3357f294334bdc454a032e7f353416",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    wrappedNativeSymbol: "WETH",
    stablecoins: {
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
    },
    allowedStakingImplementations: [
      "0xeb5638eefe289691ece01943f768edbf96258a80",
    ],
  },
};

// This deployment's chain. Polygon: the deployment graph-node could not
// keep up with (~5 blk/s through the USDC.e-dense range).
export const CHAIN: ChainConfig = CHAINS.matic;

export const START_BLOCK = CHAIN.startBlock;
export const SERVICE_REGISTRY_L2 = CHAIN.serviceRegistryL2;
export const SRTU = CHAIN.serviceRegistryTokenUtility;
export const STAKING_FACTORY = CHAIN.stakingFactory;
export const OLAS = CHAIN.olas;
export const WRAPPED_NATIVE = CHAIN.wrappedNative;

/** Every ERC-20 whose Transfer stream this squid indexes. */
export const ERC20_TOKENS: string[] = [
  CHAIN.olas,
  CHAIN.wrappedNative,
  ...Object.keys(CHAIN.stablecoins),
];

/** Display symbol for a token we index, or null if it is not one of ours. */
export function knownTokenSymbol(address: string): string | null {
  const a = address.toLowerCase();
  if (a === CHAIN.olas) return "OLAS";
  if (a === CHAIN.wrappedNative) return CHAIN.wrappedNativeSymbol;
  return CHAIN.stablecoins[a] ?? null;
}

export function isAllowedImplementation(implementation: string): boolean {
  return CHAIN.allowedStakingImplementations.includes(
    implementation.toLowerCase()
  );
}

// --- Service state ----------------------------------------------------

export const SERVICE_STATE_REGISTERED = "REGISTERED";
export const SERVICE_STATE_DEPLOYED = "DEPLOYED";
export const SERVICE_STATE_STAKED = "STAKED";
export const SERVICE_STATE_UNSTAKED = "UNSTAKED";
export const SERVICE_STATE_TERMINATED = "TERMINATED";

// --- TrackedAddress roles ---------------------------------------------
//
// Roles are write-once, so a typo'd literal is a permanent silent
// misclassification — always use these constants.

export const ROLE_MASTER = "MASTER";
export const ROLE_AGENT = "AGENT";
export const ROLE_MASTER_EOA = "MASTER_EOA";
export const ROLE_AGENT_EOA = "AGENT_EOA";
export const ROLE_STAKING = "STAKING";

// --- Misc -------------------------------------------------------------

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** UTC-midnight day bucket, matching the subgraph's `ts / 86400 * 86400`. */
export const DAY_SECONDS = 86_400n;

/** The IndexerStatus singleton id. */
export const INDEXER_STATUS_ID = "1";
