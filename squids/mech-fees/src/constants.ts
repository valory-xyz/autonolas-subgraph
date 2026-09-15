// Per-chain constants. One deployment = one chain, picked by MECH_FEES_CHAIN.
// EVERY address must be lowercase: SQD lowercases log addresses and the
// handlers compare with `===`, so a mixed-case literal is a silent no-match.
//
// Trackers, start blocks, burn addresses, pricing pools and feeds mirror
// subgraphs/new-mech-fees (per-network manifests) and shared/constants.ts in
// autonolas-subgraph-studio, so a chain moved here re-indexes to the same
// data. Only Robinhood is deployed today; the other entries are inputs, not
// deployments.

import { selectChain } from "@olas/squid-shared";

export type ChainName =
  | "robinhood"
  | "ethereum"
  | "gnosis"
  | "base"
  | "polygon"
  | "optimism"
  | "arbitrum"
  | "celo";

/** Payment models, the subgraph's names (also the DrainTotals ids). */
export type Model = "native" | "nvm" | "token-olas" | "token-usdc";
export const MODEL_NATIVE = "native" as const;
export const MODEL_NVM = "nvm" as const;
export const MODEL_OLAS = "token-olas" as const;
export const MODEL_USDC = "token-usdc" as const;

export interface TrackerConfig {
  /** BalanceTracker contract, lowercase. */
  address: string;
  model: Model;
  startBlock: number;
}

/** How NVM credits convert: usd = credits × tokenRatio / 1e18 / 10^tokenDecimals. */
export interface NvmConfig {
  /** Subgraph TOKEN_RATIO_<network>, an integer string. */
  tokenRatio: string;
  /** Decimals of the token NVM withdrawals are paid in (xDAI 18, USDC 6). */
  tokenDecimals: number;
  /** Withdrawals are paid in the native token (Gnosis xDAI) or in USDC. */
  withdrawalsIn: "native" | "usdc";
}

/** How OLAS is priced. */
export type OlasPricing =
  | {
      kind: "balancer-v2";
      vault: string;
      pool: string;
      olas: string;
      /** The pool's other token. */
      quote: string;
      quoteDecimals: number;
      /** Quote is the native token (WMATIC/WETH): multiply by the native feed. */
      quoteIsNative: boolean;
    }
  | {
      kind: "uniswap-v2";
      pair: string;
      olas: string;
      /** Quote is WETH, priced via the native feed. */
    }
  | { kind: "none" };

export interface ChainConfig {
  name: ChainName;
  chainId: number;
  portalDataset: string;
  defaultRpc: string;
  trackers: TrackerConfig[];
  /** Withdrawals to this address are burns, not mech income; null when none. */
  burnAddress: string | null;
  /** Chainlink <native>/USD, or null when the native token is a USD stable (xDAI). */
  nativeUsdFeed: string | null;
  nativeDecimals: number;
  /** The `token-usdc` model's token decimals (USDC 6; USDG on Robinhood 6). */
  usdcDecimals: number;
  nvm: NvmConfig | null;
  olas: OlasPricing;
}

const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const NVM_RATIO_USDC = "990000000000000000";
const NVM_RATIO_XDAI = "990000000000000000000000000000";

