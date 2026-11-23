// AgentPortfolio metrics and snapshots, from studio babydegen-base
// src/helpers.ts (ensureAgentPortfolio, calculatePortfolioMetrics,
// refreshAllUSDValues, createPortfolioSnapshot), src/tokenBalances.ts
// (calculateUninvestedValue) and src/portfolioScheduler.ts
// (registerServiceForSnapshots).
//
// Every BigDecimal step goes through GD in the subgraph's order, so the
// 34-digit rounding matches graph-node. "save" is `ctx.cache.set`; nothing
// here keeps a row across another handler's save of it (the position
// refreshes the snapshot path runs never write AgentPortfolio).

import type { IEntityCache } from "@olas/squid-shared";
import { TRACKED_TOKENS, WETH } from "./constants";
import { GD, gd } from "./decimal";
import { ETH_ADDRESS, SERVICE_REGISTRY_ID, tokenBalanceId, utf8Hex } from "./ids";
import { AgentPortfolio, AgentPortfolioSnapshot, FundingBalance, ProtocolPosition, Service, ServiceRegistry, TokenBalance } from "./model";
import { aggregateClosedPositionMetrics, calculateActualROI, d, type PosCtx } from "./positions";
import { getEthUsd, getTokenPriceUSD, type At } from "./pricing";

type PortfolioCtx = { cache: IEntityCache };

const ZERO = GD.ZERO;
const HUNDRED = gd("100");
const DAYS_PER_YEAR = gd("365");
const SECONDS_PER_DAY = gd("86400");

export async function ensureAgentPortfolio(ctx: PortfolioCtx, serviceSafe: string, timestamp: bigint): Promise<AgentPortfolio> {
  const existing = await ctx.cache.get(AgentPortfolio, serviceSafe);
  if (existing != null) return existing;
  const zero = GD.ZERO.toStore();
  const portfolio = new AgentPortfolio({
    id: serviceSafe,
    service: (await ctx.cache.get(Service, serviceSafe)) ?? new Service({ id: serviceSafe }),
    firstTradingTimestamp: 0n,
    lastSnapshotTimestamp: 0n,
    lastSnapshotBlock: 0n,
    totalPositions: 0,
    totalClosedPositions: 0,
    finalValue: zero,
    finalValueWithoutRewards: zero,
    initialValue: zero,
    positionsValue: zero,
    uninvestedValue: zero,
    totalWithdrawnUsd: zero,
    unrealisedPnL: zero,
    roi: zero,
    totalInvestments: zero,
    totalGrossGains: zero,
    totalCosts: zero,
    apr: zero,
    projectedUnrealisedPnL: zero,
    unrealisedPnLWithRewards: zero,
    projectedUnrealisedPnLWithRewards: zero,
    ethAdjustedRoi: zero,
    ethAdjustedApr: zero,
    ethAdjustedUnrealisedPnL: zero,
    ethAdjustedProjectedUnrealisedPnL: zero,
    firstFundingEthPrice: zero,
    currentEthPrice: zero,
    lastUpdated: timestamp,
  });
  ctx.cache.set(AgentPortfolio, portfolio);
  return portfolio;
}

export async function registerServiceForSnapshots(ctx: PortfolioCtx, serviceAddress: string): Promise<void> {
  const registry =
    (await ctx.cache.get(ServiceRegistry, SERVICE_REGISTRY_ID)) ??
    new ServiceRegistry({ id: SERVICE_REGISTRY_ID, serviceAddresses: [] });
  if (registry.serviceAddresses.includes(serviceAddress)) return;
  registry.serviceAddresses = [...registry.serviceAddresses, serviceAddress];
  ctx.cache.set(ServiceRegistry, registry);
}

// --- tokenBalances.ts calculateUninvestedValue ---------------------------------

/** ETH plus every whitelisted token: the stored balanceUSD of each positive balance. */
export async function calculateUninvestedValue(ctx: PortfolioCtx, serviceSafe: string): Promise<GD> {
  let total = ZERO;
  for (const token of [ETH_ADDRESS, ...TRACKED_TOKENS]) {
    const balance = await ctx.cache.get(TokenBalance, tokenBalanceId(serviceSafe, token));
    if (balance != null && d(balance.balance).gt(ZERO)) total = total.plus(d(balance.balanceUSD));
  }
  return total;
}

