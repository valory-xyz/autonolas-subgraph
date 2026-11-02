import { describe, expect, it } from "vitest";
import { AERO, AERO_USDC_POOL, BOLD, ETH_USD_FEED, USDC_NATIVE, USDC_USD_FEED, WETH } from "../src/constants";
import { gd } from "../src/decimal";
import { priceUpdateId } from "../src/ids";
import { PriceSource, PriceUpdate, Token } from "../src/model";
import { getEthUsd, getTokenPriceUSD, getVelodromeV2Price, isValidPriceResult } from "../src/pricing";
import { meta, setup } from "./helpers";

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

  it("rejects a Chainlink answer older than 24h; a critical stablecoin then falls back to $1", async () => {
    const { ctx, chain, cache } = setup();
    chain.feeds.set(USDC_USD_FEED, { answer: 99_000000n, updatedAt: 1000n });
    const price = await getTokenPriceUSD(ctx, USDC_NATIVE, at(1000n + 86_401n));
    expect(price.toFixed()).toBe("1");
    const token = cache.get(Token, USDC_NATIVE);
    expect((await token)!.priceConfidence.toFixed()).toBe("0.95");
    expect(cache.all(PriceUpdate)[0].source.id).toBe(USDC_USD_FEED);
  });

  it("USDC must sit strictly inside (0.95, 1.05); other symbols inside (0.0001, 100000)", () => {
    expect(isValidPriceResult(gd("0.95"), "USDC")).toBe(false);
    expect(isValidPriceResult(gd("0.9501"), "USDC")).toBe(true);
    expect(isValidPriceResult(gd("1.05"), "USDC")).toBe(false);
    expect(isValidPriceResult(gd("0.94"), "BOLD")).toBe(true);
    expect(isValidPriceResult(gd("100000"), "WETH")).toBe(false);
  });

  it("stablecoins referencing USDC/USD get 0.99 × 0.9 confidence and overwrite the shared PriceSource", async () => {
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

  it("AERO without a price stays 0 (not a critical stablecoin) and is retried next time", async () => {
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
