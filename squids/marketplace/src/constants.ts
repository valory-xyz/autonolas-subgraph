// Per-chain constants. One deployment = one chain, picked by MARKETPLACE_CHAIN.
// EVERY address must be lowercase: SQD lowercases log addresses and the
// handlers compare with `===`, so a mixed-case literal is a silent no-match.

import { selectChain } from "@olas/squid-shared";

export type ChainName = "robinhood" | "base";

// Fee unit names (schema enum FeeUnit). String constants rather than the
// generated enum so logic.ts / fee.ts stay importable without the models.
export const FEE_UNIT_NATIVE = "NATIVE";
export const FEE_UNIT_TOKEN = "TOKEN";
export const FEE_UNIT_USDC = "USDC";
export const FEE_UNIT_CREDITS = "CREDITS";
export type FeeUnitName =
  | typeof FEE_UNIT_NATIVE
  | typeof FEE_UNIT_TOKEN
  | typeof FEE_UNIT_USDC
  | typeof FEE_UNIT_CREDITS;

// keccak256 of the payment type name — what `IMech.paymentType()` returns and
// what the marketplace keys `mapPaymentTypeBalanceTrackers` on. Derived from
// the factory address instead of an eth_call, as in the subgraph.
export const PAYMENT_TYPE_FIXED_PRICE_NATIVE =
  "0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1";
export const PAYMENT_TYPE_FIXED_PRICE_TOKEN =
  "0x3679d66ef546e66ce9057c4a052f317b135bc8e8c509638f7966edfd4fcf45e9";
export const PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC =
  "0x6406bb5f31a732f898e1ce9fdd988a80a808d36ab5d9a4a4805a8be8d197d5e3";
export const PAYMENT_TYPE_NVM_SUBSCRIPTION_NATIVE =
  "0x803dd08fe79d91027fc9024e254a0942372b92f3ccabc1bd19f4a5c2b251c316";
export const PAYMENT_TYPE_NVM_SUBSCRIPTION_TOKEN_USDC =
  "0x0d6fd99afa9c4c580fab5e341922c2a5c4b61d880da60506193d7bf88944dd14";

export interface MechFactoryConfig {
  address: string;
  /** Solidity event the factory emits on mech creation. */
  event: string;
  paymentType: string;
  feeUnit: FeeUnitName;
  startBlock: number;
}

export interface ContractSource {
  address: string;
  startBlock: number;
}

/**
 * NVM subscription credits -> USD, as the subgraph's
 * calculate<Chain>NvmCreditsToUsd: credits × ratio / 1e18 / 10^tokenDecimals.
 */
export interface NvmCreditsConfig {
  /** The contracts' immutable credit ratio, 18-decimal fixed point. */
  ratio: string;
  /** Decimals of the token the credits are paid in. */
  tokenDecimals: number;
}

/**
 * OLAS -> USD from a Balancer V2 OLAS/stablecoin pool's balances at the
 * event's block (the subgraph's calculateOlasInUsd for Gnosis/Base).
 */
export interface OlasPoolConfig {
  vault: string;
  pool: string;
  olas: string;
  stable: string;
  stableDecimals: number;
}

export interface ChainConfig {
  name: ChainName;
  chainId: number;
  /** SQD Portal dataset for this chain. */
  portalDataset: string;
  /** Private datasets fail fast without SQD_PORTAL_API_KEY in portal mode. */
  portalRequiresApiKey?: boolean;
  /** Public JSON-RPC used when RPC_HTTP is unset (fee conversion only). */
  defaultRpc: string;
  /** Earliest block any tracked contract was deployed at. */
  startBlock: number;
  serviceRegistryL2: ContractSource;
  complementaryServiceMetadata: ContractSource | null;
  /** The Karma PROXY — events are emitted at the proxy address. */
  karma: ContractSource;
  /** The MechMarketplace PROXY — events are emitted at the proxy address. */
  mechMarketplace: ContractSource;
  /**
   * Last block decoded with the V1 marketplace ABI (the subgraph's
   * MechMarketplaceV1 data source `endBlock`); V2 from the next block. Null
   * when the chain launched on V2.
   */
  mechMarketplaceV1EndBlock: number | null;
  mechFactories: MechFactoryConfig[];
  /**
   * Chainlink AggregatorV3 proxy for <native>/USD, or null when the chain has
   * no feed (NATIVE fees then convert to $0 with a warning, as OLAS does on
   * Celo in the subgraph).
   */
  nativeUsdFeed: string | null;
  nativeDecimals: number;
  usdcDecimals: number;
  /** CREDITS fee unit; null converts to $0 with a warning. */
  nvmCredits: NvmCreditsConfig | null;
  /** TOKEN (OLAS) fee unit; null converts to $0 with a warning. */
  olasPool: OlasPoolConfig | null;
}

