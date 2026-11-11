// Token → USD, ported from studio babydegen-base src/priceDiscovery.ts and
// src/priceAdapters.ts as of #175 (only the source types its TOKENS table
// uses: chainlink, chainlink_reference, velodrome_v2, velodrome_slipstream)
// plus common.ts getEthUsd. Every call reads chain state at the handler's
// block, as graph-node does, and every BigDecimal step goes through GD
// (graph-node's arithmetic).

import type { IEntityCache } from "@olas/squid-shared";
import * as aggregator from "./abi/AggregatorV3Interface/functions";
import * as v2Pool from "./abi/VelodromeV2Pool/functions";
import * as calls from "./calls";
import { ETH_USD_FEED, STABLECOINS, TOKENS, USDC_NATIVE, type PriceSourceConfig, type SourceType, type TokenConfig } from "./constants";
import { GD, gd, pow10 } from "./decimal";
import { priceUpdateId } from "./ids";
import { PriceSource, PriceUpdate, Token, V2PoolVenue } from "./model";
import type { ChainReader } from "./rpc";

export interface PriceCtx {
  cache: IEntityCache;
  chain: ChainReader;
}

/** Where a price is read: the event's block, and its timestamp (seconds). */
export interface At {
  blockNumber: bigint;
  blockTimestamp: bigint;
}

const PRICE_CACHE_DURATION = 300n;
const MIN_CONFIDENCE_THRESHOLD = gd("0.5");
const DEPEG_THRESHOLD = gd("0.98");
/** 24h heartbeat + ~1h grace. */
const STALE_PRICE_THRESHOLD = 90000n;
const Q96 = 2n ** 96n;
const ZERO = GD.ZERO;

interface PriceResult {
  price: GD;
  confidence: GD;
  source: string;
}

const isStablecoin = (token: string) => STABLECOINS.includes(token);

// --- adapters ---------------------------------------------------------------

/**
 * priceAdapters.ts getChainlinkPrice: 0 on revert, on an answer older than
 * 90000 s at `blockTimestamp` (not checked when it is 0) or a non-positive one.
 */
export async function getChainlinkPrice(ctx: PriceCtx, feed: string, at: At, blockTimestamp: bigint): Promise<GD> {
  const round = await ctx.chain.call(feed, at.blockNumber, aggregator.latestRoundData, {});
  if (round == null) return ZERO;
  const price = GD.fromBigInt(round.answer).div(gd("1e8"));
  if (blockTimestamp !== 0n && blockTimestamp - round.updatedAt > STALE_PRICE_THRESHOLD) return ZERO;
  if (price.le(ZERO)) return ZERO;
  return price;
}

/**
 * common.ts getEthUsd: an unguarded `latestRoundData()` (a revert aborts the
 * subgraph, so it throws here too), divided by 1e8, no staleness check.
 */
export async function getEthUsd(ctx: PriceCtx, at: At): Promise<GD> {
  const round = await ctx.chain.call(ETH_USD_FEED, at.blockNumber, aggregator.latestRoundData, {});
  if (round == null) {
    throw new Error(`ETH/USD latestRoundData() reverted at block ${at.blockNumber}; the subgraph would abort here`);
  }
  return GD.fromBigInt(round.answer).div(gd("1e8"));
}

const sourceOfType = (config: TokenConfig, type: SourceType) =>
  config.priceSources.find((s) => s.sourceType === type) ?? null;

/**
 * getPairTokenPrice: a pool's pair leg, from its own token config and never
 * $1. Its Chainlink feed, else its velodrome_v2 pool when that pool's pair
 * leg has a Chainlink source (one hop). Staleness is judged against the
 * event's block.
 */
async function getPairTokenPrice(ctx: PriceCtx, pairToken: string, at: At): Promise<GD> {
  const config = TOKENS.get(pairToken);
  if (config != null) {
    const feed = sourceOfType(config, "chainlink");
    if (feed != null) {
      const price = await getChainlinkPrice(ctx, feed.address, at, at.blockTimestamp);
      if (price.gt(ZERO)) return price;
    }
    const pool = sourceOfType(config, "velodrome_v2");
    if (pool != null && pool.pairToken != null) {
      const poolPair = TOKENS.get(pool.pairToken);
      if (poolPair != null && sourceOfType(poolPair, "chainlink") != null) {
        return getVelodromeV2Price(ctx, pairToken, pool.address, pool.pairToken, at);
      }
    }
  }
  return ZERO;
}

