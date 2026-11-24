// globalMetrics.ts: median / SMA arithmetic and DailyPopulationMetric.

import { describe, expect, it } from "vitest";
import { GD, gd } from "../src/decimal";
import {
  calculate7DaysSMA,
  calculateGlobalMetrics,
  calculateMedian,
  dailyPopulationMetricId,
  pushHistory,
} from "../src/globalMetrics";
import { SERVICE_REGISTRY_ID, utf8Hex } from "../src/ids";
import { AgentPortfolio, AgentPortfolioSnapshot, DailyPopulationMetric, FundingBalance, Service, ServiceRegistry } from "../src/model";
import { snapshotId } from "../src/portfolio";
import { addr, setup } from "./helpers";

const g = (xs: string[]) => xs.map(gd);
const str = (x: GD) => x.toFixed();

describe("calculateMedian / calculate7DaysSMA", () => {
  it("median: 0 for none, the value for one, the middle or the mean of the two middles", () => {
    expect(str(calculateMedian([]))).toBe("0");
    expect(str(calculateMedian(g(["-4.5"])))).toBe("-4.5");
    expect(str(calculateMedian(g(["3", "1", "2"])))).toBe("2");
    expect(str(calculateMedian(g(["4", "1", "3", "2"])))).toBe("2.5");
    expect(str(calculateMedian(g(["1", "2"])))).toBe("1.5");
    // 1 + 0.666…67 rounds at the plus (34 digits), then halves exactly
    expect(str(calculateMedian([gd("1"), gd("2").div(gd("3"))]))).toBe("0.8333333333333333333333333333333335");
  });

  it("does not reorder the caller's array", () => {
    const xs = g(["3", "1", "2"]);
    calculateMedian(xs);
    expect(xs.map(str)).toEqual(["3", "1", "2"]);
  });

  it("SMA: sum / n with graph-node division; 0 for none or more than 7", () => {
    expect(str(calculate7DaysSMA([]))).toBe("0");
    expect(str(calculate7DaysSMA(g(["1", "2", "4"])))).toBe("2.333333333333333333333333333333333");
    expect(str(calculate7DaysSMA(g(["-1", "-1", "0"])))).toBe("-0." + "6".repeat(35)); // a negative keeps 35 digits
    expect(str(calculate7DaysSMA(g(["1", "1", "1", "1", "1", "1", "1", "1"])))).toBe("0");
  });

  it("keeps the last 7 history values without touching the input", () => {
    const h = g(["1", "2", "3", "4", "5", "6", "7"]);
    expect(pushHistory(h, gd("8")).map(str)).toEqual(["2", "3", "4", "5", "6", "7", "8"]);
    expect(h).toHaveLength(7);
  });
});

// --- Against an independent rational reference -------------------------------

