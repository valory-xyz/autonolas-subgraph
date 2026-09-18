// The ported handlers against the shared in-memory cache and stub pricing,
// covering the subgraph's Matchstick scenarios (native fee in/out, daily
// buckets, per-model rows, drains, OLAS burn branch) plus the legs Robinhood
// does not exercise (NVM credits, OLAS via a pool, Celo's USD-0 path, burn
// address skip, fee-out for an unseen mech).
import { BigDecimal } from "@subsquid/big-decimal";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCache, fixedPrice, type EventMeta } from "@olas/squid-shared";
import * as h from "../src/handlers";
import { makePricing, type OlasQuoteSource } from "../src/pricing";
import { CHAINS, type ChainConfig } from "../src/constants";
import { DailyTotals, DrainEvent, DrainTotals, Global, Mech, MechDaily, MechModel, MechTransaction } from "../src/model";

const MECH_1 = "0x00000000000000000000000000000000000000a1";
const MECH_2 = "0x00000000000000000000000000000000000000a2";
const TOKEN = "0x00000000000000000000000000000000000000ee";
const ONE = 10n ** 18n;
const TS = 1_788_900_000n; // day 1_788_825_600
const DAY = 1_788_825_600;

let n = 0;
const meta = (ts = TS): EventMeta => {
  n += 1;
  return {
    blockNumber: 1_000n + BigInt(n),
    blockTimestamp: ts,
    txHash: `0x${String(n).padStart(64, "0")}`,
    logIndex: 0,
    address: "0x00",
    txFrom: null,
    txTo: null,
  };
};

const TWO_K = fixedPrice(2_000_00000000n, 8); // $2,000, 8 decimals
const warnings: string[] = [];
const errors: string[] = [];
const log = { warn: (m: string) => warnings.push(m), error: (m: string) => errors.push(m) };

function ctxFor(chain: ChainConfig, olasQuote: OlasQuoteSource | null = null, native = chain.nativeUsdFeed == null ? null : TWO_K) {
  const cache = new InMemoryCache();
  return { ctx: { cache, chain, pricing: makePricing(chain, native, olasQuote, log), log }, cache };
}

const adjusted = (mech: string, rate: bigint) => ({ mech, deliveryRate: rate, balance: rate, rateDiff: 0n });

beforeEach(() => {
  n = 0;
  warnings.length = 0;
  errors.length = 0;
});