// --- helpers.ts USD refreshes (snapshot path) ------------------------------------

/** refreshTokenBalanceUSDValues: reprices every positive balance (ETH at WETH's price), 5-minute price cache. */
async function refreshTokenBalanceUSDValues(ctx: PosCtx, serviceSafe: string, at: At): Promise<void> {
  if ((await ctx.cache.get(Service, serviceSafe)) == null) return;
  for (const token of [ETH_ADDRESS, ...TRACKED_TOKENS]) {
    const balance = await ctx.cache.get(TokenBalance, tokenBalanceId(serviceSafe, token));
    if (balance == null || !d(balance.balance).gt(ZERO)) continue;
    const price = await getTokenPriceUSD(ctx, token === ETH_ADDRESS ? WETH : token, at, false);
    balance.balanceUSD = d(balance.balance).times(price).toStore();
    balance.lastUpdated = at.blockTimestamp;
    balance.lastBlock = at.blockNumber;
    ctx.cache.set(TokenBalance, balance);
  }
}

/** refreshSinglePositionUSD: reprices each positive leg; saves (with usdCurrent) only if a leg's USD changed. */
async function refreshSinglePositionUSD(ctx: PosCtx, p: ProtocolPosition, at: At): Promise<void> {
  let changed = false;
  const leg = async (token: string | null | undefined, amount: { toFixed(): string } | null | undefined, current: GD): Promise<GD | null> => {
    if (token == null || amount == null || !d(amount).gt(ZERO)) return null;
    const usd = d(amount).times(await getTokenPriceUSD(ctx, token, at, false));
    return usd.equals(current) ? null : usd;
  };
  const usd0 = await leg(p.token0, p.amount0, d(p.amount0USD));
  if (usd0 != null) {
    p.amount0USD = usd0.toStore();
    changed = true;
  }
  const usd1 = await leg(p.token1, p.amount1, d(p.amount1USD));
  if (usd1 != null) {
    p.amount1USD = usd1.toStore();
    changed = true;
  }
  if (changed) {
    p.usdCurrent = d(p.amount0USD).plus(d(p.amount1USD)).toStore();
    ctx.cache.set(ProtocolPosition, p);
  }
}

async function refreshActivePositionUSDValues(ctx: PosCtx, serviceSafe: string, at: At): Promise<void> {
  const service = await ctx.cache.get(Service, serviceSafe);
  if (service == null) return;
  for (const id of service.positionIds) {
    const p = await ctx.cache.get(ProtocolPosition, id);
    if (p != null && p.isActive) await refreshSinglePositionUSD(ctx, p, at);
  }
}

/** refreshAllUSDValues: token balances, then active positions, at current prices. */
export async function refreshAllUSDValues(ctx: PosCtx, serviceSafe: string, at: At): Promise<void> {
  await refreshTokenBalanceUSDValues(ctx, serviceSafe, at);
  await refreshActivePositionUSDValues(ctx, serviceSafe, at);
}

// --- helpers.ts calculatePortfolioMetrics ------------------------------------------

async function sumActivePositions(ctx: PosCtx, serviceSafe: string, field: "usdCurrent" | "usdCurrentWithRewards"): Promise<GD> {
  let total = ZERO;
  const service = await ctx.cache.get(Service, serviceSafe);
  if (service == null) return total;
  for (const id of service.positionIds) {
    const p = await ctx.cache.get(ProtocolPosition, id);
    if (p != null && p.isActive) total = total.plus(d(p[field]));
  }
  return total;
}

/** firstTradingTimestamp, else the service's registration timestamp when positive, else 0. */
async function aprStartTimestamp(ctx: PosCtx, portfolio: AgentPortfolio, serviceSafe: string): Promise<bigint> {
  if (portfolio.firstTradingTimestamp !== 0n) return portfolio.firstTradingTimestamp;
  const service = await ctx.cache.get(Service, serviceSafe);
  if (service != null && service.latestRegistrationTimestamp > 0n) return service.latestRegistrationTimestamp;
  return 0n;
}

