// Population metrics: studio babydegen-base src/globalMetrics.ts
// (calculateGlobalMetrics), run by the scheduler after a poll block that
// took at least one snapshot.
//
// Every BigDecimal step is GD (graph-node's 34-digit arithmetic): the
// median of an even count is `(a + b).div(2)` and the 7-day SMA is
// `sum.div(n)`, each normalized as graph-node does.
//
// Arrays: the subgraph's calculateMedian sorts its argument in place and
// its history helpers push/shift the arrays they get. Every array it passes
// is a local or a fresh copy from `load`, so none of that reaches a stored
// row. Here the median sorts a copy and the histories are rebuilt from
// strings, so the cached previous DailyPopulationMetric is never touched.

import { GD, gd } from "./decimal";
import { SERVICE_REGISTRY_ID, utf8Hex } from "./ids";
import { AgentPortfolio, AgentPortfolioSnapshot, DailyPopulationMetric, FundingBalance, Service, ServiceRegistry } from "./model";
import { snapshotId } from "./portfolio";
import { d, type PosCtx } from "./positions";
import type { At } from "./pricing";

const ZERO = GD.ZERO;
const ONE = gd("1.0");
const TWO = gd("2");
const SECONDS_PER_DAY = gd("86400");
const ONE_DAY = 86400n;
const WINDOW = 7;

const dayTimestamp = (ts: bigint) => (ts / ONE_DAY) * ONE_DAY;

/** DailyPopulationMetric id: `Bytes.fromUTF8(dayTimestamp.toString())`. */
export const dailyPopulationMetricId = (day: bigint) => utf8Hex(day.toString());

/**
 * calculateMedian: 0 for none, the value for one, else sorted ascending
 * (by `lt`/`gt`, as graph-ts compares) and the middle value or the mean of
 * the two middle values. Sorts a copy; JS's sort is stable, as
 * AssemblyScript's insertion sort is for these sizes, so ties pick the same
 * element.
 */
export function calculateMedian(values: readonly GD[]): GD {
  if (values.length === 0) return ZERO;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => (a.lt(b) ? -1 : a.gt(b) ? 1 : 0));
  const n = sorted.length;
  if (n % 2 === 0) return sorted[n / 2 - 1].plus(sorted[n / 2]).div(TWO);
  return sorted[(n - 1) / 2];
}

/** calculate7DaysSMA: the mean of up to 7 values; 0 for none (and for more than 7, which never happens). */
export function calculate7DaysSMA(values: readonly GD[]): GD {
  if (values.length === 0 || values.length > WINDOW) return ZERO;
  let sum = ZERO;
  for (const v of values) sum = sum.plus(v);
  return sum.div(gd(values.length.toString()));
}

/** The history helpers: append, keep the last 7. Returns a new array. */
export function pushHistory(history: readonly GD[], value: GD): GD[] {
  const next = [...history, value];
  return next.length > WINDOW ? next.slice(1) : next;
}

const fromList = (xs: readonly string[] | null | undefined): GD[] => (xs ?? []).map((x) => GD.parse(x));
const toList = (xs: readonly GD[]): string[] => xs.map((x) => x.toFixed());

interface DaySnapshot {
  address: string;
  snapshot: AgentPortfolioSnapshot;
}

/** shouldExcludeFromProjectedROI: under $1 in and nothing left. */
const excludedFromProjected = (s: AgentPortfolioSnapshot) =>
  d(s.initialValue).lt(ONE) && d(s.finalValue).equals(ZERO);

/** getAllAgentSnapshotsForDay: each registered service's last snapshot, when it is on this UTC day. */
async function snapshotsForDay(ctx: PosCtx, registry: string[], day: bigint): Promise<DaySnapshot[]> {
  const out: DaySnapshot[] = [];
  for (const address of registry) {
    const portfolio = await ctx.cache.get(AgentPortfolio, address);
    if (portfolio == null || !(portfolio.lastSnapshotTimestamp > 0n)) continue;
    if (dayTimestamp(portfolio.lastSnapshotTimestamp) !== day) continue;
    const snapshot = await ctx.cache.get(AgentPortfolioSnapshot, snapshotId(address, portfolio.lastSnapshotTimestamp));
    if (snapshot != null) out.push({ address, snapshot });
  }
  return out;
}

