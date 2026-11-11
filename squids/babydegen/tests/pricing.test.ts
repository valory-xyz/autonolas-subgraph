import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AERO,
  AERO_PROTOCOL_AERO,
  AERO_PROTOCOL_AERO_USDC_POOL,
  AERO_USDC_POOL,
  BOLD,
  DAI,
  ETH_USD_FEED,
  TOKENS,
  USDC_NATIVE,
  USDC_USD_FEED,
  USDT,
  USDT_USD_FEED,
  USDT_USDC_CL_POOL,
  WETH,
  type TokenConfig,
} from "../src/constants";
import { gd } from "../src/decimal";
import { priceUpdateId } from "../src/ids";
import { PriceSource, PriceUpdate, Token } from "../src/model";
import {
  getEthUsd,
  getTokenPriceUSD,
  getVelodromeCLPrice,
  getVelodromeV2Price,
  isValidPriceResult,
  type PriceCtx,
} from "../src/pricing";
import { addr, type FakeChain, meta, setup } from "./helpers";

const at = (ts = 1_781_000_000n, blockNumber = 47_200_000n) => ({ blockNumber, blockTimestamp: ts });

describe("getTokenPriceUSD", () => {
  it("prices WETH off Chainlink ETH/USD (answer / 1e8) and records Token + PriceUpdate", async () => {
    const { ctx, cache, chain } = setup();
    chain.feeds.set(ETH_USD_FEED, { answer: 312345678901n, updatedAt: 1_781_000_000n });
    const price = await getTokenPriceUSD(ctx, WETH, at());
    expect(price.toFixed()).toBe("3123.45678901");
    const token = cache.all(Token)[0];
    expect(token).toMatchObject({ id: WETH, symbol: "WETH", decimals: 18n, lastPriceUpdate: 1_781_000_000n, priceSources: [ETH_USD_FEED] });
    expect(token.priceConfidence.toFixed()).toBe("0.99");
    const update = cache.all(PriceUpdate)[0];
    expect(update.id).toBe(priceUpdateId(WETH, 1_781_000_000n));
    expect(update.id).toBe(WETH + Buffer.from("1781000000").toString("hex"));
    expect(update.source.id).toBe(ETH_USD_FEED);
    expect(update.block).toBe(0n);
  });

  it("reuses the Token price for 300 s, then reads the feed again", async () => {
    const { ctx, chain } = setup();
    await getTokenPriceUSD(ctx, WETH, at(1000n, 1n));
    chain.feeds.set(ETH_USD_FEED, { answer: 4000_00000000n, updatedAt: 10n ** 12n });
    expect((await getTokenPriceUSD(ctx, WETH, at(1299n, 2n))).toFixed()).toBe("3000");
    expect((await getTokenPriceUSD(ctx, WETH, at(1300n, 3n))).toFixed()).toBe("4000");
  });

  it("rejects a Chainlink answer older than 90000 s; a stablecoin never priced is 0, not $1", async () => {
    const { ctx, chain, cache } = setup();
    chain.feeds.set(USDC_USD_FEED, { answer: 99_000000n, updatedAt: 1000n });
    expect((await getTokenPriceUSD(ctx, USDC_NATIVE, at(1000n + 90_001n))).toFixed()).toBe("0");
    expect(cache.all(PriceUpdate)).toHaveLength(0);
  });

  it("still accepts a Chainlink answer exactly 90000 s old (24h heartbeat + 1h grace)", async () => {
    const { ctx, chain } = setup();
    chain.feeds.set(USDC_USD_FEED, { answer: 99_000000n, updatedAt: 1000n });
    expect((await getTokenPriceUSD(ctx, USDC_NATIVE, at(1000n + 90_000n))).toFixed()).toBe("0.99");
  });

  it("bands are exclusive: USDC (0, 1.05), other stablecoins (0, 1.5), anything else (0.0001, 100000)", () => {
    expect(isValidPriceResult(gd("0.5"), USDC_NATIVE)).toBe(true);
    expect(isValidPriceResult(gd("1.05"), USDC_NATIVE)).toBe(false);
    expect(isValidPriceResult(gd("0.1"), BOLD)).toBe(true);
    expect(isValidPriceResult(gd("1.5"), BOLD)).toBe(false);
    expect(isValidPriceResult(gd("0.0001"), WETH)).toBe(false);
    expect(isValidPriceResult(gd("100000"), WETH)).toBe(false);
  });

  it("stablecoins referencing USDC/USD get 0.9 × 0.9 = 0.81 confidence and overwrite the shared PriceSource", async () => {
    const { ctx, cache } = setup();
    await getTokenPriceUSD(ctx, USDC_NATIVE, at());
    expect((await cache.get(PriceSource, USDC_USD_FEED))!.sourceType).toBe("chainlink");
    await getTokenPriceUSD(ctx, BOLD, at());
    const source = (await cache.get(PriceSource, USDC_USD_FEED))!;
    expect(source.sourceType).toBe("chainlink_reference");
    expect(source.token.id).toBe(BOLD);
    expect((await cache.get(Token, BOLD))!.priceConfidence.toFixed()).toBe("0.81");
  });

  it("returns 0 for an untracked token without touching the store", async () => {
    const { ctx, cache } = setup();
    expect((await getTokenPriceUSD(ctx, "0x" + "ab".repeat(20), at())).toFixed()).toBe("0");
    expect(cache.all(Token)).toHaveLength(0);
  });
});

