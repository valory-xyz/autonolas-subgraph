// calculatePortfolioMetrics, actual ROI and the snapshot path (helpers.ts,
// roiCalculation.ts, portfolioScheduler.ts in studio babydegen-base).

import { describe, expect, it } from "vitest";
import { BOLD, USDC_NATIVE, WETH } from "../src/constants";
import { gd } from "../src/decimal";
import { ETH_ADDRESS, SERVICE_REGISTRY_ID, tokenBalanceId, utf8Hex } from "../src/ids";
import {
  AgentPortfolio,
  AgentPortfolioSnapshot,
  FundingBalance,
  ProtocolPosition,
  Service,
  ServiceRegistry,
  Token,
  TokenBalance,
} from "../src/model";
import { calculatePortfolioMetrics, ensureAgentPortfolio, snapshotId } from "../src/portfolio";
import { aggregateClosedPositionMetrics, calculateActualROI } from "../src/positions";
import { handleSchedulerBlock } from "../src/scheduler";
import { addr, setup } from "./helpers";

const SAFE = addr(0x5a);
const REGISTERED = 1_781_000_000n;
const DAY = 86400n;
const NOW = REGISTERED + 10n * DAY; // 10 days in: 365 / 10 = 36.5
const at = (blockTimestamp = NOW, blockNumber = 48_000_000n) => ({ blockNumber, blockTimestamp });
const s = (x: string) => gd(x).toStore();
const z = s("0");

function token(id: string, symbol: string, decimals: bigint, usd: string, ts: bigint) {
  return new Token({
    id, symbol, name: symbol, decimals, derivedUSD: s(usd), priceSources: [], lastPriceUpdate: ts,
    priceConfidence: s("0.99"), priceStale: false, depegged: false,
  });
}

function position(id: string, over: Partial<ProtocolPosition>): ProtocolPosition {
  return new ProtocolPosition({
    id, agent: SAFE, protocol: "test-venue", pool: ETH_ADDRESS, isActive: true,
    usdCurrent: z, usdCurrentWithRewards: z, amount0USD: z, amount1USD: z, entryAmountUSD: z, totalCostsUSD: z,
    swapSlippageUSD: z, investmentUSD: z, grossGainUSD: z, netGainUSD: z, positionROI: z, collectedFees0: z,
    collectedFees1: z, collectedFeesUSD: z, claimedRewards: z, claimedRewardsUSD: z, entryTimestamp: REGISTERED,
    ...over,
  });
}

/**
 * Funded $1000, withdrew $100. Holds 500 USDC ($500) and 0.1 ETH ($300).
 * One active position ($200, $250 with rewards; an unknown venue, so the
 * snapshot's position refresh skips it) and one closed: in $100, out $120
 * plus $5 fees.
 *
 * Rows every filter must ignore: a drained BOLD balance whose balanceUSD is
 * stale ($999), and the closed position's stale usdCurrent ($77 / $88 with
 * rewards) and token0 leg (5 USDC booked at $1).
 */
function world() {
  const w = setup();
  const service = new Service({
    id: SAFE, operatorSafe: addr(0x0a), positionIds: ["0x01", "0x02"], agentInstances: [],
    latestRegistrationTimestamp: REGISTERED, latestMultisigBlock: 47_200_000n,
  });
  w.cache.set(Service, service);
  w.cache.set(FundingBalance, new FundingBalance({
    id: SAFE, service, totalInUsd: s("1000"), totalOutUsd: z, totalWithdrawnUsd: s("100"), netUsd: s("1000"),
    firstInTimestamp: REGISTERED, lastChangeTs: REGISTERED,
  }));
  w.cache.set(TokenBalance, new TokenBalance({
    id: tokenBalanceId(SAFE, USDC_NATIVE), service, token: USDC_NATIVE, symbol: "USDC", decimals: 6,
    balance: s("500"), balanceUSD: s("500"), lastUpdated: REGISTERED, lastBlock: 1n,
  }));
  w.cache.set(TokenBalance, new TokenBalance({
    id: tokenBalanceId(SAFE, ETH_ADDRESS), service, token: ETH_ADDRESS, symbol: "ETH", decimals: 18,
    balance: s("0.1"), balanceUSD: s("300"), lastUpdated: REGISTERED, lastBlock: 1n,
  }));
  w.cache.set(TokenBalance, new TokenBalance({
    id: tokenBalanceId(SAFE, BOLD), service, token: BOLD, symbol: "BOLD", decimals: 18,
    balance: s("0"), balanceUSD: s("999"), lastUpdated: REGISTERED, lastBlock: 1n,
  }));
  w.cache.set(ProtocolPosition, position("0x01", {
    usdCurrent: s("200"), usdCurrentWithRewards: s("250"),
    token0: USDC_NATIVE, amount0: s("150"), amount0USD: s("150"), token1: WETH, amount1: s("0"), amount1USD: s("50"),
  }));
  w.cache.set(ProtocolPosition, position("0x02", {
    isActive: false, entryAmountUSD: s("100"), exitAmountUSD: s("120"), collectedFeesUSD: s("5"),
    usdCurrent: s("77"), usdCurrentWithRewards: s("88"), token0: USDC_NATIVE, amount0: s("5"), amount0USD: s("1"),
  }));
  return { ...w, service };
}