describe("native, Gnosis (xDAI = USD)", () => {
  const chain = CHAINS.gnosis;

  it("creates Mech, MechModel, MechTransaction, Global, DailyTotals and MechDaily on the first fee-in", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleMechBalanceAdjusted(ctx, meta(), "native", adjusted(MECH_1, ONE));
    const mech = (await cache.get(Mech, MECH_1))!;
    expect(mech.totalFeesInUSD.toString()).toBe("1");
    expect(mech.totalFeesInRaw.toString()).toBe(ONE.toString());
    expect(mech.totalFeesOutUSD.toString()).toBe("0");
    expect((await cache.get(Global, ""))!.totalFeesInUSD.toString()).toBe("1");
    const mm = (await cache.get(MechModel, `${MECH_1}-native`))!;
    expect(mm.model).toBe("native");
    expect(mm.totalFeesInRaw.toString()).toBe(ONE.toString());
    const d = (await cache.get(DailyTotals, String(DAY)))!;
    expect(d.date).toBe(DAY);
    expect(d.totalFeesInUSD.toString()).toBe("1");
    const md = (await cache.get(MechDaily, `${MECH_1}-${DAY}`))!;
    expect(md.feesInUSD.toString()).toBe("1");
    const txs = cache.all(MechTransaction);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("FEE_IN");
    expect(txs[0].deliveryRate).toBe(ONE);
    expect(txs[0].mech.id).toBe(MECH_1);
  });

  it("accumulates across events and keeps mechs independent", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleMechBalanceAdjusted(ctx, meta(), "native", adjusted(MECH_1, ONE));
    await h.handleMechBalanceAdjusted(ctx, meta(), "native", adjusted(MECH_1, 2n * ONE));
    await h.handleMechBalanceAdjusted(ctx, meta(), "native", adjusted(MECH_2, ONE / 2n));
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("3");
    expect((await cache.get(Mech, MECH_2))!.totalFeesInUSD.toString()).toBe("0.5");
    expect((await cache.get(Global, ""))!.totalFeesInUSD.toString()).toBe("3.5");
    expect(cache.all(MechTransaction)).toHaveLength(3);
  });

  it("fee out: FEE_OUT row and out-totals, also for a mech with no prior accrual", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleMechBalanceAdjusted(ctx, meta(), "native", adjusted(MECH_1, 2n * ONE));
    await h.handleWithdraw(ctx, meta(), "native", { account: MECH_1, amount: ONE });
    const mech = (await cache.get(Mech, MECH_1))!;
    expect(mech.totalFeesOutUSD.toString()).toBe("1");
    expect(mech.totalFeesOutRaw.toString()).toBe(ONE.toString());
    expect((await cache.get(Global, ""))!.totalFeesOutUSD.toString()).toBe("1");
    expect((await cache.get(DailyTotals, String(DAY)))!.totalFeesOutUSD.toString()).toBe("1");
    expect((await cache.get(MechModel, `${MECH_1}-native`))!.totalFeesOutUSD.toString()).toBe("1");
    expect(cache.all(MechTransaction).filter((t) => t.type === "FEE_OUT")).toHaveLength(1);

    // The subgraph creates the Mech in updateMechFeesOut before its
    // `Mech.load`, so the FEE_OUT row exists there too (partial-history case).
    await h.handleWithdraw(ctx, meta(), "native", { account: MECH_2, amount: ONE });
    expect((await cache.get(Mech, MECH_2))!.totalFeesOutUSD.toString()).toBe("1");
    expect(cache.all(MechTransaction).filter((t) => t.mech.id === MECH_2)).toHaveLength(1);
  });

  it("skips withdrawals to the burn address", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleWithdraw(ctx, meta(), "native", { account: chain.burnAddress!, amount: ONE });
    expect(cache.all(Global)).toHaveLength(0);
    expect(cache.all(Mech)).toHaveLength(0);
  });

  it("drains: DrainEvent, DrainTotals and Global.totalDrainedFeesUSD; sums across drains", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleDrained(ctx, meta(), "native", { token: TOKEN, collectedFees: ONE });
    await h.handleDrained(ctx, meta(), "native", { token: TOKEN, collectedFees: 3n * ONE });
    expect(cache.all(DrainEvent)).toHaveLength(2);
    const dt = (await cache.get(DrainTotals, "native"))!;
    expect(dt.totalDrainedRaw.toString()).toBe((4n * ONE).toString());
    expect(dt.totalDrainedUSD.toString()).toBe("4");
    const g = (await cache.get(Global, ""))!;
    expect(g.totalDrainedFeesUSD.toString()).toBe("4");
    expect(g.totalOlasBurnedUSD.toString()).toBe("0");
  });

  it("two days open two DailyTotals rows", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleMechBalanceAdjusted(ctx, meta(TS), "native", adjusted(MECH_1, ONE));
    await h.handleMechBalanceAdjusted(ctx, meta(TS + 86_400n), "native", adjusted(MECH_1, ONE));
    expect(cache.all(DailyTotals).map((d) => d.date).sort()).toEqual([DAY, DAY + 86_400]);
    expect(cache.all(MechDaily)).toHaveLength(2);
  });
});

describe("native via Chainlink (Robinhood, ETH at $2,000)", () => {
  const chain = CHAINS.robinhood;

  it("prices a fee-in at the feed answer and skips when the feed is unavailable", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleMechBalanceAdjusted(ctx, meta(), "native", adjusted(MECH_1, ONE / 100n)); // 0.01 ETH
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("20");

    const noFeed = ctxFor(chain, null, { usdAt: async () => null });
    await h.handleMechBalanceAdjusted(noFeed.ctx, meta(), "native", adjusted(MECH_1, ONE));
    expect(noFeed.cache.all(Mech)).toHaveLength(0);
    expect(errors.some((e) => /no native price/.test(e))).toBe(true);
  });

  it("drains still record with USD 0 when the feed is unavailable", async () => {
    const { ctx, cache } = ctxFor(chain, null, { usdAt: async () => null });
    await h.handleDrained(ctx, meta(), "native", { token: TOKEN, collectedFees: ONE });
    const dt = (await cache.get(DrainTotals, "native"))!;
    expect(dt.totalDrainedRaw.toString()).toBe(ONE.toString());
    expect(dt.totalDrainedUSD.toString()).toBe("0");
  });
});