describe("Aerodrome v2 AERO/USDC", () => {
  it("token1 = AERO: reserve0/reserve1 × 10^12 × $1 (USDC pair)", async () => {
    const { ctx, chain } = setup();
    // 1,000,000 USDC / 1,500,000 AERO
    chain.pools.set(AERO_USDC_POOL, { token0: USDC_NATIVE, token1: AERO, r0: 1_000_000n * 10n ** 6n, r1: 1_500_000n * 10n ** 18n });
    const p = await getVelodromeV2Price(ctx, AERO, AERO_USDC_POOL, USDC_NATIVE, at());
    expect(p.toFixed()).toBe("0.6666666666666666666666666666666667");
    expect((await getTokenPriceUSD(ctx, AERO, at())).toFixed()).toBe("0.6666666666666666666666666666666667");
  });

  it("0 on an empty reserve, a reverted pool or a token not in the pool", async () => {
    const { ctx, chain } = setup();
    chain.pools.set(AERO_USDC_POOL, { token0: USDC_NATIVE, token1: AERO, r0: 1n, r1: 0n });
    expect((await getVelodromeV2Price(ctx, AERO, AERO_USDC_POOL, USDC_NATIVE, at())).toFixed()).toBe("0");
    chain.pools.set(AERO_USDC_POOL, null);
    expect((await getVelodromeV2Price(ctx, AERO, AERO_USDC_POOL, USDC_NATIVE, at())).toFixed()).toBe("0");
    chain.pools.set(AERO_USDC_POOL, { token0: USDC_NATIVE, token1: WETH, r0: 1n, r1: 1n });
    expect((await getVelodromeV2Price(ctx, AERO, AERO_USDC_POOL, USDC_NATIVE, at())).toFixed()).toBe("0");
  });

  it("AERO without a price stays 0 and is retried next time", async () => {
    const { ctx, chain, cache } = setup();
    chain.pools.set(AERO_USDC_POOL, null);
    expect((await getTokenPriceUSD(ctx, AERO, at())).toFixed()).toBe("0");
    expect(cache.all(PriceUpdate)).toHaveLength(0);
    expect((await cache.get(Token, AERO))!.lastPriceUpdate).toBe(0n);
  });
});

describe("getEthUsd", () => {
  it("is an unguarded latestRoundData: no staleness check, a revert throws", async () => {
    const { ctx, chain } = setup();
    chain.feeds.set(ETH_USD_FEED, { answer: 250000000000n, updatedAt: 0n });
    expect((await getEthUsd(ctx, meta())).toFixed()).toBe("2500");
    chain.feeds.set(ETH_USD_FEED, null);
    await expect(getEthUsd(ctx, meta())).rejects.toThrow(/reverted/);
  });
});

// --- studio tests/pricing.test.ts (#175) -----------------------------------

const TS = 1_700_000_000n;
const hex = (a: string) => a as `0x${string}`;
const now = () => at(TS);
const feed = (answer: bigint, updatedAt = TS) => ({ answer, updatedAt });
const STABLE_POOL = addr(0xc0);
const DAI_USDC_CL_POOL = addr(0xc2);

/** An imbalanced stable pool: reserves say $0.755, the pool's own quote for one token is `quote`. */
function imbalancedStablePool(chain: FakeChain, pool: string, token: string, pairToken: string, oneToken: bigint, quote: bigint) {
  chain.pools.set(pool, {
    token0: pairToken,
    token1: token,
    r0: 755_000_000n,
    r1: 1000n * 10n ** 18n,
    stable: true,
    quotes: new Map([[`${oneToken}:${token}`, quote]]),
  });
}

