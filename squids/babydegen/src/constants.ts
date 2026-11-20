// Base (Basius) configuration, from studio subgraphs/babydegen/babydegen-base
// src/constants.ts, src/tokenConfig.ts and subgraph.yaml as of #174 + #175. Addresses are
// lowercase: SQD lowercases log addresses and handlers compare with ===.

import type { Address } from "@olas/squid-shared";

export const CHAIN = {
  name: "base",
  chainId: 8453,
  portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
  portalRequiresApiKey: false,
  // Archive eth_call without a key, rate-limited; production sets RPC_HTTP.
  defaultRpc: "https://mainnet.base.org",
  // subgraph.yaml startBlock: earliest agentId-115 registration (service 607).
  startBlock: 47_163_056,
} as const;

/** Canonical ServiceRegistryL2 on Base. */
export const SERVICE_REGISTRY: Address = "0x3c1ff68f5aa342d296d4dee4bb1cacca912d95fe";

/** Basius agent id (NOT service id 115). */
export const BASIUS_AGENT_ID = 115n;
/** None today; kept for parity with the optimism filter. */
export const EXCLUDED_SERVICE_IDS: bigint[] = [];

// ---- tokens --------------------------------------------------------------
export const USDC_NATIVE: Address = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const WETH: Address = "0x4200000000000000000000000000000000000006";
export const AERO: Address = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
export const BOLD: Address = "0x03569cc076654f82679c4ba2124d64774781b01d";
export const MSUSD: Address = "0x526728dbc96689597f85ae4cd716d4f7fccbae9d";
export const FRXUSD: Address = "0xe5020a6d073a794b6e7f05678707de47986fb0b6";
export const EUSD: Address = "0xcfa3ef56d303ae4faaba0592388f19d7c3399fb4";
export const AXLUSDC: Address = "0xeb466342c4d449bc9f53a865d5cb90586f405215";
/** AERO of Aero (the merged protocol), the Aero gauge reward token. */
export const AERO_PROTOCOL_AERO: Address = "0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee";
export const USDT: Address = "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2";
export const DAI: Address = "0x50c5725949a6f0c72e6c4a641f24049a917db0cb";
export const USDE: Address = "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34";
export const USDS: Address = "0x820c137fa70c8691f0e44dc420a5e53c168921dc";

// ---- Chainlink (8 decimals; the subgraph divides by 1e8, never reads decimals())
export const ETH_USD_FEED: Address = "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70";
export const USDC_USD_FEED: Address = "0x7e860098f58bbfc8648a4311b374b1d669a2bc6b";
export const USDT_USD_FEED: Address = "0xf19d560eb8d2adf07bd6d13ed03e1d11215721f9";
export const DAI_USD_FEED: Address = "0x591e79239a7d679378ec8c847e5038150364c78f";
export const USDE_USD_FEED: Address = "0x790181e93e9f4eedb5b864860c12e4d2cfffe73b";
export const USDS_USD_FEED: Address = "0x2330aae3bca5f05169d5f4597964d44522f62930";

/** Aerodrome v2 AERO/USDC volatile pool (AERO's only price source). */
export const AERO_USDC_POOL: Address = "0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d";
/** Aero v2 AERO/USDC volatile pool (Aero's AERO). */
export const AERO_PROTOCOL_AERO_USDC_POOL: Address = "0xf634058dc94e6bf8e828e27621320c423bc8b18e";
/** Aero USDC/USDT CL pool, USDT's priority-2 source. */
export const USDT_USDC_CL_POOL: Address = "0xd448990883e3bf9cdd8ebca368a3ecf9d629aaf7";

