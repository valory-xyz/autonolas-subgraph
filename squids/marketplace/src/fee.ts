// Fee -> USD, the subgraph's fee-utils.ts per chain: native via Chainlink,
// a 6-decimal stablecoin at 1:1, NVM credits at the contracts' fixed ratio,
// and OLAS via a Balancer V2 OLAS/stablecoin pool. A chain without a source
// for a unit converts it to $0 with a warning. Every failure yields $0.
//
// Arithmetic follows graph-node's BigDecimal, not plain big.js: every
// operation's result is rounded to 34 significant digits (half-up), in the
// subgraph's operation order. Values a consumer sees are then identical to
// the subgraph's, running totals included, not just equal to ~34 digits.

import { BigDecimal } from "@subsquid/big-decimal";
import { NO_PRICE_SOURCE, ZERO_USD, pow10, type UsdPrice, type UsdPriceSource } from "@olas/squid-shared";
import {
  CHAIN,
  ChainConfig,
  FEE_UNIT_CREDITS,
  FEE_UNIT_NATIVE,
  FEE_UNIT_TOKEN,
  FEE_UNIT_USDC,
  FeeUnitName,
} from "./constants";

/** Feed answer, fixed point with `decimals` decimals. */
export type NativePrice = UsdPrice;

/**
 * Where the native price comes from. Production wires the shared
 * `ChainlinkSource` (src/rpc.ts); tests inject a stub. `null` = no price
 * available, which converts to $0 with a warning (the subgraph's `.reverted`).
 */
export type NativePriceSource = UsdPriceSource;

/** OLAS and stablecoin balances of the OLAS pool at a block (raw units). */
export interface OlasPoolBalances {
  olas: bigint;
  stable: bigint;
  /**
   * Configured tokens the pool does not hold (read as balance 0, like the
   * subgraph's getPoolTokenBalances). Non-empty means a config error, not an
   * empty pool.
   */
  missingTokens?: string[];
}

/** Null when the pool cannot be read (the subgraph's reverted getPoolId / getPoolTokens). */
export interface OlasPoolSource {
  balancesAt(blockNumber: bigint): Promise<OlasPoolBalances | null>;
}

export const NO_OLAS_POOL: OlasPoolSource = { balancesAt: async () => null };

export { NO_PRICE_SOURCE, ZERO_USD, pow10 };

// --- graph-node BigDecimal arithmetic -----------------------------------

/** graph-node normalizes every BigDecimal to 34 significant digits. */
const GN_SIGNIFICANT_DIGITS = 34;
/**
 * big.js rounding mode for half-up (big.js `Big.roundHalfUp`; @subsquid/
 * big-decimal does not re-export the constants). graph-node pins bigdecimal
 * 0.1.2, whose `with_prec` rounds half-up. Checked at load below, so a
 * library change fails startup instead of silently changing the last digit.
 */
const ROUND_HALF_UP = 1;
for (const [x, want] of [["0.25", "0.3"], ["0.35", "0.4"], ["0.24", "0.2"], ["-0.25", "-0.3"]]) {
  const got = BigDecimal(x).prec(1, ROUND_HALF_UP).toFixed();
  if (got !== want) {
    throw new Error(`big-decimal rounding mode ${ROUND_HALF_UP} is not half-up: ${x} -> ${got}`);
  }
}

/** Round like graph-node's `BigDecimal::normalized()` (34 digits, half-up). */
export function gn(x: BigDecimal): BigDecimal {
  return x.eq(0) ? ZERO_USD : x.prec(GN_SIGNIFICANT_DIGITS, ROUND_HALF_UP);
}

const gnTimes = (a: BigDecimal, b: BigDecimal) => gn(a.times(b));
const gnDiv = (a: BigDecimal, b: BigDecimal) => gn(a.div(b));
/** A running USD total: the subgraph's `a.plus(b)`. */
export const gnPlus = (a: BigDecimal, b: BigDecimal) => gn(a.plus(b));

/** `BigInt.toBigDecimal()`. */
const dec = (x: bigint) => gn(BigDecimal(x));

// --- per-unit conversions (pure) ----------------------------------------

/** convert<Chain>NativeWeiToUsd: amount × answer / 10^feedDecimals / 10^nativeDecimals. */
export function nativeToUsd(amount: bigint, price: UsdPrice, nativeDecimals: number): BigDecimal {
  return gnDiv(gnDiv(gnTimes(dec(amount), dec(price.answer)), pow10(price.decimals)), pow10(nativeDecimals));
}