/** poolPairs: the pool holds exactly `token` and `pairToken`. */
const poolPairs = (token0: string, token1: string, token: string, pairToken: string) =>
  (token === token0 && pairToken === token1) || (token === token1 && pairToken === token0);

/** A power of ten built by repeated `times(10)`, as the subgraph does. */
function tens(n: number): GD {
  let factor = gd("1");
  for (let i = 0; i < n; i++) factor = factor.times(gd("10"));
  return factor;
}

export type V2PoolKind = "volatile" | "stable" | "unknown";

/**
 * priceAdapters.ts v2PoolKind: the V2PoolVenue row the pool's Aero factory
 * wrote (Aero v2 pools have no stable()), else the pool's `stable()`,
 * unknown on a revert.
 */
export async function v2PoolKind(ctx: PriceCtx, pool: string, at: At): Promise<V2PoolKind> {
  const venue = await ctx.cache.get(V2PoolVenue, pool);
  if (venue != null) return venue.stable ? "stable" : "volatile";
  const stable = await ctx.chain.call(pool, at.blockNumber, v2Pool.stable, {});
  if (stable == null) return "unknown";
  return stable ? "stable" : "volatile";
}

/**
 * priceAdapters.ts getVelodromeV2Price (Aerodrome / Aero v2): the reserve
 * ratio, or a stable pool's `getAmountOut` quote for one token, times the
 * pair leg's price.
 */
export async function getVelodromeV2Price(ctx: PriceCtx, token: string, pool: string, pairToken: string, at: At): Promise<GD> {
  const block = at.blockNumber;
  const [t0, t1] = await Promise.all([
    ctx.chain.call(pool, block, v2Pool.token0, {}),
    ctx.chain.call(pool, block, v2Pool.token1, {}),
  ]);
  if (t0 == null || t1 == null) return ZERO;
  const target = TOKENS.get(token);
  const pair = TOKENS.get(pairToken);
  if (target == null || pair == null) return ZERO;
  const token0 = t0.toLowerCase();
  const token1 = t1.toLowerCase();
  if (!poolPairs(token0, token1, token, pairToken)) return ZERO;
  const reserves = await ctx.chain.call(pool, block, v2Pool.getReserves, {});
  if (reserves == null) return ZERO;

  if ((await v2PoolKind(ctx, pool, at)) === "stable") {
    // On a curve pool the reserve ratio is not the price: quote one token.
    const oneToken = 10n ** BigInt(target.decimals);
    const quote = await ctx.chain.call(pool, block, calls.getAmountOut, { amountIn: oneToken, tokenIn: token });
    if (quote == null) return ZERO;
    const amount = GD.fromBigInt(quote).div(pow10(pair.decimals));
    return amount.times(await getPairTokenPrice(ctx, pairToken, at));
  }

  const r0 = reserves._reserve0;
  const r1 = reserves._reserve1;
  let rawPrice: GD;
  if (token === token0) {
    if (r0 === 0n) return ZERO;
    rawPrice = GD.fromBigInt(r1).div(GD.fromBigInt(r0));
  } else {
    if (r1 === 0n) return ZERO;
    rawPrice = GD.fromBigInt(r0).div(GD.fromBigInt(r1));
  }
  const decimalDiff = pair.decimals - target.decimals;
  if (decimalDiff > 0) rawPrice = rawPrice.div(tens(decimalDiff));
  else if (decimalDiff < 0) rawPrice = rawPrice.times(tens(-decimalDiff));
  return rawPrice.times(await getPairTokenPrice(ctx, pairToken, at));
}

/** sqrtPriceToToken0Price: sqrtPrice² is raw token1 per raw token0; scale by 10^(dec0 - dec1). */
function sqrtPriceToToken0Price(sqrtPriceX96: bigint, dec0: number, dec1: number): GD {
  if (sqrtPriceX96 === 0n) return ZERO;
  if (dec0 < 0 || dec0 > 18 || dec1 < 0 || dec1 > 18) return ZERO;
  const million = gd("1000000");
  const sqrtPrice = GD.fromBigInt(sqrtPriceX96).div(GD.fromBigInt(Q96));
  if (sqrtPrice.le(ZERO) || sqrtPrice.gt(million)) return ZERO;
  let price = sqrtPrice.times(sqrtPrice);
  const diff = dec0 - dec1;
  if (diff > 0) price = price.times(tens(diff));
  else if (diff < 0) price = price.div(tens(-diff));
  if (price.le(ZERO) || price.gt(million)) return ZERO;
  return price;
}