/** USDC token0 (6 dec), DAI token1 (18 dec): sqrtPrice 800,000 → 0.64 DAI per USDC → $1.5625. */
const daiUsdcClPool = (chain: FakeChain) =>
  chain.pools.set(DAI_USDC_CL_POOL, { token0: USDC_NATIVE, token1: DAI, sqrtPriceX96: 63382530011411470074835160268800000n });

/** AERO token0, USDC token1: 1,000,000 AERO vs 600,000 USDC → $0.60. */
const aeroUsdcPool = (chain: FakeChain) =>
  chain.pools.set(AERO_USDC_POOL, { token0: AERO, token1: USDC_NATIVE, r0: 10n ** 24n, r1: 600_000_000_000n, stable: false });

const price = async (ctx: PriceCtx, token: string, force = false) => (await getTokenPriceUSD(ctx, token, now(), force)).toFixed();

describe("stablecoin pricing", () => {
  it("a price below the old $0.95 floor is kept and marks the stablecoin depegged", async () => {
    const { ctx, chain, cache } = setup();
    chain.feeds.set(USDC_USD_FEED, feed(90_000_000n));
    expect(await price(ctx, USDC_NATIVE)).toBe("0.9");
    expect(await cache.get(Token, USDC_NATIVE)).toMatchObject({ depegged: true, priceStale: false });
  });

  it("USDC at $1.05 is rejected", async () => {
    const { ctx, chain } = setup();
    chain.feeds.set(USDC_USD_FEED, feed(105_000_000n));
    expect(await price(ctx, USDC_NATIVE)).toBe("0");
  });

  it("depegged starts just below $0.98; exactly $0.98 and $0.99 are not depegged", async () => {
    for (const [answer, depegged] of [[97_999_999n, true], [98_000_000n, false], [99_000_000n, false]] as const) {
      const { ctx, chain, cache } = setup();
      chain.feeds.set(USDC_USD_FEED, feed(answer));
      await price(ctx, USDC_NATIVE);
      expect((await cache.get(Token, USDC_NATIVE))!.depegged).toBe(depegged);
    }
  });

  it("the depeg flag clears when the price recovers", async () => {
    const { ctx, chain, cache } = setup();
    chain.feeds.set(USDC_USD_FEED, feed(90_000_000n));
    await price(ctx, USDC_NATIVE);
    chain.feeds.set(USDC_USD_FEED, feed(100_000_000n));
    await price(ctx, USDC_NATIVE, true);
    expect((await cache.get(Token, USDC_NATIVE))!.depegged).toBe(false);
  });

  it("with no valid price the last valid one is kept, marked stale; a fresh one replaces it", async () => {
    const { ctx, chain, cache } = setup();
    chain.feeds.set(USDC_USD_FEED, feed(97_000_000n));
    await price(ctx, USDC_NATIVE);
    chain.feeds.set(USDC_USD_FEED, null);
    expect(await price(ctx, USDC_NATIVE, true)).toBe("0.97");
    expect((await cache.get(Token, USDC_NATIVE))!.priceStale).toBe(true);
    chain.feeds.set(USDC_USD_FEED, feed(100_000_000n));
    expect(await price(ctx, USDC_NATIVE, true)).toBe("1");
    expect((await cache.get(Token, USDC_NATIVE))!.priceStale).toBe(false);
  });

  it("a stablecoin never priced is unpriced, not $1; BOLD gets no $1 when its reference feed fails", async () => {
    const { ctx, chain } = setup();
    chain.feeds.set(USDC_USD_FEED, null);
    expect(await price(ctx, USDC_NATIVE)).toBe("0");
    expect(await price(ctx, BOLD)).toBe("0");
  });

  it("a stable pool prices from its quote, not its reserve ratio", async () => {
    const { ctx, chain } = setup();
    imbalancedStablePool(chain, STABLE_POOL, BOLD, USDC_NATIVE, 10n ** 18n, 994053n);
    expect((await getVelodromeV2Price(ctx, BOLD, STABLE_POOL, USDC_NATIVE, now())).toFixed()).toBe("0.994053");
  });

  it("a pool that doesn't pair the token with its pair token is not used", async () => {
    const { ctx, chain } = setup();
    // A BOLD/DAI pool behind a USDC pair leg: its DAI quote must not be priced as USDC
    imbalancedStablePool(chain, STABLE_POOL, BOLD, DAI, 10n ** 18n, 994053000000000000n);
    expect((await getVelodromeV2Price(ctx, BOLD, STABLE_POOL, USDC_NATIVE, now())).toFixed()).toBe("0");
  });

  it("a pool's USDC leg is priced from the USDC feed, not $1", async () => {
    const { ctx, chain } = setup();
    imbalancedStablePool(chain, STABLE_POOL, BOLD, USDC_NATIVE, 10n ** 18n, 994053n);
    chain.feeds.set(USDC_USD_FEED, feed(90_000_000n));
    expect((await getVelodromeV2Price(ctx, BOLD, STABLE_POOL, USDC_NATIVE, now())).toFixed()).toBe("0.8946477");
  });

  it("a pair token with no feed gives no pool price", async () => {
    const { ctx, chain } = setup();
    imbalancedStablePool(chain, STABLE_POOL, AERO, BOLD, 10n ** 18n, 994053000000000000n);
    expect((await getVelodromeV2Price(ctx, AERO, STABLE_POOL, BOLD, now())).toFixed()).toBe("0");
  });

  it("a CL pool of 6- and 18-decimal tokens is priced with the decimals the right way round", async () => {
    const { ctx, chain } = setup();
    daiUsdcClPool(chain);
    expect((await getVelodromeCLPrice(ctx, DAI, DAI_USDC_CL_POOL, USDC_NATIVE, now())).toFixed()).toBe("1.5625");
  });

  it("a CL pool that doesn't pair the token with its pair token is not used", async () => {
    const { ctx, chain } = setup();
    daiUsdcClPool(chain);
    chain.feeds.set(USDT_USD_FEED, feed(100_000_000n));
    expect((await getVelodromeCLPrice(ctx, DAI, DAI_USDC_CL_POOL, USDT, now())).toFixed()).toBe("0");
  });

  it("a CL pool's pair-leg feed is judged stale against the block", async () => {
    const { ctx, chain } = setup();
    chain.feeds.set(USDC_USD_FEED, feed(100_000_000n, TS - 90_001n));
    daiUsdcClPool(chain);
    expect((await getVelodromeCLPrice(ctx, DAI, DAI_USDC_CL_POOL, USDC_NATIVE, now())).toFixed()).toBe("0");
  });

  it("a token that is not a stablecoin is never marked depegged", async () => {
    const { ctx, chain, cache } = setup();
    aeroUsdcPool(chain);
    expect(await price(ctx, AERO)).toBe("0.6");
    expect((await cache.get(Token, AERO))!.depegged).toBe(false);
  });

  it("USDT falls back to its priority-2 Aero USDC/USDT CL pool only when its feed fails", async () => {
    const { ctx, chain, cache } = setup();
    // token0 USDC, token1 USDT, both 6 decimals, sqrtPrice 1 → USDT $1.00
    chain.pools.set(USDT_USDC_CL_POOL, { token0: USDC_NATIVE, token1: USDT, sqrtPriceX96: 2n ** 96n });
    chain.feeds.set(USDT_USD_FEED, feed(99_900_000n));
    expect(await price(ctx, USDT)).toBe("0.999");
    expect(chain.calls.some((c) => c.includes(USDT_USDC_CL_POOL))).toBe(false);
    chain.feeds.set(USDT_USD_FEED, null);
    expect((await getTokenPriceUSD(ctx, USDT, at(TS + 300n))).toFixed()).toBe("1");
    expect((await cache.get(Token, USDT))!.priceConfidence.toFixed()).toBe("0.8");
    expect(cache.all(PriceUpdate).map((u) => u.source.id)).toEqual([USDT_USD_FEED, USDT_USDC_CL_POOL]);
  });
});

