// Token → USD, ported from studio babydegen-base src/priceDiscovery.ts and
// src/priceAdapters.ts (only the source types its TOKENS table uses:
// chainlink, chainlink_reference, velodrome_v2) plus common.ts getEthUsd.
// Every call reads chain state at the handler's block, as graph-node does,
// and every BigDecimal step goes through GD (graph-node's arithmetic).

import type { IEntityCache } from "@olas/squid-shared";
import * as aggregator from "./abi/AggregatorV3Interface/functions";
import * as v2Pool from "./abi/VelodromeV2Pool/functions";
import { ETH_USD_FEED, CRITICAL_STABLECOINS, STABLECOINS, TOKENS, WETH, type PriceSourceConfig } from "./constants";
import { GD, gd } from "./decimal";
import { priceUpdateId } from "./ids";
import { PriceSource, PriceUpdate, Token } from "./model";
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
const STABLECOIN_FALLBACK_PRICE = gd("1.0");
const STABLECOIN_FALLBACK_CONFIDENCE = gd("0.95");
const STALE_PRICE_THRESHOLD = 86400n;
const ZERO = GD.ZERO;

interface PriceResult {
  price: GD;
  confidence: GD;
  source: string;
}

// --- adapters ---------------------------------------------------------------

/** priceAdapters.ts getChainlinkPrice: 0 on revert, stale (>24h) or non-positive. */
export async function getChainlinkPrice(ctx: PriceCtx, feed: string, at: At, staleRef: bigint): Promise<GD> {
  const round = await ctx.chain.call(feed, at.blockNumber, aggregator.latestRoundData, {});
  if (round == null) return ZERO;
  const price = GD.fromBigInt(round.answer).div(gd("1e8"));
  if (staleRef !== 0n && staleRef - round.updatedAt > STALE_PRICE_THRESHOLD) return ZERO;
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

async function getPairTokenPrice(ctx: PriceCtx, pairToken: string, at: At, staleRef: bigint): Promise<GD> {
  if (STABLECOINS.includes(pairToken)) return gd("1.0");
  if (pairToken === WETH) {
    const eth = await getChainlinkPrice(ctx, ETH_USD_FEED, at, staleRef);
    return eth.gt(ZERO) ? eth : gd("3000.0");
  }
  return gd("1.0");
}

/** `decimalAdjustment` built by repeated `times(10)`, as the subgraph does. */
function adjust(rawPrice: GD, decimalDiff: number): GD {
  let factor = gd("1");
  for (let i = 0; i < Math.abs(decimalDiff); i++) factor = factor.times(gd("10"));
  if (decimalDiff > 0) return rawPrice.div(factor);
  if (decimalDiff < 0) return rawPrice.times(factor);
  return rawPrice;
}

/** priceAdapters.ts getVelodromeV2Price (Aerodrome v2 reserves). */
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
  const reserves = await ctx.chain.call(pool, block, v2Pool.getReserves, {});
  if (reserves == null) return ZERO;
  const r0 = reserves._reserve0;
  const r1 = reserves._reserve1;
  // BigInt.fromI32(value2.toI32()): a uint32 timestamp, read as i32.
  const blockTimestampLast = BigInt(Number(BigInt.asIntN(32, reserves._blockTimestampLast)));
  let rawPrice: GD;
  let decimalDiff: number;
  if (token === t0.toLowerCase()) {
    if (r0 === 0n) return ZERO;
    rawPrice = GD.fromBigInt(r1).div(GD.fromBigInt(r0));
    decimalDiff = pair.decimals - target.decimals;
  } else if (token === t1.toLowerCase()) {
    if (r1 === 0n) return ZERO;
    rawPrice = GD.fromBigInt(r0).div(GD.fromBigInt(r1));
    decimalDiff = pair.decimals - target.decimals;
  } else {
    return ZERO;
  }
  rawPrice = adjust(rawPrice, decimalDiff);
  const pairPrice = await getPairTokenPrice(ctx, pairToken, at, blockTimestampLast);
  return rawPrice.times(pairPrice);
}

// --- discovery --------------------------------------------------------------

