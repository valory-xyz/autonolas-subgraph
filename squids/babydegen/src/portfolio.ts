// AgentPortfolio bootstrap and the snapshot registry, from studio
// babydegen-base src/helpers.ts (ensureAgentPortfolio) and
// src/portfolioScheduler.ts (registerServiceForSnapshots).

import type { EventMeta, IEntityCache } from "@olas/squid-shared";
import { GD } from "./decimal";
import { SERVICE_REGISTRY_ID } from "./ids";
import { AgentPortfolio, Service, ServiceRegistry } from "./model";

type PortfolioCtx = { cache: IEntityCache };

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

/**
 * helpers.ts calculatePortfolioMetrics, called from handleERC20Transfer on
 * every inflow to a service safe. It is ported with ROI and snapshots in
 * slice 3 of BDMARK-2311; the call site already sits where the subgraph calls
 * it. It writes only AgentPortfolio and reads no price that this slice caches,
 * so every other entity is unaffected, but AgentPortfolio differs until then:
 *
 * - initialValue, uninvestedValue, finalValue, finalValueWithoutRewards,
 *   totalWithdrawnUsd, unrealisedPnL, projectedUnrealisedPnL,
 *   unrealisedPnLWithRewards, projectedUnrealisedPnLWithRewards,
 *   currentEthPrice and ethAdjusted* stay 0.
 * - lastUpdated stays at the creation timestamp.
 * - firstTradingTimestamp and firstFundingEthPrice come from the first funding
 *   here. The subgraph's call runs before the funding check and falls back to
 *   the registration timestamp, so on an ERC-20 first inflow it sets them first.
 */
export async function calculatePortfolioMetrics(_ctx: PortfolioCtx, _serviceSafe: string, _meta: EventMeta): Promise<void> {}