/** Exact rational n / d, d > 0. */
type Q = { n: bigint; d: bigint };
const abs = (x: bigint) => (x < 0n ? -x : x);
const parseQ = (s: string): Q => {
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const n = BigInt(i + f);
  return { n: neg ? -n : n, d: 10n ** BigInt(f.length) };
};
const addQ = (a: Q, b: Q): Q => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const divQ = (a: Q, k: bigint): Q => ({ n: a.n, d: a.d * k });
const eqQ = (a: Q, b: Q) => a.n * b.d === b.n * a.d;
/** floor(log10(|q|)), q != 0. */
function mag(q: Q): number {
  let e = abs(q.n).toString().length - q.d.toString().length;
  const ge = (k: number) => (k >= 0 ? abs(q.n) >= q.d * 10n ** BigInt(k) : abs(q.n) * 10n ** BigInt(-k) >= q.d);
  while (!ge(e)) e--;
  while (ge(e + 1)) e++;
  return e;
}
/** Positive q rounded half-up to 34 significant digits. */
function round34(q: Q): Q {
  if (q.n === 0n) return { n: 0n, d: 1n };
  const shift = 33 - mag(q); // q * 10^shift is in [1e33, 1e34)
  const num = shift >= 0 ? q.n * 10n ** BigInt(shift) : q.n;
  const den = shift >= 0 ? q.d : q.d * 10n ** BigInt(-shift);
  let int = num / den;
  if (2n * (num % den) >= den) int += 1n;
  return shift >= 0 ? { n: int, d: 10n ** BigInt(shift) } : { n: int * 10n ** BigInt(-shift), d: 1n };
}
/** One unit in the 34th significant digit of q. */
const ulp = (q: Q): Q => {
  const e = mag(q) - 33;
  return e >= 0 ? { n: 10n ** BigInt(e), d: 1n } : { n: 1n, d: 10n ** BigInt(-e) };
};
const leQ = (a: Q, b: Q) => a.n * b.d <= b.n * a.d;
const absQ = (q: Q): Q => ({ n: abs(q.n), d: q.d });
const subQ = (a: Q, b: Q): Q => addQ(a, { n: -b.n, d: b.d });

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A decimal of up to 30 significant digits (exact under normalization), magnitude 1e-12 .. 1e15. */
function randomDecimal(r: () => number, sign: 1 | -1 | 0): string {
  const digits = 1 + Math.floor(r() * 30);
  let s = "";
  for (let i = 0; i < digits; i++) s += Math.floor(r() * 10);
  s = s.replace(/^0+/, "") || "1";
  const point = Math.floor(r() * (s.length + 12)) - 12; // digits before the point
  const body = point <= 0 ? "0." + "0".repeat(-point) + s : point >= s.length ? s + "0".repeat(Math.floor(r() * 3)) : s.slice(0, point) + "." + s.slice(point);
  const neg = sign === -1 || (sign === 0 && r() < 0.5);
  return (neg ? "-" : "") + body;
}

describe("median and SMA use graph-node's 34-digit division (rational reference, 100k cases)", () => {
  // 100k cases on BigInt arithmetic take ~15 s.
  const SLOW = 120_000;
  it("positives: bit-exact against half-up-at-34-digits after every plus and div", () => {
    const r = rng(2334);
    for (let i = 0; i < 60_000; i++) {
      const n = i % 2 === 0 ? 2 : 1 + Math.floor(r() * 7);
      const xs = Array.from({ length: n }, () => randomDecimal(r, 1));
      // reference
      let got: GD;
      let want: Q;
      if (i % 2 === 0) {
        got = calculateMedian(xs.map(gd));
        want = round34(divQ(round34(addQ(parseQ(xs[0]), parseQ(xs[1]))), 2n));
      } else {
        got = calculate7DaysSMA(xs.map(gd));
        let acc: Q = { n: 0n, d: 1n };
        for (const x of xs) acc = round34(addQ(acc, parseQ(x)));
        want = round34(divQ(acc, BigInt(n)));
      }
      if (!eqQ(parseQ(got.toFixed()), want)) throw new Error(`case ${i}: ${xs.join(",")} -> ${got.toFixed()}`);
    }
  }, SLOW);

  it("mixed signs: within graph-node's rounding (one 34th-digit unit per step) of the exact value", () => {
    const r = rng(1898);
    for (let i = 0; i < 40_000; i++) {
      const n = i % 2 === 0 ? 2 : 1 + Math.floor(r() * 7);
      const xs = Array.from({ length: n }, () => randomDecimal(r, 0));
      const exactSum = xs.map(parseQ).reduce(addQ, { n: 0n, d: 1n });
      const got = i % 2 === 0 ? calculateMedian(xs.map(gd)) : calculate7DaysSMA(xs.map(gd));
      if (exactSum.n === 0n) continue;
      const exact = divQ(exactSum, BigInt(n));
      const steps = BigInt(n + 1);
      const bound = { n: ulp(exact).n * steps, d: ulp(exact).d };
      // A cancelling sum can lose digits relative to the result; bound by the largest input too.
      const big = xs.map(parseQ).reduce((m, q) => (leQ(absQ(m), absQ(q)) ? q : m));
      const bound2 = { n: ulp(big).n * steps, d: ulp(big).d };
      const err = absQ(subQ(parseQ(got.toFixed()), exact));
      if (!leQ(err, bound) && !leQ(err, bound2)) throw new Error(`case ${i}: ${xs.join(",")} -> ${got.toFixed()}`);
    }
  }, SLOW);
});