export const CHAINS: Record<ChainName, ChainConfig> = {
  // Robinhood Chain (Arbitrum Orbit L2, ETH gas). Addresses from
  // autonolas-marketplace PR #197 / #196 and autonolas-registries
  // scripts/deployment/l2/globals_robinhood_mainnet.json; deployment blocks
  // located by eth_getCode binary search against an archive node. The chain
  // launched after the OLAS payment wind-down, so it has no OLAS leg and no
  // NVM legs: native (ETH) and "USDC" — which is USDG, the chain's native
  // stablecoin, 6 decimals — only.
  robinhood: {
    name: "robinhood",
    chainId: 4663,
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    defaultRpc: "https://rpc.mainnet.chain.robinhood.com",
    startBlock: 58_564_789,
    serviceRegistryL2: {
      address: "0xe3607b00e75f6405248323a9417ff6b39b244b50",
      startBlock: 58_564_789,
    },
    complementaryServiceMetadata: {
      address: "0xd1155408d58293be0743225bcde28b9fd0c12378",
      startBlock: 58_624_621,
    },
    karma: {
      address: "0x63c2c53c09de534dd3bc0b7771bf976070936bac", // KarmaProxy
      startBlock: 59_575_473,
    },
    mechMarketplace: {
      address: "0xa45e64d13a30a51b91ae0eb182e88a40e9b18ed8", // MechMarketplaceProxy
      startBlock: 59_578_054,
    },
    mechMarketplaceV1EndBlock: null,
    mechFactories: [
      {
        address: "0x04b0007b2afb398015b76e5f22993a1fddf83644",
        event: "CreateMechFixedPriceNative",
        paymentType: PAYMENT_TYPE_FIXED_PRICE_NATIVE,
        feeUnit: FEE_UNIT_NATIVE,
        startBlock: 59_579_034,
      },
      {
        // A MechFactoryFixedPriceTokenUSDC deployment that emits the plain
        // `CreateMechFixedPriceToken` event (forge artifact in
        // autonolas-marketplace abis/deployed/), registered on-chain under the
        // FixedPriceTokenUSDC payment type (mapPaymentTypeBalanceTrackers).
        address: "0x7fd1f4b764fa41d19fe3f63c85d12bf64d2bbf68",
        event: "CreateMechFixedPriceToken",
        paymentType: PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC,
        feeUnit: FEE_UNIT_USDC,
        startBlock: 59_579_676,
      },
    ],
    // Chainlink ETH / USD on Robinhood Chain mainnet, 8 decimals, 24h
    // heartbeat (reference-data-directory feeds-robinhood-mainnet.json).
    nativeUsdFeed: "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9",
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvmCredits: null,
    olasPool: null,
  },

  // Base. Every address, start block and conversion below is the Base
  // marketplace subgraph's (subgraphs/marketplace/subgraph.base.yaml and
  // src/marketplace/{constants,fee-utils}.ts): the squid replaces it, and
  // consumers must read the same numbers from both.
  base: {
    name: "base",
    chainId: 8453,
    // Public dataset; production sets SQD_PORTAL_URL + key to the private
    // portal. Set INGEST_SOURCE=portal when running keyless: RPC ingestion
    // cannot serve the address-less mech subscription on public Base RPCs.
    portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
    defaultRpc: "https://mainnet.base.org",
    startBlock: 10_827_380,
    serviceRegistryL2: {
      address: "0x3c1ff68f5aa342d296d4dee4bb1cacca912d95fe",
      startBlock: 10_827_380,
    },
    complementaryServiceMetadata: {
      address: "0x28c1edc7ced549f7f80b732fdc19f0370160707d",
      startBlock: 31_728_383,
    },
    karma: {
      address: "0x1f84f8f70de0651c2d51bf8850fe9d0289ba3b3a",
      startBlock: 26_642_705,
    },
    mechMarketplace: {
      address: "0xf24ee42eda0fc9b33b7d41b06ee8ccd2ef7c5020",
      startBlock: 26_642_705,
    },
    mechMarketplaceV1EndBlock: 33_907_400,
    mechFactories: [
      {
        address: "0x2e008211f34b25a7d7c102403c6c2c3b665a1abe",
        event: "CreateMechFixedPriceNative",
        paymentType: PAYMENT_TYPE_FIXED_PRICE_NATIVE,
        feeUnit: FEE_UNIT_NATIVE,
        startBlock: 26_642_705,
      },
      {
        address: "0x97371b1c0cda1d04dfc43dfb50a04645b7bc9bee",
        event: "CreateMechFixedPriceToken",
        paymentType: PAYMENT_TYPE_FIXED_PRICE_TOKEN,
        feeUnit: FEE_UNIT_TOKEN,
        startBlock: 26_642_705,
      },
      {
        address: "0x5b70a66fe68c4c86ffd724b58cc56049c70e9d3d",
        event: "CreateMechFixedPriceTokenUSDC",
        paymentType: PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC,
        feeUnit: FEE_UNIT_USDC,
        startBlock: 26_642_705,
      },
      {
        address: "0x847bbe8b474e0820215f818858e23f5f5591855a",
        event: "CreateMechNvmSubscriptionNative",
        paymentType: PAYMENT_TYPE_NVM_SUBSCRIPTION_NATIVE,
        feeUnit: FEE_UNIT_CREDITS,
        startBlock: 26_642_705,
      },
      {
        address: "0x7bed01f8482ff686f025628e7780ca6c1f0559fc",
        event: "CreateMechNvmSubscriptionTokenUSDC",
        paymentType: PAYMENT_TYPE_NVM_SUBSCRIPTION_TOKEN_USDC,
        feeUnit: FEE_UNIT_CREDITS,
        startBlock: 26_642_705,
      },
    ],
    // Chainlink ETH / USD on Base, 8 decimals.
    nativeUsdFeed: "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70",
    nativeDecimals: 18,
    usdcDecimals: 6,
    // calculateBaseNvmCreditsToUsd: credits × 0.99 / 1e6 (USDC).
    nvmCredits: { ratio: "990000000000000000", tokenDecimals: 6 },
    // OLAS/USDC Balancer V2 pool.
    olasPool: {
      vault: "0xba12222222228d8ba445958a75a0704d566bf2c8",
      pool: "0x5332584890d6e415a6dc910254d6430b8aab7e69",
      olas: "0x54330d28ca3357f294334bdc454a032e7f353416",
      stable: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      stableDecimals: 6,
    },
  },
};

