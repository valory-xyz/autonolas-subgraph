// Per-chain constants. One deployment = one chain, picked by MARKETPLACE_CHAIN.
// EVERY address must be lowercase: SQD lowercases log addresses and the
// handlers compare with `===`, so a mixed-case literal is a silent no-match.

export type ChainName = "robinhood";

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

export interface ChainConfig {
  name: ChainName;
  chainId: number;
  /** SQD Portal dataset for this chain. */
  portalDataset: string;
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
  mechFactories: MechFactoryConfig[];
  /**
   * Chainlink AggregatorV3 proxy for <native>/USD, or null when the chain has
   * no feed (NATIVE fees then convert to $0 with a warning, as OLAS does on
   * Celo in the subgraph).
   */
  nativeUsdFeed: string | null;
  nativeDecimals: number;
  usdcDecimals: number;
}

const CHAINS: Record<ChainName, ChainConfig> = {
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
  },
};

function selectChain(): ChainConfig {
  const name = (process.env.MARKETPLACE_CHAIN ?? "robinhood").trim();
  const chain = (CHAINS as Record<string, ChainConfig | undefined>)[name];
  if (chain == null) {
    throw new Error(
      `MARKETPLACE_CHAIN="${name}" is not configured. Known chains: ` +
        Object.keys(CHAINS).join(", ")
    );
  }
  return chain;
}

// This deployment's chain.
export const CHAIN: ChainConfig = selectChain();

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