// --- calculateGlobalMetrics ------------------------------------------------------

const DAY = 1_781_049_600n; // a UTC midnight
const T = DAY + 300n;
const BLOCK = 48_000_000n;
const z = gd("0").toStore();

function world(agents: { roi: string; apr?: string; upnl: string; pupnl?: string; initial?: string; final?: string; positions?: number; netUsd?: string; snappedAt?: bigint }[]) {
  const w = setup();
  const addresses = agents.map((_, i) => addr(0x100 + i));
  w.cache.set(ServiceRegistry, new ServiceRegistry({ id: SERVICE_REGISTRY_ID, serviceAddresses: addresses }));
  agents.forEach((a, i) => {
    const address = addresses[i];
    const service = new Service({ id: address, latestRegistrationTimestamp: DAY - 10n * 86400n, positionIds: [], agentInstances: [] });
    w.cache.set(Service, service);
    const ts = a.snappedAt ?? T;
    const portfolio = new AgentPortfolio({ id: address, service, lastSnapshotTimestamp: ts, lastSnapshotBlock: BLOCK, firstTradingTimestamp: 0n });
    w.cache.set(AgentPortfolio, portfolio);
    w.cache.set(AgentPortfolioSnapshot, new AgentPortfolioSnapshot({
      id: snapshotId(address, ts), service, portfolio,
      roi: gd(a.roi).toStore(), apr: gd(a.apr ?? a.roi).toStore(),
      unrealisedPnL: gd(a.upnl).toStore(), projectedUnrealisedPnL: gd(a.pupnl ?? a.upnl).toStore(),
      ethAdjustedRoi: gd(a.roi).toStore(), ethAdjustedApr: gd(a.apr ?? a.roi).toStore(),
      ethAdjustedUnrealisedPnL: gd(a.upnl).toStore(), ethAdjustedProjectedUnrealisedPnL: gd(a.pupnl ?? a.upnl).toStore(),
      initialValue: gd(a.initial ?? "100").toStore(), finalValue: gd(a.final ?? "100").toStore(),
      positionsValue: z, uninvestedValue: z, totalWithdrawnUsd: z, timestamp: ts, block: BLOCK,
      totalPositions: a.positions ?? 0, totalClosedPositions: 0,
    }));
    if (a.netUsd != null) {
      w.cache.set(FundingBalance, new FundingBalance({ id: address, service, netUsd: gd(a.netUsd).toStore(), totalInUsd: z, totalOutUsd: z, totalWithdrawnUsd: z, firstInTimestamp: 0n, fundingInTxs: [], fundingOutTxs: [] }));
    }
  });
  return { ...w, addresses };
}

const at = { blockNumber: BLOCK, blockTimestamp: T };
const read = async (w: ReturnType<typeof setup>, day = DAY) => (await w.cache.get(DailyPopulationMetric, dailyPopulationMetricId(day)))!;