/** priceDiscovery.ts isValidPriceResult: bounds are exclusive. */
export function isValidPriceResult(price: GD, symbol: string): boolean {
  let min: GD;
  let max: GD;
  if (symbol === "USDC" || symbol === "USDT" || symbol === "DAI" || symbol === "USDC.e") {
    min = gd("0.95");
    max = gd("1.05");
  } else if (symbol === "LUSD" || symbol === "FRAX" || symbol === "DOLA") {
    min = gd("0.5");
    max = gd("1.5");
  } else {
    min = gd("0.0001");
    max = gd("100000");
  }
  return !(price.le(min) || price.ge(max));
}

const confidenceOf = (cfg: PriceSourceConfig) => gd(String(cfg.confidence)).div(gd("100"));

async function getPriceFromSource(ctx: PriceCtx, token: Token, cfg: PriceSourceConfig, at: At): Promise<PriceResult> {
  const base = confidenceOf(cfg);
  if (cfg.sourceType === "chainlink") {
    const price = await getChainlinkPrice(ctx, cfg.address, at, at.blockTimestamp);
    if (price.gt(ZERO) && isValidPriceResult(price, token.symbol)) return { price, confidence: base, source: "chainlink" };
  }
  if (cfg.sourceType === "chainlink_reference") {
    const price = await getChainlinkPrice(ctx, cfg.address, at, at.blockTimestamp);
    if (price.gt(ZERO) && isValidPriceResult(price, token.symbol)) {
      return { price, confidence: base.times(gd("0.9")), source: "chainlink_ref" };
    }
  }
  if (cfg.sourceType === "velodrome_v2") {
    const price = await getVelodromeV2Price(ctx, token.id, cfg.address, cfg.pairToken!, at);
    if (price.gt(ZERO) && isValidPriceResult(price, token.symbol)) return { price, confidence: base, source: "velodrome_v2" };
  }
  return { price: ZERO, confidence: ZERO, source: "unsupported" };
}

async function getPriceFromSources(ctx: PriceCtx, token: Token, at: At): Promise<PriceResult> {
  const config = TOKENS.get(token.id);
  if (config == null) return { price: ZERO, confidence: ZERO, source: "none" };
  const valid: PriceResult[] = [];
  for (const cfg of config.priceSources) {
    const r = await getPriceFromSource(ctx, token, cfg, at);
    if (r.price.gt(ZERO)) valid.push(r);
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
 * priceDiscovery.ts getTokenPriceUSD (forceRefresh = false): a 5-minute
 * cache on the Token row, then the configured sources, then $1 for the
 * critical stablecoins, else 0.
 */
export async function getTokenPriceUSD(ctx: PriceCtx, address: string, at: At): Promise<GD> {
  if (!TOKENS.has(address)) return ZERO;
  let token = (await ctx.cache.get(Token, address)) ?? (await initializeToken(ctx, address));
  if (token == null) return ZERO;
  const ts = at.blockTimestamp;
  if (ts - token.lastPriceUpdate < PRICE_CACHE_DURATION && GD.fromStore(token.priceConfidence).gt(MIN_CONFIDENCE_THRESHOLD)) {
    return GD.fromStore(token.derivedUSD);
  }
  const result = await getPriceFromSources(ctx, token, at);
  if (result.price.gt(ZERO) && result.confidence.gt(MIN_CONFIDENCE_THRESHOLD)) {
    token.derivedUSD = result.price.toStore();
    token.priceConfidence = result.confidence.toStore();
    token.lastPriceUpdate = ts;
    ctx.cache.set(Token, token);
    await createPriceUpdate(ctx, token, result, ts);
    return result.price;
  }
  if (CRITICAL_STABLECOINS.includes(token.id)) {
    token.derivedUSD = STABLECOIN_FALLBACK_PRICE.toStore();
    token.priceConfidence = STABLECOIN_FALLBACK_CONFIDENCE.toStore();
    token.lastPriceUpdate = ts;
    ctx.cache.set(Token, token);
    await createPriceUpdate(
      ctx,
      token,
      { price: STABLECOIN_FALLBACK_PRICE, confidence: STABLECOIN_FALLBACK_CONFIDENCE, source: "fallback" },
      ts,
    );
    return STABLECOIN_FALLBACK_PRICE;
  }
  return ZERO;
}