export const CHAINS: Record<ChainName, ChainConfig> = {
  // Robinhood Chain (4663). autonolas-marketplace globals_robinhood_mainnet.json:
  // native (ETH) and "USDC" — which is USDG, the chain's stablecoin, 6 decimals.
  // No OLAS or NVM legs; no burn address (no OLAS-denominated fees to burn).
  robinhood: {
    name: "robinhood",
    chainId: 4663,
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    defaultRpc: "https://rpc.mainnet.chain.robinhood.com",
    trackers: [
      // Deployment blocks located by eth_getCode binary search on an archive node.
      { address: "0x1d79e0a600b61fac1b8f40c27347e48962ed2f23", model: "native", startBlock: 59_579_330 },
      { address: "0xeb5638eefe289691ece01943f768edbf96258a80", model: "token-usdc", startBlock: 59_580_444 },
    ],
    burnAddress: null,
    nativeUsdFeed: "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9", // ETH/USD
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: null,
    olas: { kind: "none" },
  },
  ethereum: {
    name: "ethereum",
    chainId: 1,
    portalDataset: "https://portal.sqd.dev/datasets/ethereum-mainnet",
    defaultRpc: "https://ethereum-rpc.publicnode.com",
    trackers: [
      { address: "0x528befb0f8c6a988c9f42345da6d053d66b3b9b6", model: "native", startBlock: 24_626_597 },
      { address: "0x02b576cc1bb21a84dd8b59013777c150ea64c482", model: "token-olas", startBlock: 24_626_597 },
      { address: "0x897aee2e6f3d37740d334c55caea2e0cac82aa14", model: "token-usdc", startBlock: 24_626_597 },
    ],
    burnAddress: "0xfad04813bffd759a308a2beaacef587720ba743f",
    nativeUsdFeed: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: null,
    olas: {
      kind: "uniswap-v2",
      pair: "0x09d1d767edf8fa23a64c51fa559e0688e526812f",
      olas: "0x0001a500a6b18995b03f44bb040a5ffc28e45cb0",
    },
  },
  gnosis: {
    name: "gnosis",
    chainId: 100,
    portalDataset: "https://portal.sqd.dev/datasets/gnosis-mainnet",
    defaultRpc: "https://rpc.gnosischain.com",
    trackers: [
      { address: "0x21ce6799a22a3da84b7c44a814a9c79ab1d2a50d", model: "native", startBlock: 38_662_107 },
      { address: "0x7d686bd1fd3cff6e45a40165154d61043af7d67c", model: "nvm", startBlock: 38_662_005 },
      { address: "0x53bd432516707a5212a70216284a99a563aac1d1", model: "token-olas", startBlock: 38_662_275 },
    ],
    burnAddress: "0x153196110040a0c729227c603db3a6c6d91851b2",
    nativeUsdFeed: null, // xDAI = USD
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: { tokenRatio: NVM_RATIO_XDAI, tokenDecimals: 18, withdrawalsIn: "native" },
    olas: {
      kind: "balancer-v2",
      vault: BALANCER_VAULT,
      pool: "0x79c872ed3acb3fc5770dd8a0cd9cd5db3b3ac985",
      olas: "0xce11e14225575945b8e6dc0d4f2dd4c570f79d9f",
      quote: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d", // WXDAI
      quoteDecimals: 18,
      quoteIsNative: false,
    },
  },
  base: {
    name: "base",
    chainId: 8453,
    portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
    defaultRpc: "https://mainnet.base.org",
    trackers: [
      { address: "0xb3921f8d8215603f0bd521341ac45ea8f2d274c1", model: "native", startBlock: 26_642_932 },
      { address: "0xaafbeef195bdab1bb6f3dc9ceba875cd72499230", model: "nvm", startBlock: 27_585_236 },
      { address: "0x43fb32f25dce34eb76c78c7a42c8f40f84bcd237", model: "token-olas", startBlock: 26_643_048 },
      { address: "0x0443c55e151dba13fae079518f9dd01ff9c21cb2", model: "token-usdc", startBlock: 50_775_686 },
    ],
    burnAddress: "0x3fd8c757de190bcc82cf69df3cd9ab15bcec1426",
    nativeUsdFeed: "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70",
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: { tokenRatio: NVM_RATIO_USDC, tokenDecimals: 6, withdrawalsIn: "usdc" },
    olas: {
      kind: "balancer-v2",
      vault: BALANCER_VAULT,
      pool: "0x5332584890d6e415a6dc910254d6430b8aab7e69",
      olas: "0x54330d28ca3357f294334bdc454a032e7f353416",
      quote: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
      quoteDecimals: 6,
      quoteIsNative: false,
    },
  },
  polygon: {
    name: "polygon",
    chainId: 137,
    portalDataset: "https://portal.sqd.dev/datasets/polygon-mainnet",
    defaultRpc: "https://polygon-rpc.com",
    trackers: [
      { address: "0xc096362fa6f4a4b1a9ea68b1043416f3381ce300", model: "native", startBlock: 81_028_655 },
      { address: "0xd00cb760bf30183eafe67f0e590beee190f35cf3", model: "nvm", startBlock: 81_724_578 },
      { address: "0x1521918961bdbc9ed4c67a7103d5999e4130e6cb", model: "token-olas", startBlock: 81_028_765 },
      { address: "0x5c50ebc17d002a4484585c8fbf62f51953493c0b", model: "token-usdc", startBlock: 81_888_996 },
    ],
    burnAddress: "0x88943f63e29cd436b62cffe332ad54de92adce98",
    nativeUsdFeed: "0xab594600376ec9fd91f8e885dadf0ce036862de0", // POL/USD
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: { tokenRatio: NVM_RATIO_USDC, tokenDecimals: 6, withdrawalsIn: "usdc" },
    olas: {
      kind: "balancer-v2",
      vault: BALANCER_VAULT,
      pool: "0x62309056c759c36879cde93693e7903bf415e4bc",
      olas: "0xfef5d947472e72efbb2e388c730b7428406f2f95",
      quote: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
      quoteDecimals: 18,
      quoteIsNative: true,
    },
  },
  optimism: {
    name: "optimism",
    chainId: 10,
    portalDataset: "https://portal.sqd.dev/datasets/optimism-mainnet",
    defaultRpc: "https://mainnet.optimism.io",
    trackers: [
      { address: "0x4cd816ce806ff1003ee459158a093f02abf042a8", model: "native", startBlock: 145_788_503 },
      { address: "0x1a0bfcc27051bccddc444578f56a4f5920e0e083", model: "nvm", startBlock: 146_485_258 },
      { address: "0x70a0d93fb0db6eaab871ab0a3be279dca37a2bcf", model: "token-olas", startBlock: 145_788_564 },
      { address: "0xa123748ce7609f507060f947b70298d0bde621e6", model: "token-usdc", startBlock: 145_788_564 },
    ],
    burnAddress: "0x4891f5894634dcd6d11644fe8e56756ef2681582",
    nativeUsdFeed: "0x13e3ee699d1909e989722e753853ae30b17e08c5",
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: { tokenRatio: NVM_RATIO_USDC, tokenDecimals: 6, withdrawalsIn: "usdc" },
    olas: {
      kind: "balancer-v2",
      vault: BALANCER_VAULT,
      pool: "0x5bb3e58887264b667f915130fd04bbb56116c278",
      olas: "0xfc2e6e6bcbd49ccf3a5f029c79984372dcbfe527",
      quote: "0x4200000000000000000000000000000000000006", // WETH
      quoteDecimals: 18,
      quoteIsNative: true,
    },
  },
  arbitrum: {
    name: "arbitrum",
    chainId: 42161,
    portalDataset: "https://portal.sqd.dev/datasets/arbitrum-one",
    defaultRpc: "https://arb1.arbitrum.io/rpc",
    trackers: [
      { address: "0x26ea2dc7ce1b41d0ad0e0521535655d7a94b684c", model: "native", startBlock: 440_298_368 },
      { address: "0x5dfb0d37f2a28023cdba46d2f015a90564cf9586", model: "token-olas", startBlock: 440_298_368 },
      { address: "0xa987fe40034aad2ebb0e01b22dfc57f20c87f949", model: "token-usdc", startBlock: 440_298_368 },
    ],
    burnAddress: "0xd2ff4cf0927c3cfbf3bb27391044dbaf6f4ca7b9",
    nativeUsdFeed: "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612",
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: null,
    olas: {
      kind: "balancer-v2",
      vault: BALANCER_VAULT,
      pool: "0xaf8912a3c4f55a8584b67df30ee0ddf0e60e01f8",
      olas: "0x064f8b858c2a603e1b106a2039f5446d32dc81c1",
      quote: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
      quoteDecimals: 18,
      quoteIsNative: true,
    },
  },
  celo: {
    name: "celo",
    chainId: 42220,
    portalDataset: "https://portal.sqd.dev/datasets/celo-mainnet",
    defaultRpc: "https://forno.celo.org",
    trackers: [
      { address: "0x93111f6c267068a5d7356114d61d0f09bfd53a54", model: "native", startBlock: 61_239_248 },
      { address: "0x3912381baa2935a0fc03c173df366a459dac1f43", model: "token-olas", startBlock: 61_239_248 },
      { address: "0xa749f605d93b3efcc207c54270d83c6e8fa70ff8", model: "token-usdc", startBlock: 61_239_248 },
    ],
    burnAddress: "0x11949cbc85d8793b360029e26b18ae759708e28b",
    nativeUsdFeed: "0x0568fd19986748ceff3301e55c0eb1e729e0ab7e", // CELO/USD
    nativeDecimals: 18,
    usdcDecimals: 6,
    nvm: null,
    // No OLAS pricing pool on Celo: raw OLAS is recorded, USD is 0 (subgraph parity).
    olas: { kind: "none" },
  },
};

export const CHAIN: ChainConfig = selectChain("MECH_FEES_CHAIN", CHAINS, "robinhood");

/** Earliest block of any tracked contract on this chain. */
export const START_BLOCK = Math.min(...CHAIN.trackers.map((t) => t.startBlock));

export const GLOBAL_ID = "";
export const INDEXER_STATUS_ID = "1";
export const FEE_IN = "FEE_IN";
export const FEE_OUT = "FEE_OUT";
export const OLAS_DECIMALS = 18;