describe("calculateGlobalMetrics", () => {
  it("writes the day's medians, AUM, lifetime-active and staking fields", async () => {
    const w = world([
      { roi: "10", upnl: "5", positions: 3, netUsd: "1000" },
      { roi: "-20", upnl: "-8", positions: 1, netUsd: "300" },
      { roi: "30", upnl: "7", positions: 5, netUsd: "500" },
      // under $1 in and nothing left: out of the unrealised medians, still in ROI and AUM
      { roi: "0", upnl: "-100", initial: "0.5", final: "0", positions: 4, netUsd: "0.5" },
    ]);
    await calculateGlobalMetrics(w.ctx, at);
    const m = await read(w);
    expect(m.id).toBe(utf8Hex(String(DAY)));
    const f = (k: keyof DailyPopulationMetric) => (m[k] == null ? null : (m[k] as { toFixed(): string }).toFixed());
    expect({
      roi: f("medianPopulationROI"), upnl: f("medianUnrealisedPnL"), withRewards: f("medianUnrealisedPnLWithRewards"),
      ethUpnl: f("medianEthAdjustedUnrealisedPnL"), laUpnl: f("medianLifetimeActiveUnrealisedPnL"),
      aum: f("medianAUM"), laAum: f("medianLifetimeActiveAUM"), laTotal: f("totalLifetimeActiveFundedAUM"),
      total: f("totalFundedAUM"), days: f("averageAgentDaysActive"), sma: f("sma7dROI"), smaRewards: f("sma7dUnrealisedPnLWithRewards"),
    }).toEqual({
      roi: "5", // (0 + 10) / 2
      upnl: "5", // of 5, -8, 7
      withRewards: "5",
      ethUpnl: "5",
      laUpnl: "6", // lifetime active (>2 positions) and not excluded: 5, 7
      aum: "400", // (300 + 500) / 2 of 0.5, 300, 500, 1000
      laAum: "500", // 1000, 500, 0.5
      laTotal: "1500.5",
      total: "1800.5",
      days: "10.00347222222222222222222222222222", // (10 days + 300 s) from registration
      sma: "5",
      smaRewards: null,
    });
    expect([m.totalAgents, m.totalLifetimeActiveAgents, m.timestamp, m.block]).toEqual([4, 3, DAY, BLOCK]);
    expect(m.historicalMedianROI).toEqual(["5"]);
  });

  it("counts as lifetime active only agents with more than 2 positions (exactly 2 is out)", async () => {
    const w = world([
      { roi: "1", upnl: "10", positions: 2, netUsd: "100" },
      { roi: "1", upnl: "20", positions: 3, netUsd: "300" },
    ]);
    await calculateGlobalMetrics(w.ctx, at);
    const m = await read(w);
    expect(m.totalLifetimeActiveAgents).toBe(1);
    expect(m.medianLifetimeActiveUnrealisedPnL!.toFixed()).toBe("20");
    expect(m.totalLifetimeActiveFundedAUM!.toFixed()).toBe("300");
  });

  it("extends the previous day's history (last 7), leaves that row alone, and skips a day that exists", async () => {
    const w = world([{ roi: "8", upnl: "1", netUsd: "1" }]);
    const prevHistory = ["1", "2", "3", "4", "5", "6", "7"];
    const prev = new DailyPopulationMetric({ id: dailyPopulationMetricId(DAY - 86400n), historicalMedianROI: [...prevHistory], historicalMedianLifetimeActiveAUM: null });
    w.cache.set(DailyPopulationMetric, prev);
    await calculateGlobalMetrics(w.ctx, at);
    const m = await read(w);
    expect(m.historicalMedianROI).toEqual(["2", "3", "4", "5", "6", "7", "8"]);
    expect(m.sma7dROI.toFixed()).toBe("5");
    expect(m.historicalMedianLifetimeActiveAUM).toEqual(["0"]); // a null history starts empty
    expect(prev.historicalMedianROI).toEqual(prevHistory);

    // A later snapshot the same day: the row is immutable, nothing changes.
    const before = { ...m };
    (await w.cache.get(AgentPortfolioSnapshot, snapshotId(w.addresses[0], T)))!.roi = gd("99").toStore();
    await calculateGlobalMetrics(w.ctx, { blockNumber: BLOCK + 1800n, blockTimestamp: T + 360n });
    expect({ ...(await read(w)) }).toEqual(before);
  });

  it("counts only snapshots taken on this UTC day, and writes nothing without one", async () => {
    const w = world([{ roi: "1", upnl: "1", snappedAt: DAY - 1n }, { roi: "3", upnl: "3" }]);
    await calculateGlobalMetrics(w.ctx, at);
    expect((await read(w)).totalAgents).toBe(1);
    const v = world([{ roi: "1", upnl: "1", snappedAt: DAY - 1n }]);
    await calculateGlobalMetrics(v.ctx, at);
    expect(await v.cache.get(DailyPopulationMetric, dailyPopulationMetricId(DAY))).toBeUndefined();
  });
});