/**
 * priceAdapters.ts getUniswapV3Price, behind "velodrome_slipstream" (CL)
 * sources: slot0's sqrtPriceX96 with each side's own decimals (#175's fix),
 * times the pair leg's price.
 */
export async function getVelodromeCLPrice(ctx: PriceCtx, token: string, pool: string, pairToken: string, at: At): Promise<GD> {
  const block = at.blockNumber;
  const slot = await ctx.chain.call(pool, block, calls.slot0, {});
  if (slot == null) return ZERO;
  const [t0, t1] = await Promise.all([
    ctx.chain.call(pool, block, v2Pool.token0, {}),
    ctx.chain.call(pool, block, v2Pool.token1, {}),
  ]);
  if (t0 == null || t1 == null) return ZERO;
  const token0 = t0.toLowerCase();
  const token1 = t1.toLowerCase();
  if (!poolPairs(token0, token1, token, pairToken)) return ZERO;
  const target = TOKENS.get(token);
  const pair = TOKENS.get(pairToken);
  if (target == null || pair == null) return ZERO;
  let price: GD;
  if (token === token0) {
    price = sqrtPriceToToken0Price(slot.sqrtPriceX96, target.decimals, pair.decimals);
  } else {
    const token0Price = sqrtPriceToToken0Price(slot.sqrtPriceX96, pair.decimals, target.decimals);
    price = token0Price.equals(ZERO) ? ZERO : gd("1").div(token0Price);
  }
  return price.times(await getPairTokenPrice(ctx, pairToken, at));
}

// --- discovery --------------------------------------------------------------

/**
 * priceDiscovery.ts isValidPriceResult, bounds exclusive: USDC (0, 1.05),
 * other STABLECOINS (0, 1.5) so a depeg is recorded, anything else
 * (0.0001, 100000).
 */
export function isValidPriceResult(price: GD, token: string): boolean {
  let min: GD;
  let max: GD;
  if (token === USDC_NATIVE) {
    min = ZERO;
    max = gd("1.05");
  } else if (isStablecoin(token)) {
    min = ZERO;
    max = gd("1.5");
  } else {
    min = gd("0.0001");
    max = gd("100000");
  }
  return price.gt(min) && price.lt(max);
}

const confidenceOf = (cfg: PriceSourceConfig) => gd(String(cfg.confidence)).div(gd("100"));

async function getPriceFromSource(ctx: PriceCtx, token: Token, cfg: PriceSourceConfig, at: At): Promise<PriceResult> {
  const base = confidenceOf(cfg);
  const valid = (price: GD) => price.gt(ZERO) && isValidPriceResult(price, token.id);
  if (cfg.sourceType === "chainlink") {
    const price = await getChainlinkPrice(ctx, cfg.address, at, at.blockTimestamp);
    if (valid(price)) return { price, confidence: base, source: "chainlink" };
  }
  if (cfg.sourceType === "chainlink_reference") {
    const price = await getChainlinkPrice(ctx, cfg.address, at, at.blockTimestamp);
    if (valid(price)) return { price, confidence: base.times(gd("0.9")), source: "chainlink_ref" };
  }
  if (cfg.sourceType === "velodrome_slipstream") {
    const price = await getVelodromeCLPrice(ctx, token.id, cfg.address, cfg.pairToken!, at);
    if (valid(price)) return { price, confidence: base, source: "velodrome_slipstream" };
  }
  if (cfg.sourceType === "velodrome_v2") {
    const price = await getVelodromeV2Price(ctx, token.id, cfg.address, cfg.pairToken!, at);
    if (valid(price)) return { price, confidence: base, source: "velodrome_v2" };
  }
  return { price: ZERO, confidence: ZERO, source: "unsupported" };
}

/**
 * getPriceFromSources: valid prices from the best priority that has any (a
 * higher-numbered source is only read while no better one has priced),
 * averaged by confidence when several share it.
 */
