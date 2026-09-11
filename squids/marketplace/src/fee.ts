// Fee -> USD conversion, ported from the subgraph's fee-utils.ts and cut down
// to what this chain family has: a native token priced by a Chainlink feed
// and a 6-decimal USD stablecoin at 1:1. There is no OLAS leg (no pool to
// price it) and no NVM credits leg on these chains, so TOKEN and CREDITS
// convert to $0 with a warning — the subgraph does the same for OLAS on
// Celo. Raw amounts are always preserved on the entities.
//
// Semantics carried over: conversions read the price AT THE BLOCK being
// indexed (no TWAP), and every failure is non-fatal and yields $0.

import { BigDecimal } from "@subsquid/big-decimal";
import {
  CHAIN,
  FEE_UNIT_CREDITS,
  FEE_UNIT_NATIVE,
  FEE_UNIT_TOKEN,
  FEE_UNIT_USDC,
  FeeUnitName,
} from "./constants";

export interface NativePrice {
  /** Feed answer, fixed point with `decimals` decimals. */
  answer: bigint;
  decimals: number;
}

/**
 * Where the native price comes from. Production wires `rpcPriceSource`
 * (src/rpc.ts); tests inject a stub. `null` = no price available, which
 * converts to $0 with a warning (the subgraph's `.reverted` branch).
 */
export interface NativePriceSource {
  usdPerNative(blockNumber: bigint): Promise<NativePrice | null>;
}

/** A source for chains without a feed, and for tests. */
export const NO_PRICE_SOURCE: NativePriceSource = {
  usdPerNative: async () => null,
};

export const ZERO_USD = BigDecimal(0);

export function pow10(n: number): BigDecimal {
  return BigDecimal(10).pow(n);
}

export async function convertFeeToUsd(
  feeRaw: bigint,
  feeUnit: FeeUnitName,
  blockNumber: bigint,
  price: NativePriceSource,
  log: { warn(msg: string): void }
): Promise<BigDecimal> {
  switch (feeUnit) {
    case FEE_UNIT_NATIVE: {
      const p = await price.usdPerNative(blockNumber);
      if (p == null) {
        log.warn(
          `[fee] native/USD price unavailable at block ${blockNumber} on ` +
            `${CHAIN.name}; returning $0 for ${feeRaw} wei`
        );
        return ZERO_USD;
      }
      return BigDecimal(feeRaw)
        .times(BigDecimal(p.answer))
        .div(pow10(p.decimals))
        .div(pow10(CHAIN.nativeDecimals));
    }
    case FEE_UNIT_USDC:
      return BigDecimal(feeRaw).div(pow10(CHAIN.usdcDecimals));
    case FEE_UNIT_TOKEN:
      log.warn(
        `[fee] OLAS (TOKEN) pricing is not available on ${CHAIN.name}; ` +
          `returning $0 for ${feeRaw}`
      );
      return ZERO_USD;
    case FEE_UNIT_CREDITS:
      log.warn(
        `[fee] NVM credits are not configured on ${CHAIN.name}; returning $0 ` +
          `for ${feeRaw}`
      );
      return ZERO_USD;
    default:
      log.warn(`[fee] unknown fee unit ${String(feeUnit)}; returning $0`);
      return ZERO_USD;
  }
}
