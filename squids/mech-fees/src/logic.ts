// Pure helpers: ids and the NVM credit formulas, ported from the subgraph's
// src/utils.ts / src/constants.ts. No store access.
import { BigDecimal } from "@subsquid/big-decimal";
import { pow10 } from "@olas/squid-shared";
import type { NvmConfig } from "./constants";

export const ZERO = BigDecimal(0);

/** Day start in seconds as a number, the subgraph's `dayStart` (i32). */
export const dayStart = (ts: bigint): number => Number((ts / 86400n) * 86400n);
export const dailyTotalsId = (ts: bigint): string => String(dayStart(ts));
export const mechDailyId = (mech: string, ts: bigint): string => `${mech}-${dayStart(ts)}`;
export const mechModelId = (mech: string, model: string): string => `${mech}-${model}`;

/** NVM fee-in: usd = credits × tokenRatio / 1e18 / 10^tokenDecimals. */
export function nvmCreditsToUsd(credits: bigint, nvm: NvmConfig): BigDecimal {
  return BigDecimal(credits).times(BigDecimal(nvm.tokenRatio)).div(pow10(18)).div(pow10(nvm.tokenDecimals));
}

/** NVM fee-out raw units: the withdrawn token amount converted back to credits. */
export function nvmTokenToCredits(amount: bigint, nvm: NvmConfig): BigDecimal {
  return BigDecimal(amount).times(pow10(18)).times(pow10(nvm.tokenDecimals)).div(BigDecimal(nvm.tokenRatio));
}