/** FundingBalance.netUsd of each snapshot's service that has one. */
async function netUsdOf(ctx: PosCtx, snapshots: DaySnapshot[]): Promise<GD[]> {
  const out: GD[] = [];
  for (const { address } of snapshots) {
    const fb = await ctx.cache.get(FundingBalance, address);
    if (fb != null) out.push(d(fb.netUsd));
  }
  return out;
}

const sum = (xs: GD[]) => xs.reduce((acc, x) => acc.plus(x), ZERO);

/** calculateAverageAgentDaysActive: mean days since first trading (else registration) over agents with > 0 days. */
async function averageAgentDaysActive(ctx: PosCtx, registry: string[], now: bigint): Promise<GD> {
  let total = ZERO;
  let count = 0;
  for (const address of registry) {
    const portfolio = await ctx.cache.get(AgentPortfolio, address);
    if (portfolio == null) continue;
    let start = portfolio.firstTradingTimestamp;
    if (start === 0n) {
      const service = await ctx.cache.get(Service, address);
      if (service != null && service.latestRegistrationTimestamp > 0n) start = service.latestRegistrationTimestamp;
    }
    if (!(start > 0n)) continue;
    const days = GD.fromBigInt(now - start).div(SECONDS_PER_DAY);
    if (days.gt(ZERO)) {
      total = total.plus(days);
      count++;
    }
  }
  return count > 0 ? total.div(gd(count.toString())) : ZERO;
}

/**
 * calculateGlobalMetrics. Writes the day's DailyPopulationMetric unless it
 * exists (the first poll block of a day that snapshots wins; a later
 * first-snapshot that day changes nothing). No snapshot for the day: nothing.
 */