// ---- Aerodrome (legacy) and Aero venues ------------------------------------
/** Aerodrome Slipstream NFPM (legacy CL positions). */
export const VELO_NFT_MANAGER: Address = "0xe1f8cd9ac4e4a65f54f38a5cdafca44f6dd68b53";
/** Aerodrome Slipstream CL factory. */
export const VELO_CL_FACTORY: Address = "0xf8f2eb4940cfe7d13603dddd87f123820fc061ef";
/** Aerodrome v2 PoolFactory (VeloV2Factory data source). */
export const VELO_V2_FACTORY: Address = "0x420dd381b31aef6683db6b902084cb0ffece40da";
/** Aerodrome LpSugar v3 (VeloV2Sugar bootstrap at the start block). */
export const VELO_V2_SUGAR: Address = "0x69dd9db6d8f8e7d83887a704f447b1a584b599a1";
/** Aerodrome Voter: gauges(pool) for legacy v2 pools. */
export const VELO_VOTER: Address = "0x16613524e02ad97edfef371bc883f2f5d6c480a5";
export const AERO_NFT_MANAGER: Address = "0x4857db576ee0e45f10525ec59527bfd10beec60b";
export const AERO_CL_FACTORY: Address = "0x9cb220581b91b0c83223012fe69688b92ad07a76";
export const AERO_V2_STABLE_FACTORY: Address = "0x78589e876edcebdce72ee3436ab3c9ad3a7cef2d";
export const AERO_V2_VOLATILE_FACTORY: Address = "0x8e6a9fcd1d638cc760ffba397605fe3355de76d2";
/** Aero GaugeManager (Voter.GAUGE_MANAGER()). */
export const AERO_GAUGE_MANAGER: Address = "0xbf234b32c5e58868243a4a14831626f3ede7b183";
/** LiFi Diamond (same address on every EVM chain). */
export const LIFI_DIAMOND: Address = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";

/** subgraph.yaml startBlocks of the data sources that do not start at CHAIN.startBlock. */
export const START_BLOCKS = {
  aeroNftManager: 52_881_675,
  aeroV2StableFactory: 52_880_046,
  aeroV2VolatileFactory: 52_880_042,
  aeroGaugeManager: 52_688_318,
} as const;

/** Consumer-facing ProtocolPosition.protocol values. */
export const PROTOCOL_VELODROME_V2 = "aerodrome-v2";
export const PROTOCOL_VELODROME_V3 = "aerodrome-cl";
export const PROTOCOL_AERO_CL = "aero-cl";
export const PROTOCOL_AERO_V2 = "aero-v2";

/** rewardTokenFor: Aero gauges pay Aero's AERO, the legacy Aerodrome ones legacy AERO. */
export function rewardTokenFor(protocol: string): Address {
  if (protocol === PROTOCOL_AERO_CL || protocol === PROTOCOL_AERO_V2) return AERO_PROTOCOL_AERO;
  if (protocol !== PROTOCOL_VELODROME_V2 && protocol !== PROTOCOL_VELODROME_V3) {
    // log.critical in the subgraph: it stops there.
    throw new Error(`rewardTokenFor: '${protocol}' is not a Velodrome-family venue`);
  }
  return AERO;
}

/** Default v2 pool swap fees, in basis points. */
export const V2_STABLE_FEE_BPS = 5;
export const V2_VOLATILE_FEE_BPS = 30;

/** The Transfer data sources in subgraph.yaml, in manifest order. */
export const TRACKED_TOKENS: Address[] = [
  USDC_NATIVE, WETH, AERO, BOLD, MSUSD, FRXUSD, EUSD, AXLUSDC, AERO_PROTOCOL_AERO, USDT, DAI, USDE, USDS,
];

/** isPoolRelevant: both tokens are tracked (WHITELISTED_TOKENS = the tracked tokens). */
export const isPoolRelevant = (token0: string, token1: string) =>
  (TRACKED_TOKENS as string[]).includes(token0) && (TRACKED_TOKENS as string[]).includes(token1);

/** No lower price bound (a depeg is recorded, not rejected) and the `depegged` flag. */
export const STABLECOINS: string[] = [USDC_NATIVE, BOLD, MSUSD, FRXUSD, EUSD, AXLUSDC, USDT, DAI, USDE, USDS];

export type SourceType = "chainlink" | "chainlink_reference" | "velodrome_v2" | "velodrome_slipstream";