describe("calculatePortfolioMetrics", () => {
  it("values the portfolio, unrealised and actual ROI/APR, as the subgraph does", async () => {
    const w = world();
    const p = await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    p.firstTradingTimestamp = REGISTERED;
    p.firstFundingEthPrice = s("2500");
    await calculatePortfolioMetrics(w.ctx, SAFE, at());

    const got = (await w.cache.get(AgentPortfolio, SAFE))!;
    const fields = Object.fromEntries(
      ([
        "initialValue", "positionsValue", "uninvestedValue", "totalWithdrawnUsd", "finalValue", "finalValueWithoutRewards",
        "unrealisedPnL", "projectedUnrealisedPnL", "unrealisedPnLWithRewards", "projectedUnrealisedPnLWithRewards",
        "roi", "apr", "ethAdjustedRoi", "ethAdjustedApr", "ethAdjustedUnrealisedPnL", "ethAdjustedProjectedUnrealisedPnL",
        "totalInvestments", "totalGrossGains", "totalCosts", "currentEthPrice", "firstFundingEthPrice",
      ] as const).map((k) => [k, gd(got[k].toFixed()).toString()]),
    );
    expect(fields).toEqual({
      initialValue: "1000",
      positionsValue: "250", // the with-rewards sum
      uninvestedValue: "800",
      totalWithdrawnUsd: "100",
      finalValue: "1150", // 250 + 800 + 100
      finalValueWithoutRewards: "1100", // 200 + 800 + 100
      unrealisedPnL: "15", // (1150 - 1000) / 1000 * 100
      projectedUnrealisedPnL: "547.5", // * 365 / 10
      unrealisedPnLWithRewards: "15",
      projectedUnrealisedPnLWithRewards: "547.5",
      roi: "25", // (125 - 100 - 0) / (100 + 0) * 100
      apr: "912.5",
      ethAdjustedRoi: "25",
      ethAdjustedApr: "912.5",
      ethAdjustedUnrealisedPnL: "15",
      ethAdjustedProjectedUnrealisedPnL: "547.5",
      totalInvestments: "100",
      totalGrossGains: "125",
      totalCosts: "0",
      currentEthPrice: "3000",
      firstFundingEthPrice: "2500", // kept
    });
    expect([got.totalPositions, got.totalClosedPositions, got.lastUpdated]).toEqual([1, 1, NOW]);
    expect(await w.cache.get(AgentPortfolioSnapshot, snapshotId(SAFE, NOW))).toBeUndefined();
  });

  it("falls back to the registration timestamp and prices ETH at the handler's block", async () => {
    const w = world();
    await calculatePortfolioMetrics(w.ctx, SAFE, at());
    const got = (await w.cache.get(AgentPortfolio, SAFE))!;
    expect(got.firstTradingTimestamp).toBe(REGISTERED);
    expect(got.firstFundingEthPrice.toFixed()).toBe("3000");
    // The APR used the registration timestamp too (365 / 10).
    expect(got.projectedUnrealisedPnL.toFixed()).toBe("547.5");
  });

  it("is a no-op for an address with no Service, and keeps ROI at 0 with no funding", async () => {
    const w = setup();
    await calculatePortfolioMetrics(w.ctx, SAFE, at());
    expect(await w.cache.get(AgentPortfolio, SAFE)).toBeUndefined();

    const v = world();
    v.cache.remove(FundingBalance, SAFE);
    await calculatePortfolioMetrics(v.ctx, SAFE, at());
    const got = (await v.cache.get(AgentPortfolio, SAFE))!;
    expect([got.initialValue, got.unrealisedPnL, got.projectedUnrealisedPnL].map((x) => gd(x.toFixed()).toString())).toEqual(["0", "0", "0"]);
    expect(got.finalValue.toFixed()).toBe("1050"); // no withdrawals either
  });
});