/** `<name>` of a `.../datasets/<name>` portal URL, or null. */
function portalDatasetName(url: string): string | null {
  const m = /\/datasets\/([^/?#]+)/.exec(url);
  return m == null ? null : m[1];
}

/**
 * In portal mode the URL must serve this chain's dataset. A Robinhood URL
 * left in place with MARKETPLACE_CHAIN=base would stream the wrong chain,
 * match no address, and report healthy at an empty head.
 */
export function assertPortalDataset(url: string, chain: ChainConfig): void {
  const want = portalDatasetName(chain.portalDataset);
  const got = portalDatasetName(url);
  if (got !== want) {
    throw new Error(
      `SQD_PORTAL_URL="${url}" serves dataset "${got ?? "(none)"}", but ` +
        `MARKETPLACE_CHAIN="${chain.name}" needs "${want}".`
    );
  }
}

/**
 * Load-time checks on a chain entry, so a config slip fails startup instead
 * of silently pricing fees at $0 or matching no log:
 * - every address is lowercase (SQD lowercases log addresses and the code
 *   compares with ===; the OLAS pool's token match relies on it too);
 * - a factory with fee unit TOKEN needs `olasPool`, CREDITS needs `nvmCredits`,
 *   NATIVE needs `nativeUsdFeed`.
 */
export function assertChainConfig(chain: ChainConfig): void {
  const addrs = JSON.stringify(chain).match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? [];
  const mixed = addrs.filter((a) => a !== a.toLowerCase());
  if (mixed.length > 0) {
    throw new Error(`${chain.name}: addresses must be lowercase: ${mixed.join(", ")}`);
  }
  const needs: [string, unknown][] = [
    [FEE_UNIT_TOKEN, chain.olasPool],
    [FEE_UNIT_CREDITS, chain.nvmCredits],
    [FEE_UNIT_NATIVE, chain.nativeUsdFeed],
  ];
  for (const [unit, source] of needs) {
    const f = chain.mechFactories.find((x) => x.feeUnit === unit);
    if (f != null && source == null) {
      throw new Error(
        `${chain.name}: factory ${f.address} has fee unit ${unit} but the chain has no source for it`
      );
    }
  }
}

// This deployment's chain.
export const CHAIN: ChainConfig = selectChain("MARKETPLACE_CHAIN", CHAINS, "robinhood");
assertChainConfig(CHAIN);

export const START_BLOCK = CHAIN.startBlock;
export const SERVICE_REGISTRY_L2 = CHAIN.serviceRegistryL2.address;
export const COMPLEMENTARY_SERVICE_METADATA =
  CHAIN.complementaryServiceMetadata?.address ?? null;
export const KARMA = CHAIN.karma.address;
export const MECH_MARKETPLACE = CHAIN.mechMarketplace.address;
export const MECH_FACTORY_ADDRESSES: string[] = CHAIN.mechFactories.map(
  (f) => f.address
);

/** Chainlink AggregatorV3 answers are 8-decimal fixed point for USD pairs. */
export const CHAINLINK_PRICE_FEED_DECIMALS = 8;

// --- Misc -------------------------------------------------------------

/** The Global singleton id — "" for parity with the subgraph. */
export const GLOBAL_ID = "";

/** The IndexerStatus singleton id. */
export const INDEXER_STATUS_ID = "1";