export interface PriceSourceConfig {
  address: Address;
  sourceType: SourceType;
  priority: number;
  /** 0-100 */
  confidence: number;
  pairToken: Address | null;
}

export interface TokenConfig {
  address: Address;
  symbol: string;
  decimals: number;
  priceSources: PriceSourceConfig[];
}

const usdcReferencedStable = (address: Address, symbol: string, decimals: number): TokenConfig => ({
  address,
  symbol,
  decimals,
  priceSources: [
    { address: USDC_USD_FEED, sourceType: "chainlink_reference", priority: 1, confidence: 90, pairToken: null },
  ],
});

/** A stablecoin on its own Chainlink feed, with an optional Aero USDC pool as priority 2. */
const chainlinkStable = (address: Address, symbol: string, decimals: number, feed: Address, fallbackPool: Address | null): TokenConfig => ({
  address,
  symbol,
  decimals,
  priceSources: [
    { address: feed, sourceType: "chainlink", priority: 1, confidence: 95, pairToken: null },
    ...(fallbackPool == null
      ? []
      : [{ address: fallbackPool, sourceType: "velodrome_slipstream", priority: 2, confidence: 80, pairToken: USDC_NATIVE } as const]),
  ],
});

/** tokenConfig.ts TOKENS. */
export const TOKENS: ReadonlyMap<string, TokenConfig> = new Map(
  [
    {
      address: USDC_NATIVE,
      symbol: "USDC",
      decimals: 6,
      priceSources: [{ address: USDC_USD_FEED, sourceType: "chainlink", priority: 1, confidence: 99, pairToken: null }],
    } satisfies TokenConfig,
    {
      address: WETH,
      symbol: "WETH",
      decimals: 18,
      priceSources: [{ address: ETH_USD_FEED, sourceType: "chainlink", priority: 1, confidence: 99, pairToken: null }],
    } satisfies TokenConfig,
    usdcReferencedStable(BOLD, "BOLD", 18),
    usdcReferencedStable(MSUSD, "msUSD", 18),
    usdcReferencedStable(FRXUSD, "frxUSD", 18),
    usdcReferencedStable(EUSD, "eUSD", 18),
    usdcReferencedStable(AXLUSDC, "axlUSDC", 6),
    {
      address: AERO,
      symbol: "AERO",
      decimals: 18,
      priceSources: [
        { address: AERO_USDC_POOL, sourceType: "velodrome_v2", priority: 1, confidence: 85, pairToken: USDC_NATIVE },
      ],
    } satisfies TokenConfig,
    {
      address: AERO_PROTOCOL_AERO,
      symbol: "AERO",
      decimals: 18,
      priceSources: [
        {
          address: AERO_PROTOCOL_AERO_USDC_POOL,
          sourceType: "velodrome_v2",
          priority: 1,
          confidence: 85,
          pairToken: USDC_NATIVE,
        },
      ],
    } satisfies TokenConfig,
    chainlinkStable(USDT, "USDT", 6, USDT_USD_FEED, USDT_USDC_CL_POOL),
    chainlinkStable(DAI, "DAI", 18, DAI_USD_FEED, null),
    chainlinkStable(USDE, "USDe", 18, USDE_USD_FEED, null),
    chainlinkStable(USDS, "USDS", 18, USDS_USD_FEED, null),
  ].map((t) => [t.address, t]),
);

/**
 * SQD_PORTAL_URL (blank = unset) may point at any portal host but must name
 * the base-mainnet dataset; otherwise the processor streams another chain,
 * finds no registry logs and reports healthy.
 */
export function assertPortalDataset(env: NodeJS.ProcessEnv = process.env): void {
  const url = env.SQD_PORTAL_URL?.trim();
  if (!url) return;
  const dataset = CHAIN.portalDataset.split("/").pop()!;
  const got = /\/datasets\/([^/?#]+)/.exec(url)?.[1]?.toLowerCase();
  if (got !== dataset) {
    throw new Error(`SQD_PORTAL_URL "${url}" is not the ${dataset} dataset`);
  }
}