/** 365 / days since `start`, or null when `start` is not positive or no time has passed. */
function annualizationFactor(start: bigint, now: bigint): GD | null {
  if (!(start > 0n)) return null;
  const days = GD.fromBigInt(now - start).div(SECONDS_PER_DAY);
  return days.gt(ZERO) ? DAYS_PER_YEAR.div(days) : null;
}

/**
 * helpers.ts calculatePortfolioMetrics. Called after every ERC-20 inflow
 * (after its funding update) and outflow of a service safe, after both
 * SafeReceived branches, after an ExecutionSuccess that sent ETH, after
 * every CL Collect, and from the position refreshes unless their caller
 * turns it off.
 *
 * `takeSnapshot` only writes the AgentPortfolioSnapshot at the end. The
 * subgraph's takeSnapshot path first refreshes every active position and
 * all USD values; scheduler.ts snapshotPortfolio does that before calling
 * here (refresh.ts imports the position modules, which import this one).
 *
 * The registration fallback's `createBlockFromTimestamp` only changes the
 * block object; getEthUsd's eth_call still runs at the handler's block.
 */
export async function calculatePortfolioMetrics(ctx: PosCtx, serviceSafe: string, at: At, takeSnapshot = false): Promise<void> {
  if ((await ctx.cache.get(Service, serviceSafe)) == null) return;
  const portfolio = await ensureAgentPortfolio(ctx, serviceSafe, at.blockTimestamp);

  const funding = await ctx.cache.get(FundingBalance, serviceSafe);
  const initialValue = funding != null ? d(funding.netUsd) : ZERO;
  const positionsValue = await sumActivePositions(ctx, serviceSafe, "usdCurrent");
  const positionsValueWithRewards = await sumActivePositions(ctx, serviceSafe, "usdCurrentWithRewards");
  const uninvestedValue = await calculateUninvestedValue(ctx, serviceSafe);
  const totalWithdrawn = funding != null ? d(funding.totalWithdrawnUsd) : ZERO;

  const finalValueWithoutRewards = positionsValue.plus(uninvestedValue).plus(totalWithdrawn);
  const finalValue = positionsValueWithRewards.plus(uninvestedValue).plus(totalWithdrawn);
  // finalValueWithRewards is the same sum as finalValue in the subgraph.
  const finalValueWithRewards = finalValue;

  let roi = ZERO;
  let apr = ZERO;
  let roiWithRewards = ZERO;
  let aprWithRewards = ZERO;
  if (initialValue.gt(ZERO)) {
    roi = finalValue.minus(initialValue).div(initialValue).times(HUNDRED);
    roiWithRewards = finalValueWithRewards.minus(initialValue).div(initialValue).times(HUNDRED);
    const factor = annualizationFactor(await aprStartTimestamp(ctx, portfolio, serviceSafe), at.blockTimestamp);
    if (factor != null) {
      apr = roi.times(factor);
      aprWithRewards = roiWithRewards.times(factor);
    }
  }

  const actualROI = await calculateActualROI(ctx, serviceSafe);
  const aggregates = await aggregateClosedPositionMetrics(ctx, serviceSafe);
  let actualAPR = ZERO;
  if (actualROI.gt(ZERO)) {
    const factor = annualizationFactor(await aprStartTimestamp(ctx, portfolio, serviceSafe), at.blockTimestamp);
    if (factor != null) actualAPR = actualROI.times(factor);
  }

  if (portfolio.firstTradingTimestamp === 0n) {
    const service = await ctx.cache.get(Service, serviceSafe);
    if (service != null && service.latestRegistrationTimestamp > 0n) {
      portfolio.firstTradingTimestamp = service.latestRegistrationTimestamp;
      portfolio.firstFundingEthPrice = (await getEthUsd(ctx, at)).toStore();
    }
  }

  portfolio.finalValue = finalValue.toStore();
  portfolio.finalValueWithoutRewards = finalValueWithoutRewards.toStore();
  portfolio.initialValue = initialValue.toStore();
  portfolio.positionsValue = positionsValueWithRewards.toStore();
  portfolio.uninvestedValue = uninvestedValue.toStore();
  portfolio.totalWithdrawnUsd = totalWithdrawn.toStore();
  portfolio.unrealisedPnL = roi.toStore();
  portfolio.roi = actualROI.toStore();
  portfolio.apr = actualAPR.toStore();
  portfolio.projectedUnrealisedPnL = apr.toStore();
  portfolio.unrealisedPnLWithRewards = roiWithRewards.toStore();
  portfolio.projectedUnrealisedPnLWithRewards = aprWithRewards.toStore();
  portfolio.lastUpdated = at.blockTimestamp;
  // Deprecated in the subgraph: the ethAdjusted* fields equal the unadjusted values.
  portfolio.ethAdjustedRoi = actualROI.toStore();
  portfolio.ethAdjustedApr = actualAPR.toStore();
  portfolio.ethAdjustedUnrealisedPnL = roi.toStore();
  portfolio.ethAdjustedProjectedUnrealisedPnL = apr.toStore();
  const currentEthPrice = await getEthUsd(ctx, at);
  portfolio.currentEthPrice = currentEthPrice.toStore();
  if (d(portfolio.firstFundingEthPrice).equals(ZERO)) portfolio.firstFundingEthPrice = currentEthPrice.toStore();
  portfolio.totalInvestments = aggregates.totalInvestments.toStore();
  portfolio.totalGrossGains = aggregates.totalGrossGains.toStore();
  portfolio.totalCosts = aggregates.totalCosts.toStore();

  let active = 0;
  let closed = 0;
  const service = await ctx.cache.get(Service, serviceSafe);
  for (const id of service?.positionIds ?? []) {
    const p = await ctx.cache.get(ProtocolPosition, id);
    if (p == null) continue;
    if (p.isActive) active++;
    else closed++;
  }
  portfolio.totalPositions = active;
  portfolio.totalClosedPositions = closed;
  ctx.cache.set(AgentPortfolio, portfolio);

  if (takeSnapshot) createPortfolioSnapshot(ctx, portfolio, at);
}