describe("token-usdc (USDG on Robinhood, 6 decimals)", () => {
  const chain = CHAINS.robinhood;

  it("prices 1:1 and skips a zero amount", async () => {
    const { ctx, cache } = ctxFor(chain);
    await h.handleMechBalanceAdjusted(ctx, meta(), "token-usdc", adjusted(MECH_1, 1_500_000n));
    const mm = (await cache.get(MechModel, `${MECH_1}-token-usdc`))!;
    expect(mm.totalFeesInUSD.toString()).toBe("1.5");
    expect(mm.totalFeesInRaw.toString()).toBe("1500000");

    await h.handleMechBalanceAdjusted(ctx, meta(), "token-usdc", adjusted(MECH_1, 0n));
    expect(cache.all(MechTransaction)).toHaveLength(1);
    expect(warnings.some((w) => /USDC conversion returned 0/.test(w))).toBe(true);
  });

  it("no burn address: every withdrawal counts", async () => {
    const { ctx, cache } = ctxFor(chain);
    expect(chain.burnAddress).toBeNull();
    await h.handleWithdraw(ctx, meta(), "token-usdc", { account: MECH_1, amount: 2_000_000n });
    expect((await cache.get(Global, ""))!.totalFeesOutUSD.toString()).toBe("2");
  });
});

describe("nvm credits", () => {
  it("Base: usd = credits × 0.99e18 / 1e18 / 1e6; withdrawals in USDC convert back to credits", async () => {
    const chain = CHAINS.base;
    const { ctx, cache } = ctxFor(chain);
    // 1e6 credits at ratio 0.99e18 with 6-decimal USDC -> $0.99
    await h.handleMechBalanceAdjusted(ctx, meta(), "nvm", adjusted(MECH_1, 1_000_000n));
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("0.99");
    expect((await cache.get(MechModel, `${MECH_1}-nvm`))!.totalFeesInRaw.toString()).toBe("1000000");

    // withdraw 0.99 USDC -> $0.99 out. Raw credits follow the subgraph's
    // formula, amount × 1e18 × 10^tokenDecimals / ratio = 1e12 — NOT the 1e6
    // that went in. The in/out raw units differ by 10^tokenDecimals in the
    // subgraph too; parity is kept, use USD for cross-checks.
    await h.handleWithdraw(ctx, meta(), "nvm", { account: MECH_1, amount: 990_000n });
    const mech = (await cache.get(Mech, MECH_1))!;
    expect(mech.totalFeesOutUSD.toString()).toBe("0.99");
    expect(mech.totalFeesOutRaw.toString()).toBe("1000000000000");
  });

  it("Gnosis: xDAI-denominated ratio and withdrawals in xDAI", async () => {
    const chain = CHAINS.gnosis;
    const { ctx, cache } = ctxFor(chain);
    // 1e6 credits × 0.99e30 / 1e18 / 1e18 -> $0.99
    await h.handleMechBalanceAdjusted(ctx, meta(), "nvm", adjusted(MECH_1, 1_000_000n));
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("0.99");
    // withdraw 0.99 xDAI -> $0.99 (xDAI = USD); raw = 0.99e18 × 1e18 × 1e18 / 0.99e30 = 1e24
    await h.handleWithdraw(ctx, meta(), "nvm", { account: MECH_1, amount: (99n * ONE) / 100n });
    const mech = (await cache.get(Mech, MECH_1))!;
    expect(mech.totalFeesOutUSD.toString()).toBe("0.99");
    expect(mech.totalFeesOutRaw.eq(BigDecimal(10n ** 24n))).toBe(true);
  });

  it("a chain without an nvm config cannot have an nvm tracker", async () => {
    const { ctx } = ctxFor(CHAINS.robinhood);
    await expect(h.handleMechBalanceAdjusted(ctx, meta(), "nvm", adjusted(MECH_1, 1n))).rejects.toThrow(/no nvm config/);
  });
});