describe("pair-leg pricing", () => {
  it("a stable pool whose getAmountOut reverts gives no price", async () => {
    const { ctx, chain } = setup();
    imbalancedStablePool(chain, STABLE_POOL, BOLD, USDC_NATIVE, 10n ** 18n, 994053n);
    chain.pools.get(STABLE_POOL)!.quotes!.clear();
    expect((await getVelodromeV2Price(ctx, BOLD, STABLE_POOL, USDC_NATIVE, now())).toFixed()).toBe("0");
  });

  it("a pair-leg feed is judged stale against the block (the pool's last-trade time is no clock)", async () => {
    const { ctx, chain } = setup();
    aeroUsdcPool(chain);
    chain.feeds.set(USDC_USD_FEED, feed(100_000_000n, TS - 90_001n));
    expect(await price(ctx, AERO)).toBe("0");
  });

  it("a stablecoin above $1.50 is rejected, whatever its symbol", async () => {
    const { ctx, chain } = setup();
    chain.feeds.set(USDC_USD_FEED, feed(160_000_000n)); // BOLD is referenced to the USDC/USD feed
    expect(await price(ctx, BOLD)).toBe("0");
  });

  it("an Aero v2 pool with no stable() is priced from its reserves", async () => {
    const { ctx, chain } = setup();
    chain.pools.set(AERO_PROTOCOL_AERO_USDC_POOL, {
      token0: AERO_PROTOCOL_AERO,
      token1: USDC_NATIVE,
      r0: 10n ** 24n,
      r1: 600_000_000_000n,
    });
    expect(await price(ctx, AERO_PROTOCOL_AERO)).toBe("0.6");
  });
});