describe("division guards (a zero would stall the processor)", () => {
  it("leaves every APR at 0 when no time has passed since the start (funded in the registration block)", async () => {
    const w = world();
    const p = await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    p.firstTradingTimestamp = REGISTERED;
    await calculatePortfolioMetrics(w.ctx, SAFE, at(REGISTERED));
    const got = (await w.cache.get(AgentPortfolio, SAFE))!;
    expect(got.unrealisedPnL.toFixed()).toBe("15"); // the ROI itself is still computed
    expect([got.projectedUnrealisedPnL, got.projectedUnrealisedPnLWithRewards, got.apr, got.ethAdjustedApr].map((x) => x.toFixed())).toEqual(["0", "0", "0", "0"]);
  });

  it("keeps actual ROI at 0 for closed positions with no investment and no costs", async () => {
    const w = world();
    const closed = (await w.cache.get(ProtocolPosition, "0x02"))!;
    closed.entryAmountUSD = z;
    closed.totalCostsUSD = z;
    expect((await calculateActualROI(w.ctx, SAFE)).toString()).toBe("0");
    await calculatePortfolioMetrics(w.ctx, SAFE, at());
    expect((await w.cache.get(AgentPortfolio, SAFE))!.roi.toFixed()).toBe("0");
  });
});

describe("actual ROI (roiCalculation.ts)", () => {
  it("is 0 with no closed position and keeps a loss negative; APR only for a positive ROI", async () => {
    const w = world();
    const closed = (await w.cache.get(ProtocolPosition, "0x02"))!;
    closed.exitAmountUSD = s("50");
    closed.totalCostsUSD = s("10");
    closed.collectedFeesUSD = z;
    // (50 - 100 - 10) / 110 * 100: graph-node truncates a negative and keeps 35 digits (decimal.ts)
    expect((await calculateActualROI(w.ctx, SAFE)).toString()).toBe("-54.545454545454545454545454545454545");
    await calculatePortfolioMetrics(w.ctx, SAFE, at());
    expect((await w.cache.get(AgentPortfolio, SAFE))!.apr.toFixed()).toBe("0");

    closed.isActive = true;
    expect((await calculateActualROI(w.ctx, SAFE)).toString()).toBe("0");
    const agg = await aggregateClosedPositionMetrics(w.ctx, SAFE);
    expect([agg.totalInvestments, agg.totalGrossGains, agg.totalCosts].map(String)).toEqual(["0", "0", "0"]);
  });
});

