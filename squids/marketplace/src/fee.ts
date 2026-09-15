// Fee -> USD (subgraph fee-utils.ts, reduced to native-via-Chainlink and a
// 6-decimal stablecoin at 1:1). TOKEN / CREDITS have no price source on
// these chains and convert to $0 with a warning. Every failure yields $0.
//
// The price source and the arithmetic live in @olas/squid-shared; this
// module only maps the marketplace's fee units onto them.

import { BigDecimal } from "@subsquid/big-decimal";
import { NO_PRICE_SOURCE, ZERO_USD, pow10, stableToUsd, toUsd, type UsdPrice, type UsdPriceSource } from "@olas/squid-shared";
import {
  CHAIN,
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

export { NO_PRICE_SOURCE, ZERO_USD, pow10 };

export async function convertFeeToUsd(
  feeRaw: bigint,
  feeUnit: FeeUnitName,
  blockNumber: bigint,
  price: NativePriceSource,
  log: { warn(msg: string): void }
): Promise<BigDecimal> {
  switch (feeUnit) {
    case FEE_UNIT_NATIVE: {
      const p = await price.usdAt(blockNumber);
      if (p == null) {
        log.warn(
          `[fee] native/USD price unavailable at block ${blockNumber} on ` +
            `${CHAIN.name}; returning $0 for ${feeRaw} wei`
        );
        return ZERO_USD;
      }
      return toUsd(feeRaw, CHAIN.nativeDecimals, p);
    }
    case FEE_UNIT_USDC:
      return stableToUsd(feeRaw, CHAIN.usdcDecimals);
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
