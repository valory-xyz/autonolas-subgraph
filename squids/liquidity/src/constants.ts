// Per-chain constants. One deployment = one chain, picked by LIQUIDITY_CHAIN.
// EVERY address must be lowercase: SQD lowercases log addresses and the
// handlers compare with `===`, so a mixed-case literal is a silent no-match.
//
// Pools and start blocks mirror subgraphs/liquidity-l2 (networks.json plus the
// hand-written Base and Celo manifests) in autonolas-subgraph-studio, so a
// chain moved here re-indexes to the same data. Only Robinhood is deployed
// today; the other entries are inputs, not deployments.

import { selectChain } from "@olas/squid-shared";

export type ChainName =
  | "robinhood"
  | "gnosis"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "base"
  | "celo";

export type DexKind = "balancer-v2" | "uniswap-v2";

export interface PoolConfig {
  /** LP token / pool contract, lowercase. */
  address: string;
  dex: DexKind;
  startBlock: number;
}

export interface ChainConfig {
  name: ChainName;
  chainId: number;
  /** SQD Portal dataset for this chain. */
  portalDataset: string;
  /** Public JSON-RPC used when RPC_HTTP is unset. */
  defaultRpc: string;
  pools: PoolConfig[];
  /** Balancer V2 Vault; the same address on every chain that has one. */
  balancerVault: string;
  /** Chainlink AggregatorV3 for <native>/USD, or null (nativeUsdPrice stays 0). */
  nativeUsdFeed: string | null;
}

export const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";

export const CHAINS: Record<ChainName, ChainConfig> = {
  robinhood: {
    name: "robinhood",
    chainId: 4663,
    portalDataset: "https://portal.sqd.dev/datasets/robinhood-mainnet",
    defaultRpc: "https://rpc.mainnet.chain.robinhood.com",
    pools: [
      // OLAS/WETH Uniswap V2 pair, autonolas-tokenomics PR #361. First log at
      // 59,278,529.
      // Deployment block located by eth_getCode binary search on an archive node.
      { address: "0xc2ea98b5a75fd85f7ce57af856baaffecd445659", dex: "uniswap-v2", startBlock: 59_278_529 },
    ],
    balancerVault: BALANCER_VAULT,
    // Chainlink ETH/USD on Robinhood Chain (feeds-robinhood-mainnet.json).
    nativeUsdFeed: "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9",
  },
  gnosis: {
    name: "gnosis",
    chainId: 100,
    portalDataset: "https://portal.sqd.dev/datasets/gnosis-mainnet",
    defaultRpc: "https://gnosis-rpc.publicnode.com",
    pools: [{ address: "0x79c872ed3acb3fc5770dd8a0cd9cd5db3b3ac985", dex: "balancer-v2", startBlock: 30_396_445 }],
    balancerVault: BALANCER_VAULT,
    nativeUsdFeed: null, // xDAI; the subgraph tracks no price here
  },
  polygon: {
    name: "polygon",
    chainId: 137,
    portalDataset: "https://portal.sqd.dev/datasets/polygon-mainnet",
    defaultRpc: "https://polygon-rpc.com",
    pools: [{ address: "0x62309056c759c36879cde93693e7903bf415e4bc", dex: "balancer-v2", startBlock: 51_626_717 }],
    balancerVault: BALANCER_VAULT,
    nativeUsdFeed: "0xab594600376ec9fd91f8e885dadf0ce036862de0", // POL/USD
  },
  arbitrum: {
    name: "arbitrum",
    chainId: 42161,
    portalDataset: "https://portal.sqd.dev/datasets/arbitrum-one",
    defaultRpc: "https://arb1.arbitrum.io/rpc",
    pools: [{ address: "0xaf8912a3c4f55a8584b67df30ee0ddf0e60e01f8", dex: "balancer-v2", startBlock: 175_754_394 }],
    balancerVault: BALANCER_VAULT,
    nativeUsdFeed: "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612", // ETH/USD
  },
  optimism: {
    name: "optimism",
    chainId: 10,
    portalDataset: "https://portal.sqd.dev/datasets/optimism-mainnet",
    defaultRpc: "https://mainnet.optimism.io",
    pools: [{ address: "0x5bb3e58887264b667f915130fd04bbb56116c278", dex: "balancer-v2", startBlock: 117_547_761 }],
    balancerVault: BALANCER_VAULT,
    nativeUsdFeed: "0x13e3ee699d1909e989722e753853ae30b17e08c5", // ETH/USD
  },
  base: {
    name: "base",
    chainId: 8453,
    portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
    defaultRpc: "https://mainnet.base.org",
    pools: [
      { address: "0x5332584890d6e415a6dc910254d6430b8aab7e69", dex: "balancer-v2", startBlock: 12_416_046 }, // OLAS-USDC
      { address: "0x2da6e67c45af2aaa539294d9fa27ea50ce4e2c5f", dex: "balancer-v2", startBlock: 23_026_768 }, // WETH-OLAS
    ],
    balancerVault: BALANCER_VAULT,
    nativeUsdFeed: "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70", // ETH/USD
  },
  celo: {
    name: "celo",
    chainId: 42220,
    portalDataset: "https://portal.sqd.dev/datasets/celo-mainnet",
    defaultRpc: "https://forno.celo.org",
    pools: [{ address: "0x2976fa805141b467bcbc6334a69afff4d914d96a", dex: "uniswap-v2", startBlock: 27_100_181 }], // Ubeswap CELO-OLAS
    balancerVault: BALANCER_VAULT,
    nativeUsdFeed: "0x0568fd19986748ceff3301e55c0eb1e729e0ab7e", // CELO/USD
  },
};

export const CHAIN: ChainConfig = selectChain("LIQUIDITY_CHAIN", CHAINS, "robinhood");

/** Earliest block of any tracked pool on this chain. */
export const START_BLOCK = Math.min(...CHAIN.pools.map((p) => p.startBlock));

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const PRICE_DATA_ID = "native-usd";
export const INDEXER_STATUS_ID = "1";

/** Re-read the Chainlink feed at most this often (the subgraph's 1h). */
export const PRICE_STALENESS_SECONDS = 3600n;

/** Uniswap V2 fee: 0.3% of the input amount. */
export const UNISWAP_V2_FEE_NUMERATOR = 3n;
export const UNISWAP_V2_FEE_DENOMINATOR = 1000n;
/** Balancer swap fee percentage is an 18-decimal fixed point. */
export const WEI = 10n ** 18n;