describe("snapshots (portfolioScheduler.ts)", () => {
  function registered() {
    const w = world();
    w.cache.set(ServiceRegistry, new ServiceRegistry({ id: SERVICE_REGISTRY_ID, serviceAddresses: [SAFE] }));
    w.cache.set(Token, token(USDC_NATIVE, "USDC", 6n, "1", NOW));
    w.cache.set(Token, token(WETH, "WETH", 18n, "3100", NOW));
    w.cache.set(Token, token(BOLD, "BOLD", 18n, "1", NOW));
    return w;
  }

  it("refreshes USD values, copies the portfolio into an immutable snapshot and tracks it", async () => {
    const w = registered();
    const p = await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    p.firstTradingTimestamp = REGISTERED;
    expect(await handleSchedulerBlock(w.ctx, at())).toBe(true);

    // Repriced: 0.1 ETH at WETH's $3100; the position's USDC leg 150 -> $150 unchanged, so not saved.
    const eth = (await w.cache.get(TokenBalance, tokenBalanceId(SAFE, ETH_ADDRESS)))!;
    expect([eth.balanceUSD.toFixed(), eth.lastUpdated, eth.lastBlock]).toEqual(["310", NOW, 48_000_000n]);
    const snap = (await w.cache.get(AgentPortfolioSnapshot, snapshotId(SAFE, NOW)))!;
    expect(snap.id).toBe(utf8Hex(`${SAFE}-${NOW}`));
    expect(snap.uninvestedValue.toFixed()).toBe("810");
    const portfolio = (await w.cache.get(AgentPortfolio, SAFE))!;
    const copied = [
      "finalValue", "initialValue", "positionsValue", "uninvestedValue", "totalWithdrawnUsd",
      "roi", "apr", "unrealisedPnL", "projectedUnrealisedPnL",
      "ethAdjustedRoi", "ethAdjustedApr", "ethAdjustedUnrealisedPnL", "ethAdjustedProjectedUnrealisedPnL",
    ] as const;
    expect(copied.map((k) => [k, snap[k].toFixed()])).toEqual(copied.map((k) => [k, portfolio[k].toFixed()]));
    // Distinct values, so a field copied from the wrong source shows.
    expect(copied.map((k) => snap[k].toFixed())).toEqual([
      "1160", "1000", "250", "810", "100", "25", "912.5", "16", "584", "25", "912.5", "16", "584",
    ]);
    expect([snap.portfolio.id, snap.service.id]).toEqual([SAFE, SAFE]);

    // Ignored rows: the drained BOLD balance is not repriced, the closed position's leg is not repriced.
    const bold = (await w.cache.get(TokenBalance, tokenBalanceId(SAFE, BOLD)))!;
    expect([bold.balanceUSD.toFixed(), bold.lastUpdated]).toEqual(["999", REGISTERED]);
    const closed = (await w.cache.get(ProtocolPosition, "0x02"))!;
    expect([closed.amount0USD.toFixed(), closed.usdCurrent.toFixed()]).toEqual(["1", "77"]);
    expect([snap.timestamp, snap.block, snap.totalPositions, snap.totalClosedPositions]).toEqual([NOW, 48_000_000n, 1, 1]);
    expect([portfolio.lastSnapshotTimestamp, portfolio.lastSnapshotBlock]).toEqual([NOW, 48_000_000n]);
  });

  it("links the snapshot to its Service when the portfolio came from an earlier batch (relation not loaded)", async () => {
    const w = registered();
    const p = await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    (p as { service?: unknown }).service = undefined; // a store.get() without relations
    expect(await handleSchedulerBlock(w.ctx, at())).toBe(true);
    const snap = (await w.cache.get(AgentPortfolioSnapshot, snapshotId(SAFE, NOW)))!;
    expect([snap.service?.id, snap.portfolio?.id]).toEqual([SAFE, SAFE]);
  });

  it("reprices a position leg whose USD changed and resets usdCurrent to the legs' sum", async () => {
    const w = registered();
    await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    const active = (await w.cache.get(ProtocolPosition, "0x01"))!;
    active.amount0 = s("180"); // $180 now, was $150; leg 1 has no amount, so its $50 stays
    await handleSchedulerBlock(w.ctx, at());
    expect([active.amount0USD.toFixed(), active.amount1USD.toFixed(), active.usdCurrent.toFixed()]).toEqual(["180", "50", "230"]);
    expect(active.usdCurrentWithRewards.toFixed()).toBe("250"); // not touched by the USD refresh
  });

  it("reprices leg 1 (token1) too", async () => {
    const w = registered();
    await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    const active = (await w.cache.get(ProtocolPosition, "0x01"))!;
    active.amount1 = s("0.01"); // 0.01 WETH at $3100 = $31, was booked at $50
    await handleSchedulerBlock(w.ctx, at());
    expect([active.amount0USD.toFixed(), active.amount1USD.toFixed(), active.usdCurrent.toFixed()]).toEqual(["150", "31", "181"]);
  });

  it("does not save a position whose legs' USD did not change (usdCurrent is left as it was)", async () => {
    const w = registered();
    await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    const active = (await w.cache.get(ProtocolPosition, "0x01"))!;
    active.usdCurrent = s("999"); // not the legs' sum; a save would reset it to 200
    await handleSchedulerBlock(w.ctx, at());
    expect(active.usdCurrent.toFixed()).toBe("999");
  });

  it("takes one snapshot per UTC day: none later the same day, one on the next", async () => {
    const w = registered();
    await ensureAgentPortfolio(w.ctx, SAFE, REGISTERED);
    const midnight = (NOW / DAY + 1n) * DAY;
    expect(await handleSchedulerBlock(w.ctx, at(NOW))).toBe(true);
    expect(await handleSchedulerBlock(w.ctx, at(midnight - 1n, 48_000_001n))).toBe(false);
    expect(await handleSchedulerBlock(w.ctx, at(midnight, 48_000_002n))).toBe(true);
    expect((await w.cache.get(AgentPortfolio, SAFE))!.lastSnapshotBlock).toBe(48_000_002n);
    expect(await w.cache.get(AgentPortfolioSnapshot, snapshotId(SAFE, midnight - 1n))).toBeUndefined();
    expect(await w.cache.get(AgentPortfolioSnapshot, snapshotId(SAFE, midnight))).toBeDefined();
  });

  it("skips a registered service with no portfolio", async () => {
    const w = registered();
    expect(await handleSchedulerBlock(w.ctx, at())).toBe(false);
  });
});