/** Extra TOKENS entries for one test: TOKENS stays read-only, its lookups are stubbed. */
function withTokens(...configs: TokenConfig[]) {
  const extra = new Map(configs.map((c) => [c.address as string, c]));
  const real = new Map(TOKENS);
  vi.spyOn(TOKENS, "get").mockImplementation((k) => extra.get(k) ?? real.get(k));
  vi.spyOn(TOKENS, "has").mockImplementation((k) => extra.has(k) || real.has(k));
}

describe("pair-leg hops", () => {
  const HOP_P = addr(0xa7);
  const HOP_Q = addr(0xa8);
  const HOP_T_P_POOL = addr(0xc7);
  const HOP_P_Q_POOL = addr(0xc8);
  const HOP_Q_USDC_POOL = addr(0xc9);
  const config = (address: string, symbol: string, pool: string, pairToken: string): TokenConfig => ({
    address: hex(address),
    symbol,
    decimals: 18,
    priceSources: [{ address: hex(pool), sourceType: "velodrome_v2", priority: 1, confidence: 80, pairToken: hex(pairToken) }],
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a pair leg with no feed is priced through its own pool to a feed-priced token", async () => {
    const { ctx, chain } = setup();
    withTokens(config(HOP_P, "P", HOP_P_Q_POOL, USDC_NATIVE));
    imbalancedStablePool(chain, HOP_P_Q_POOL, HOP_P, USDC_NATIVE, 10n ** 18n, 1_000_000n);
    imbalancedStablePool(chain, HOP_T_P_POOL, BOLD, HOP_P, 10n ** 18n, 10n ** 18n);
    expect((await getVelodromeV2Price(ctx, BOLD, HOP_T_P_POOL, HOP_P, now())).toFixed()).toBe("1");
  });

  it("a pair leg is priced through its own pool only when that pool's pair leg has a feed", async () => {
    const { ctx, chain } = setup();
    withTokens(config(HOP_P, "P", HOP_P_Q_POOL, HOP_Q), config(HOP_Q, "Q", HOP_Q_USDC_POOL, USDC_NATIVE));
    imbalancedStablePool(chain, HOP_Q_USDC_POOL, HOP_Q, USDC_NATIVE, 10n ** 18n, 1_000_000n);
    imbalancedStablePool(chain, HOP_P_Q_POOL, HOP_P, HOP_Q, 10n ** 18n, 10n ** 18n);
    imbalancedStablePool(chain, HOP_T_P_POOL, BOLD, HOP_P, 10n ** 18n, 10n ** 18n);
    expect((await getVelodromeV2Price(ctx, BOLD, HOP_T_P_POOL, HOP_P, now())).toFixed()).toBe("0");
  });
});

describe("source priority", () => {
  const PRIO_TOKEN = addr(0xa9);
  const FEED_A = addr(0xf7);
  const FEED_B = addr(0xf8);
  const prio = (sources: [string, number][]): TokenConfig => ({
    address: hex(PRIO_TOKEN),
    symbol: "PRIO",
    decimals: 18,
    priceSources: sources.map(([address, priority]) => ({ address: hex(address), sourceType: "chainlink" as const, priority, confidence: 95, pairToken: null })),
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a priority-1 source listed after a priority-2 one replaces its price", async () => {
    const { ctx, chain } = setup();
    withTokens(prio([[FEED_B, 2], [FEED_A, 1]]));
    chain.feeds.set(FEED_B, feed(200_000_000n));
    chain.feeds.set(FEED_A, feed(300_000_000n));
    expect(await price(ctx, PRIO_TOKEN)).toBe("3");
  });

  it("sources sharing the best priority are averaged", async () => {
    const { ctx, chain } = setup();
    withTokens(prio([[FEED_A, 1], [FEED_B, 1]]));
    chain.feeds.set(FEED_A, feed(200_000_000n));
    chain.feeds.set(FEED_B, feed(300_000_000n));
    expect(await price(ctx, PRIO_TOKEN)).toBe("2.5");
  });
});