/** convertUsdcToUsd: amount / 10^decimals. */
export function stableToUsdGn(amount: bigint, decimals: number): BigDecimal {
  return gnDiv(dec(amount), pow10(decimals));
}

/** calculate<Chain>NvmCreditsToUsd: credits × ratio / 1e18 / 10^tokenDecimals. */
export function nvmCreditsToUsd(credits: bigint, ratio: string, tokenDecimals: number): BigDecimal {
  return gnDiv(gnDiv(gnTimes(dec(credits), gn(BigDecimal(ratio))), pow10(18)), pow10(tokenDecimals));
}

/**
 * calculateOlasPriceFromPool: (amount / 1e18) × ((stable / 10^sd) / (olas / 1e18)).
 * Null on a zero balance; the subgraph logs and returns 0 there.
 */
export function olasToUsd(
  amount: bigint,
  balances: OlasPoolBalances,
  stableDecimals: number
): BigDecimal | null {
  if (balances.olas === 0n || balances.stable === 0n) return null;
  const amountDec = gnDiv(dec(amount), pow10(18));
  const olasBal = gnDiv(dec(balances.olas), pow10(18));
  const stableBal = gnDiv(dec(balances.stable), pow10(stableDecimals));
  return gnTimes(amountDec, gnDiv(stableBal, olasBal));
}

// --- dispatcher ---------------------------------------------------------

/** Everything a fee conversion reads besides the chain table. All required. */
export interface FeeSources {
  price: NativePriceSource;
  olasPool: OlasPoolSource;
  log: { warn(msg: string): void };
}

export async function convertFeeToUsd(
  feeRaw: bigint,
  feeUnit: FeeUnitName,
  blockNumber: bigint,
  { price, olasPool, log }: FeeSources,
  chain: ChainConfig = CHAIN
): Promise<BigDecimal> {
  switch (feeUnit) {
    case FEE_UNIT_NATIVE: {
      const p = await price.usdAt(blockNumber);
      if (p == null) {
        log.warn(
          `[fee] native/USD price unavailable at block ${blockNumber} on ` +
            `${chain.name}; returning $0 for ${feeRaw} wei`
        );
        return ZERO_USD;
      }
      return nativeToUsd(feeRaw, p, chain.nativeDecimals);
    }
    case FEE_UNIT_USDC:
      return stableToUsdGn(feeRaw, chain.usdcDecimals);
    case FEE_UNIT_TOKEN: {
      if (chain.olasPool == null) {
        log.warn(
          `[fee] OLAS (TOKEN) pricing is not available on ${chain.name}; ` +
            `returning $0 for ${feeRaw}`
        );
        return ZERO_USD;
      }
      const pool = chain.olasPool.pool;
      const balances = await olasPool.balancesAt(blockNumber);
      if (balances == null) {
        log.warn(
          `[fee] OLAS pool ${pool} unreadable (call reverted or RPC failed) at block ` +
            `${blockNumber}; returning $0 for ${feeRaw}`
        );
        return ZERO_USD;
      }
      if (balances.missingTokens != null && balances.missingTokens.length > 0) {
        log.warn(
          `[fee] OLAS pool ${pool} does not hold configured token(s) ` +
            `${balances.missingTokens.join(", ")}; check olasPool in constants.ts. ` +
            `Returning $0 for ${feeRaw}`
        );
        return ZERO_USD;
      }
      const usd = olasToUsd(feeRaw, balances, chain.olasPool.stableDecimals);
      if (usd == null) {
        log.warn(
          `[fee] OLAS pool ${pool} is empty at block ${blockNumber}; returning $0 for ${feeRaw}`
        );
        return ZERO_USD;
      }
      return usd;
    }
    case FEE_UNIT_CREDITS:
      if (chain.nvmCredits == null) {
        log.warn(
          `[fee] NVM credits are not configured on ${chain.name}; returning $0 ` +
            `for ${feeRaw}`
        );
        return ZERO_USD;
      }
      return nvmCreditsToUsd(feeRaw, chain.nvmCredits.ratio, chain.nvmCredits.tokenDecimals);
    default:
      log.warn(`[fee] unknown fee unit ${String(feeUnit)}; returning $0`);
      return ZERO_USD;
  }
}
