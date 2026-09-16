// Amount -> USD per payment model, at the event's block, exactly as the
// subgraph mappings do it:
//   native      Chainlink <native>/USD, or 1:1 where the native token is xDAI
//   token-usdc  1:1 (USDC, or USDG on Robinhood)
//   nvm         credits × ratio (fee in); token amount at native/USDC (fee out)
//   token-olas  Balancer pool spot price to the quote token (× native feed when
//               the quote is WMATIC/WETH), or the Ethereum Uniswap V2 pair ×
//               ETH/USD; chains without a pool record USD 0.
//
// `null` from a source means the chain could not answer (revert / no feed):
// the caller decides whether that skips the event (native, usdc — subgraph
// `return`s) or records USD 0 (olas).
import { BigDecimal } from "@subsquid/big-decimal";
import {
  BalancerPool,
  ChainlinkSource,
  Rpc,
  UniswapV2Pair,
  poolPrice,
  pow10,
  stableToUsd,
  toUsd,
  type UsdPriceSource,
} from "@olas/squid-shared";
import { CHAIN, OLAS_DECIMALS, type ChainConfig } from "./constants";
import { ZERO, nvmCreditsToUsd } from "./logic";

/** Everything a handler needs to price an amount. Tests inject stubs. */
export interface Pricing {
  /** Native wei -> USD, or null when no price is available. */
  nativeToUsd(amountWei: bigint, block: bigint): Promise<BigDecimal | null>;
  usdcToUsd(amount: bigint): BigDecimal;
  nvmCreditsToUsd(credits: bigint): BigDecimal | null;
  /** OLAS wei -> USD; ZERO when the chain has no pricing pool; null on a failed read. */
  olasToUsd(amountWei: bigint, block: bigint): Promise<BigDecimal | null>;
}

/** Spot price of OLAS in the quote token from pool reserves at a block. */
export interface OlasQuoteSource {
  /** Quote-token units per 1 OLAS (decimals-adjusted), or null. */
  olasInQuote(block: bigint): Promise<BigDecimal | null>;
}

export function makePricing(
  chain: ChainConfig,
  native: UsdPriceSource | null,
  olasQuote: OlasQuoteSource | null,
  log: { warn(msg: string): void }
): Pricing {
  return {
    async nativeToUsd(amountWei, block) {
      if (native == null) {
        // xDAI on Gnosis: the native token is a USD stable.
        return chain.nativeUsdFeed == null ? BigDecimal(amountWei).div(pow10(chain.nativeDecimals)) : null;
      }
      const p = await native.usdAt(block);
      if (p == null) return null;
      return toUsd(amountWei, chain.nativeDecimals, p);
    },
    usdcToUsd(amount) {
      return stableToUsd(amount, chain.usdcDecimals);
    },
    nvmCreditsToUsd(credits) {
      return chain.nvm == null ? null : nvmCreditsToUsd(credits, chain.nvm);
    },
    async olasToUsd(amountWei, block) {
      if (chain.olas.kind === "none" || olasQuote == null) return ZERO;
      const perOlas = await olasQuote.olasInQuote(block);
      if (perOlas == null) {
        log.warn(`[pricing] OLAS quote unavailable at block ${block} on ${chain.name}; USD 0`);
        return ZERO;
      }
      const inQuote = BigDecimal(amountWei).div(pow10(OLAS_DECIMALS)).times(perOlas);
      const viaNative =
        chain.olas.kind === "uniswap-v2" || (chain.olas.kind === "balancer-v2" && chain.olas.quoteIsNative);
      if (!viaNative) return inQuote;
      if (native == null) return null;
      const p = await native.usdAt(block);
      if (p == null) {
        log.warn(`[pricing] native/USD unavailable at block ${block} on ${chain.name} for OLAS; USD 0`);
        return ZERO;
      }
      // quote is 18-decimal native here (WETH / WMATIC): scale back to wei,
      // truncating as the subgraph's `truncate(0)` does (not half-up).
      const quoteWei = BigInt(inQuote.times(pow10(chain.nativeDecimals)).round(0, 0).toFixed(0));
      return toUsd(quoteWei, chain.nativeDecimals, p);
    },
  };
}

/** Production sources for CHAIN. */
export function makeSources(rpc: Rpc, log: { warn(msg: string): void }) {
  const native = CHAIN.nativeUsdFeed == null ? null : new ChainlinkSource(rpc, CHAIN.nativeUsdFeed, log);
  let olasQuote: OlasQuoteSource | null = null;
  const olas = CHAIN.olas;
  if (olas.kind === "balancer-v2") {
    const pool = new BalancerPool(rpc, olas.pool, olas.vault);
    olasQuote = {
      async olasInQuote(block) {
        const r = await pool.reservesAt(block);
        return r == null ? null : poolPrice(r, olas.olas, OLAS_DECIMALS, olas.quote, olas.quoteDecimals);
      },
    };
  } else if (olas.kind === "uniswap-v2") {
    const pair = new UniswapV2Pair(rpc, olas.pair);
    olasQuote = {
      async olasInQuote(block) {
        const r = await pair.reservesAt(block);
        if (r == null) return null;
        const weth = r.tokens.find((t) => t !== olas.olas);
        return weth == null ? null : poolPrice(r, olas.olas, OLAS_DECIMALS, weth, 18);
      },
    };
  }
  return { native, olasQuote };
}