/** AgentPortfolioSnapshot id: `Bytes.fromUTF8(portfolio.id.toHexString() + "-" + timestamp)`. */
export const snapshotId = (serviceSafe: string, timestamp: bigint) => utf8Hex(`${serviceSafe}-${timestamp}`);

function createPortfolioSnapshot(ctx: PosCtx, portfolio: AgentPortfolio, at: At): void {
  ctx.cache.set(
    AgentPortfolioSnapshot,
    new AgentPortfolioSnapshot({
      id: snapshotId(portfolio.id, at.blockTimestamp),
      service: portfolio.service,
      portfolio,
      finalValue: portfolio.finalValue,
      initialValue: portfolio.initialValue,
      positionsValue: portfolio.positionsValue,
      uninvestedValue: portfolio.uninvestedValue,
      totalWithdrawnUsd: portfolio.totalWithdrawnUsd,
      roi: portfolio.roi,
      apr: portfolio.apr,
      unrealisedPnL: portfolio.unrealisedPnL,
      projectedUnrealisedPnL: portfolio.projectedUnrealisedPnL,
      ethAdjustedRoi: portfolio.ethAdjustedRoi,
      ethAdjustedApr: portfolio.ethAdjustedApr,
      ethAdjustedUnrealisedPnL: portfolio.ethAdjustedUnrealisedPnL,
      ethAdjustedProjectedUnrealisedPnL: portfolio.ethAdjustedProjectedUnrealisedPnL,
      timestamp: at.blockTimestamp,
      block: at.blockNumber,
      totalPositions: portfolio.totalPositions,
      totalClosedPositions: portfolio.totalClosedPositions,
    }),
  );
  portfolio.lastSnapshotTimestamp = at.blockTimestamp;
  portfolio.lastSnapshotBlock = at.blockNumber;
  ctx.cache.set(AgentPortfolio, portfolio);
}
