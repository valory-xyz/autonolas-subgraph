// Pure helpers, ported from subgraphs/liquidity-l2/src/utils.ts + mapping.ts.
// No store or network access: everything here is unit-tested directly.
import { PoolReserves } from "@olas/squid-shared";

import { UNISWAP_V2_FEE_DENOMINATOR, UNISWAP_V2_FEE_NUMERATOR, WEI } from "./constants";

/** Uniswap V2: 0.3% of the input amount, integer floor as the subgraph computes it. */
export function uniswapV2Fee(amountIn: bigint): bigint {
  return (amountIn * UNISWAP_V2_FEE_NUMERATOR) / UNISWAP_V2_FEE_DENOMINATOR;
}

/** Balancer: amountIn * swapFeePercentage / 1e18. */
export function balancerFee(amountIn: bigint, swapFeePercentage: bigint): bigint {
  return (amountIn * swapFeePercentage) / WEI;
}

/**
 * reserve - out, clamped at zero. The subgraph clamps and warns: a negative
 * reserve can only come from partial-history indexing, and these reserves
 * feed the PoL valuation directly.
 */
export function subtractClamped(reserve: bigint, out: bigint): { value: bigint; clamped: boolean } {
  return out > reserve ? { value: 0n, clamped: true } : { value: reserve - out, clamped: false };
}

/** A Balancer pool id is the pool address left-aligned in 32 bytes. */
export function poolAddressFromPoolId(poolId: string): string {
  return poolId.slice(0, 42).toLowerCase();
}

export const dailyFeesId = (pool: string, day: bigint): string => `${pool}-${day}`;

/** Readers the handlers depend on; the shared BalancerPool / UniswapV2Pair satisfy them, tests stub them. */
export interface BalancerReader {
  getPoolId(): Promise<string | null>;
  /** Fee at `block` — read once, at the first observed swap (subgraph parity). */
  getSwapFeePercentage(block: bigint): Promise<bigint | null>;
  reservesAt(blockNumber: bigint): Promise<PoolReserves | null>;
}

export interface PairReader {
  getTokens(): Promise<[string, string] | null>;
}