describe("token-olas", () => {
  const perOlas = (q: string): OlasQuoteSource => ({ olasInQuote: async () => BigDecimal(q) });

  it("Base: OLAS priced in USDC from the pool, no feed hop", async () => {
    const { ctx, cache } = ctxFor(CHAINS.base, perOlas("0.5"));
    await h.handleMechBalanceAdjusted(ctx, meta(), "token-olas", adjusted(MECH_1, 10n * ONE));
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("5");
    expect((await cache.get(MechModel, `${MECH_1}-token-olas`))!.totalFeesInRaw.toString()).toBe((10n * ONE).toString());
  });

  it("Optimism: OLAS in WETH from the pool, then WETH × ETH/USD", async () => {
    // 1 OLAS = 0.0001 WETH; ETH = $2,000 -> $0.2 per OLAS; 10 OLAS = $2
    const { ctx, cache } = ctxFor(CHAINS.optimism, perOlas("0.0001"));
    await h.handleMechBalanceAdjusted(ctx, meta(), "token-olas", adjusted(MECH_1, 10n * ONE));
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("2");
  });

  it("Ethereum: Uniswap V2 pair path is the same hop through ETH/USD", async () => {
    const { ctx, cache } = ctxFor(CHAINS.ethereum, perOlas("0.0001"));
    await h.handleMechBalanceAdjusted(ctx, meta(), "token-olas", adjusted(MECH_1, ONE));
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("0.2");
  });

  it("Celo: no pricing pool records raw OLAS with USD 0 instead of halting", async () => {
    const { ctx, cache } = ctxFor(CHAINS.celo);
    await h.handleMechBalanceAdjusted(ctx, meta(), "token-olas", adjusted(MECH_1, 5n * ONE));
    const mech = (await cache.get(Mech, MECH_1))!;
    expect(mech.totalFeesInUSD.toString()).toBe("0");
    expect(mech.totalFeesInRaw.toString()).toBe((5n * ONE).toString());
    // USD 0 -> no DailyTotals row, but MechDaily gets the raw amount
    expect(cache.all(DailyTotals)).toHaveLength(0);
    expect((await cache.get(MechDaily, `${MECH_1}-${DAY}`))!.feesInRaw.toString()).toBe((5n * ONE).toString());
  });

  it("a failed pool read records USD 0 with a warning, never skips", async () => {
    const { ctx, cache } = ctxFor(CHAINS.base, { olasInQuote: async () => null });
    await h.handleMechBalanceAdjusted(ctx, meta(), "token-olas", adjusted(MECH_1, ONE));
    expect((await cache.get(Mech, MECH_1))!.totalFeesInUSD.toString()).toBe("0");
    expect(warnings.some((w) => /OLAS quote unavailable/.test(w))).toBe(true);
  });

  it("OLAS drains are burns: bump totalOlasBurned*; other models do not", async () => {
    const { ctx, cache } = ctxFor(CHAINS.base, perOlas("0.5"));
    await h.handleDrained(ctx, meta(), "token-olas", { token: TOKEN, collectedFees: 4n * ONE });
    await h.handleDrained(ctx, meta(), "token-usdc", { token: TOKEN, collectedFees: 1_000_000n });
    const g = (await cache.get(Global, ""))!;
    expect(g.totalOlasBurnedRaw.toString()).toBe((4n * ONE).toString());
    expect(g.totalOlasBurnedUSD.toString()).toBe("2");
    expect(g.totalDrainedFeesUSD.toString()).toBe("3");
    expect((await cache.get(DrainTotals, "token-olas"))!.totalDrainedUSD.toString()).toBe("2");
    expect((await cache.get(DrainTotals, "token-usdc"))!.totalDrainedUSD.toString()).toBe("1");
  });
});