export async function calculateGlobalMetrics(ctx: PosCtx, at: At): Promise<void> {
  const day = dayTimestamp(at.blockTimestamp);
  const registry = (await ctx.cache.get(ServiceRegistry, SERVICE_REGISTRY_ID))?.serviceAddresses ?? [];
  const snapshots = await snapshotsForDay(ctx, registry, day);
  if (snapshots.length === 0) return;
  const id = dailyPopulationMetricId(day);
  // The subgraph computes everything first, but nothing before this check writes.
  if ((await ctx.cache.get(DailyPopulationMetric, id)) != null) return;

  const projected = snapshots.filter(({ snapshot }) => !excludedFromProjected(snapshot));
  const field = (xs: DaySnapshot[], k: keyof AgentPortfolioSnapshot) =>
    xs.map(({ snapshot }) => d(snapshot[k] as { toFixed(): string }));

  const medianROI = calculateMedian(field(snapshots, "roi"));
  const medianAPR = calculateMedian(field(snapshots, "apr"));
  const medianUnrealisedPnL = calculateMedian(field(projected, "unrealisedPnL"));
  const medianProjectedUnrealisedPnL = calculateMedian(field(projected, "projectedUnrealisedPnL"));
  const medianEthAdjustedROI = calculateMedian(field(snapshots, "ethAdjustedRoi"));
  const medianEthAdjustedAPR = calculateMedian(field(snapshots, "ethAdjustedApr"));
  const medianEthAdjustedUnrealisedPnL = calculateMedian(field(projected, "ethAdjustedUnrealisedPnL"));
  const medianEthAdjustedProjectedUnrealisedPnL = calculateMedian(field(projected, "ethAdjustedProjectedUnrealisedPnL"));

  // getLifetimeActiveAgentSnapshots: more than 2 positions, open or closed.
  const lifetime = snapshots.filter(({ snapshot }) => snapshot.totalPositions + snapshot.totalClosedPositions > 2);
  const lifetimeProjected = lifetime.filter(({ snapshot }) => !excludedFromProjected(snapshot));
  const medianLAUnrealisedPnL = calculateMedian(field(lifetimeProjected, "unrealisedPnL"));
  const medianLAProjectedUnrealisedPnL = calculateMedian(field(lifetimeProjected, "projectedUnrealisedPnL"));
  const medianLAEthAdjustedUnrealisedPnL = calculateMedian(field(lifetimeProjected, "ethAdjustedUnrealisedPnL"));
  const medianLAEthAdjustedProjectedUnrealisedPnL = calculateMedian(field(lifetimeProjected, "ethAdjustedProjectedUnrealisedPnL"));
  const lifetimeAUM = await netUsdOf(ctx, lifetime);
  const medianLAAUM = calculateMedian(lifetimeAUM);
  const totalLAFundedAUM = sum(lifetimeAUM);

  const medianAUM = calculateMedian(await netUsdOf(ctx, snapshots));
  let totalFundedAUM = ZERO;
  for (const address of registry) {
    const fb = await ctx.cache.get(FundingBalance, address);
    if (fb != null) totalFundedAUM = totalFundedAUM.plus(d(fb.netUsd));
  }
  const averageDays = await averageAgentDaysActive(ctx, registry, at.blockTimestamp);

  // getPreviousDailyPopulationMetric: exactly one day earlier, else no history.
  const prev = await ctx.cache.get(DailyPopulationMetric, dailyPopulationMetricId(day - ONE_DAY));
  const next = (k: keyof DailyPopulationMetric, value: GD) =>
    pushHistory(fromList(prev?.[k] as string[] | null | undefined), value);
  const hROI = next("historicalMedianROI", medianROI);
  const hAPR = next("historicalMedianAPR", medianAPR);
  const hUnrealised = next("historicalMedianUnrealisedPnL", medianUnrealisedPnL);
  const hProjected = next("historicalMedianProjectedUnrealisedPnL", medianProjectedUnrealisedPnL);
  const hEthROI = next("historicalMedianEthAdjustedROI", medianEthAdjustedROI);
  const hEthAPR = next("historicalMedianEthAdjustedAPR", medianEthAdjustedAPR);
  const hEthUnrealised = next("historicalMedianEthAdjustedUnrealisedPnL", medianEthAdjustedUnrealisedPnL);
  const hEthProjected = next("historicalMedianEthAdjustedProjectedUnrealisedPnL", medianEthAdjustedProjectedUnrealisedPnL);
  const hAUM = next("historicalMedianAUM", medianAUM);
  const hLAUnrealised = next("historicalMedianLifetimeActiveUnrealisedPnL", medianLAUnrealisedPnL);
  const hLAProjected = next("historicalMedianLifetimeActiveProjectedUnrealisedPnL", medianLAProjectedUnrealisedPnL);
  const hLAEthUnrealised = next("historicalMedianLifetimeActiveEthAdjustedUnrealisedPnL", medianLAEthAdjustedUnrealisedPnL);
  const hLAEthProjected = next("historicalMedianLifetimeActiveEthAdjustedProjectedUnrealisedPnL", medianLAEthAdjustedProjectedUnrealisedPnL);
  const hLAAUM = next("historicalMedianLifetimeActiveAUM", medianLAAUM);
  const sma = calculate7DaysSMA;

  ctx.cache.set(
    DailyPopulationMetric,
    new DailyPopulationMetric({
      id,
      medianPopulationROI: medianROI.toStore(),
      medianPopulationAPR: medianAPR.toStore(),
      medianUnrealisedPnL: medianUnrealisedPnL.toStore(),
      medianProjectedUnrealisedPnL: medianProjectedUnrealisedPnL.toStore(),
      // The subgraph sets the reward-inclusive medians to the plain ones.
      medianUnrealisedPnLWithRewards: medianUnrealisedPnL.toStore(),
      medianProjectedUnrealisedPnLWithRewards: medianProjectedUnrealisedPnL.toStore(),
      medianEthAdjustedROI: medianEthAdjustedROI.toStore(),
      medianEthAdjustedAPR: medianEthAdjustedAPR.toStore(),
      medianEthAdjustedUnrealisedPnL: medianEthAdjustedUnrealisedPnL.toStore(),
      medianEthAdjustedProjectedUnrealisedPnL: medianEthAdjustedProjectedUnrealisedPnL.toStore(),
      medianLifetimeActiveUnrealisedPnL: medianLAUnrealisedPnL.toStore(),
      medianLifetimeActiveProjectedUnrealisedPnL: medianLAProjectedUnrealisedPnL.toStore(),
      medianLifetimeActiveEthAdjustedUnrealisedPnL: medianLAEthAdjustedUnrealisedPnL.toStore(),
      medianLifetimeActiveEthAdjustedProjectedUnrealisedPnL: medianLAEthAdjustedProjectedUnrealisedPnL.toStore(),
      medianLifetimeActiveAUM: medianLAAUM.toStore(),
      totalLifetimeActiveFundedAUM: totalLAFundedAUM.toStore(),
      totalLifetimeActiveAgents: lifetime.length,
      totalFundedAUM: totalFundedAUM.toStore(),
      medianAUM: medianAUM.toStore(),
      averageAgentDaysActive: averageDays.toStore(),
      sma7dROI: sma(hROI).toStore(),
      sma7dAPR: sma(hAPR).toStore(),
      sma7dUnrealisedPnL: sma(hUnrealised).toStore(),
      sma7dProjectedUnrealisedPnL: sma(hProjected).toStore(),
      // Never set by the subgraph: null.
      sma7dUnrealisedPnLWithRewards: null,
      sma7dProjectedUnrealisedPnLWithRewards: null,
      sma7dAUM: sma(hAUM).toStore(),
      sma7dEthAdjustedROI: sma(hEthROI).toStore(),
      sma7dEthAdjustedAPR: sma(hEthAPR).toStore(),
      sma7dEthAdjustedUnrealisedPnL: sma(hEthUnrealised).toStore(),
      sma7dEthAdjustedProjectedUnrealisedPnL: sma(hEthProjected).toStore(),
      sma7dLifetimeActiveUnrealisedPnL: sma(hLAUnrealised).toStore(),
      sma7dLifetimeActiveProjectedUnrealisedPnL: sma(hLAProjected).toStore(),
      sma7dLifetimeActiveEthAdjustedUnrealisedPnL: sma(hLAEthUnrealised).toStore(),
      sma7dLifetimeActiveEthAdjustedProjectedUnrealisedPnL: sma(hLAEthProjected).toStore(),
      sma7dLifetimeActiveAUM: sma(hLAAUM).toStore(),
      timestamp: day,
      block: at.blockNumber,
      totalAgents: snapshots.length,
      historicalMedianROI: toList(hROI),
      historicalMedianAPR: toList(hAPR),
      historicalMedianUnrealisedPnL: toList(hUnrealised),
      historicalMedianProjectedUnrealisedPnL: toList(hProjected),
      historicalMedianAUM: toList(hAUM),
      historicalMedianEthAdjustedROI: toList(hEthROI),
      historicalMedianEthAdjustedAPR: toList(hEthAPR),
      historicalMedianEthAdjustedUnrealisedPnL: toList(hEthUnrealised),
      historicalMedianEthAdjustedProjectedUnrealisedPnL: toList(hEthProjected),
      historicalMedianLifetimeActiveUnrealisedPnL: toList(hLAUnrealised),
      historicalMedianLifetimeActiveProjectedUnrealisedPnL: toList(hLAProjected),
      historicalMedianLifetimeActiveEthAdjustedUnrealisedPnL: toList(hLAEthUnrealised),
      historicalMedianLifetimeActiveEthAdjustedProjectedUnrealisedPnL: toList(hLAEthProjected),
      historicalMedianLifetimeActiveAUM: toList(hLAAUM),
    }),
  );
}