async function getPriceFromSources(ctx: PriceCtx, token: Token, at: At): Promise<PriceResult> {
  const config = TOKENS.get(token.id);
  if (config == null) return { price: ZERO, confidence: ZERO, source: "none" };
  let valid: PriceResult[] = [];
  let bestPriority = Number.MAX_SAFE_INTEGER;
  for (const cfg of config.priceSources) {
    if (cfg.priority > bestPriority) continue;
    const r = await getPriceFromSource(ctx, token, cfg, at);
    if (r.price.gt(ZERO)) {
      if (cfg.priority < bestPriority) {
        bestPriority = cfg.priority;
        valid = [];
      }
      valid.push(r);
    }
  }
  if (valid.length === 0) return { price: ZERO, confidence: ZERO, source: "failed" };
  if (valid.length === 1) return valid[0];
  let weightedSum = ZERO;
  let totalConfidence = ZERO;
  for (const r of valid) {
    weightedSum = weightedSum.plus(r.price.times(r.confidence));
    totalConfidence = totalConfidence.plus(r.confidence);
  }
  const n = gd(String(valid.length));
  if (totalConfidence.equals(ZERO)) {
    let sum = ZERO;
    for (const r of valid) sum = sum.plus(r.price);
    return { price: sum.div(n), confidence: gd("0.5"), source: "average_unweighted" };
  }
  return { price: weightedSum.div(totalConfidence), confidence: totalConfidence.div(n), source: "average_weighted" };
}

async function initializeToken(ctx: PriceCtx, address: string): Promise<Token | null> {
  const config = TOKENS.get(address);
  if (config == null) return null;
  const token = new Token({
    id: address,
    symbol: config.symbol,
    name: config.symbol,
    decimals: BigInt(config.decimals),
    derivedUSD: gd("0").toStore(),
    priceConfidence: gd("0").toStore(),
    priceStale: false,
    depegged: false,
    priceSources: [],
    lastPriceUpdate: 0n,
  });
  for (const cfg of config.priceSources) {
    // A feed shared by several tokens (USDC/USD) is overwritten by the
    // token initialized last, exactly as `new PriceSource(id).save()` does.
    ctx.cache.set(
      PriceSource,
      new PriceSource({
        id: cfg.address,
        token,
        sourceType: cfg.sourceType,
        priority: cfg.priority,
        isActive: true,
        lastUpdate: 0n,
        lastPrice: gd("0").toStore(),
        confidence: confidenceOf(cfg).toStore(),
      }),
    );
    token.priceSources = [...token.priceSources, cfg.address];
  }
  ctx.cache.set(Token, token);
  return token;
}

async function createPriceUpdate(ctx: PriceCtx, token: Token, result: PriceResult, timestamp: bigint): Promise<void> {
  let sourceIndex = 0;
  if (result.source !== "average_weighted" && result.source !== "average_unweighted") {
    for (let i = 0; i < token.priceSources.length; i++) {
      const source = await ctx.cache.get(PriceSource, token.priceSources[i]);
      if (source != null && source.sourceType === result.source) {
        sourceIndex = i;
        break;
      }
    }
  }
  ctx.cache.set(
    PriceUpdate,
    new PriceUpdate({
      id: priceUpdateId(token.id, timestamp),
      token,
      priceUSD: result.price.toStore(),
      confidence: result.confidence.toStore(),
      source: new PriceSource({ id: token.priceSources[sourceIndex] }),
      timestamp,
      block: 0n,
    }),
  );
}

/**
 * priceDiscovery.ts getTokenPriceUSD: a 5-minute cache on the Token row,
 * then the configured sources. With no valid price the last valid one is
 * kept and marked `priceStale`; a token never priced is 0 (no $1 fallback).
 */
export async function getTokenPriceUSD(ctx: PriceCtx, address: string, at: At, forceRefresh = false): Promise<GD> {
  if (!TOKENS.has(address)) return ZERO;
  const token = (await ctx.cache.get(Token, address)) ?? (await initializeToken(ctx, address));
  if (token == null) return ZERO;
  const ts = at.blockTimestamp;
  if (
    !forceRefresh &&
    ts - token.lastPriceUpdate < PRICE_CACHE_DURATION &&
    GD.fromStore(token.priceConfidence).gt(MIN_CONFIDENCE_THRESHOLD)
  ) {
    return GD.fromStore(token.derivedUSD);
  }
  const result = await getPriceFromSources(ctx, token, at);
  if (result.price.gt(ZERO) && result.confidence.gt(MIN_CONFIDENCE_THRESHOLD)) {
    token.derivedUSD = result.price.toStore();
    token.priceConfidence = result.confidence.toStore();
    token.lastPriceUpdate = ts;
    token.priceStale = false;
    token.depegged = isStablecoin(address) && result.price.lt(DEPEG_THRESHOLD);
    ctx.cache.set(Token, token);
    await createPriceUpdate(ctx, token, result, ts);
    return result.price;
  }
  const last = GD.fromStore(token.derivedUSD);
  if (last.gt(ZERO)) {
    if (!token.priceStale) {
      token.priceStale = true;
      ctx.cache.set(Token, token);
    }
    return last;
  }
  return ZERO;
}
