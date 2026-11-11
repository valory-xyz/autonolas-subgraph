// LiFi swaps and their slippage, ported from studio babydegen-base
// src/lifiDiamond.ts, src/swapTracking.ts (createSwapTransaction and the
// 5-minute bucket buffer) and src/helpers.ts (associateSwapsWithPosition,
// parseTotalSlippageFromBucket). Bucket entries are
// "timestamp,swapIdHex,slippage,expiresAt,swapIdHex" joined by "|", with
// graph-node's BigDecimal text for the slippage.

import type { EventMeta } from "@olas/squid-shared";
import { WETH } from "./constants";
import { GD, gd } from "./decimal";
import { ETH_ADDRESS } from "./ids";
import { AgentSwapBuffer, Service, SwapTransaction } from "./model";
import { d, type PosCtx } from "./positions";
import { getTokenPriceUSD, type At } from "./pricing";
import { getTokenDecimals } from "./tokenUtils";
import { updateETHBalance, type Ctx } from "./handlers";

const ZERO = GD.ZERO;
const ASSOCIATION_WINDOW = 1200n;
const BUCKET_SECONDS = 300n;

const toHumanAmount = (amount: bigint, decimals: number): GD =>
  amount === 0n ? ZERO : GD.fromBigInt(amount).div(GD.fromBigInt(10n ** BigInt(decimals)));

const decimalsWithFallback = (ctx: PosCtx, token: string) => (token === ETH_ADDRESS ? 18 : getTokenDecimals(token, ctx.log));

/** ETH (the zero address) is priced as WETH. */
const priceToken = (token: string) => (token === ETH_ADDRESS ? WETH : token);

/** graph-node's `BigDecimal.toString()`: the normalized value in plain notation. */
const decimalText = (x: GD) => x.normalized().toString();

async function calculateExpectedOutput(ctx: PosCtx, fromAmount: bigint, fromToken: string, toToken: string, at: At): Promise<GD> {
  const fromPrice = await getTokenPriceUSD(ctx, priceToken(fromToken), at);
  const toPrice = await getTokenPriceUSD(ctx, priceToken(toToken), at);
  if (fromPrice.equals(ZERO) || toPrice.equals(ZERO)) return ZERO;
  return toHumanAmount(fromAmount, decimalsWithFallback(ctx, fromToken)).times(fromPrice);
}

/** `txHash.concat(Bytes.fromUTF8("-")).concat(Bytes.fromUTF8(logIndex.toString()))`. */
export const swapTransactionId = (txHash: string, logIndex: number) =>
  txHash + Buffer.from(`-${logIndex}`, "utf8").toString("hex");

export async function createSwapTransaction(
  ctx: PosCtx,
  meta: EventMeta,
  e: { agent: string; transactionId: string; fromAssetId: string; toAssetId: string; fromAmount: bigint; toAmount: bigint },
): Promise<void> {
  const id = swapTransactionId(meta.txHash, meta.logIndex);
  const fromHuman = toHumanAmount(e.fromAmount, decimalsWithFallback(ctx, e.fromAssetId));
  const toHuman = toHumanAmount(e.toAmount, decimalsWithFallback(ctx, e.toAssetId));
  const fromPrice = await getTokenPriceUSD(ctx, priceToken(e.fromAssetId), meta);
  const toPrice = await getTokenPriceUSD(ctx, priceToken(e.toAssetId), meta);
  const fromAmountUSD = fromPrice.times(fromHuman);
  const toAmountUSD = toPrice.times(toHuman);
  const expected = await calculateExpectedOutput(ctx, e.fromAmount, e.fromAssetId, e.toAssetId, meta);
  let slippageUSD = ZERO;
  let slippagePercentage = ZERO;
  if (expected.gt(ZERO)) {
    slippageUSD = expected.minus(toAmountUSD);
    slippagePercentage = slippageUSD.div(expected).times(gd("100"));
  }
  const expiresAt = meta.blockTimestamp + ASSOCIATION_WINDOW;
  ctx.cache.set(
    SwapTransaction,
    new SwapTransaction({
      id,
      agent: e.agent,
      transactionId: e.transactionId,
      txHash: meta.txHash,
      timestamp: meta.blockTimestamp,
      block: meta.blockNumber,
      fromAssetId: e.fromAssetId,
      toAssetId: e.toAssetId,
      fromAmount: e.fromAmount,
      toAmount: e.toAmount,
      fromAmountUSD: fromAmountUSD.toStore(),
      toAmountUSD: toAmountUSD.toStore(),
      expectedToAmountUSD: expected.toStore(),
      slippageUSD: slippageUSD.toStore(),
      slippagePercentage: slippagePercentage.toStore(),
      isAssociated: false,
      expiresAt,
    }),
  );
  await addSwapToBuffer(ctx, e.agent, meta.blockTimestamp, id, slippageUSD, expiresAt);
}

async function addSwapToBuffer(ctx: PosCtx, agent: string, timestamp: bigint, swapId: string, slippageUSD: GD, expiresAt: bigint): Promise<void> {
  const bucketIndex = timestamp / BUCKET_SECONDS;
  const buffer =
    (await ctx.cache.get(AgentSwapBuffer, agent)) ??
    new AgentSwapBuffer({
      id: agent,
      agent,
      bucket0Swaps: "",
      bucket1Swaps: "",
      bucket2Swaps: "",
      bucket3Swaps: "",
      totalSlippageUSD: ZERO.toStore(),
      lastUpdated: timestamp,
      currentBucketIndex: bucketIndex,
    });
  if (bucketIndex > buffer.currentBucketIndex) {
    buffer.bucket3Swaps = buffer.bucket2Swaps;
    buffer.bucket2Swaps = buffer.bucket1Swaps;
    buffer.bucket1Swaps = buffer.bucket0Swaps;
    buffer.bucket0Swaps = "";
    buffer.currentBucketIndex = bucketIndex;
  }
  const entry = `${timestamp},${swapId},${decimalText(slippageUSD)},${expiresAt},${swapId}`;
  buffer.bucket0Swaps = buffer.bucket0Swaps === "" ? entry : buffer.bucket0Swaps + "|" + entry;
  buffer.totalSlippageUSD = d(buffer.totalSlippageUSD).plus(slippageUSD).toStore();
  buffer.lastUpdated = timestamp;
  ctx.cache.set(AgentSwapBuffer, buffer);
}

export function parseTotalSlippageFromBucket(bucket: string): GD {
  if (bucket === "[]" || bucket === "") return ZERO;
  let total = ZERO;
  for (const entry of bucket.split("|")) {
    if (entry === "") continue;
    const parts = entry.split(",");
    if (parts.length >= 3) total = total.plus(gd(parts[2]));
  }
  return total;
}

/**
 * associateSwapsWithPosition: takes every buffered swap of the agent from
 * the last 20 minutes that has not expired, and returns their total
 * slippage (at least 0). The taken entries leave the buffer.
 */
export async function associateSwapsWithPosition(ctx: PosCtx, agent: string, at: At): Promise<GD> {
  const buffer = await ctx.cache.get(AgentSwapBuffer, agent);
  if (buffer == null) return ZERO;
  let total = ZERO;
  const now = at.blockTimestamp;
  const buckets = [buffer.bucket0Swaps, buffer.bucket1Swaps, buffer.bucket2Swaps, buffer.bucket3Swaps];
  const updated = ["", "", "", ""];
  for (let b = 0; b < buckets.length; b++) {
    if (buckets[b] === "") continue;
    const remaining: string[] = [];
    const associated: string[] = [];
    for (const entry of buckets[b].split("|")) {
      if (entry === "") continue;
      const parts = entry.split(",");
      if (parts.length < 4) continue;
      const swapTimestamp = BigInt(parts[0]);
      const expiresAt = BigInt(parts[3]);
      if (now - swapTimestamp <= ASSOCIATION_WINDOW && now <= expiresAt) associated.push(entry);
      else remaining.push(entry);
    }
    if (associated.length > 0) total = total.plus(parseTotalSlippageFromBucket(associated.join("|")));
    updated[b] = remaining.join("|");
  }
  [buffer.bucket0Swaps, buffer.bucket1Swaps, buffer.bucket2Swaps, buffer.bucket3Swaps] = updated;
  ctx.cache.set(AgentSwapBuffer, buffer);
  return total.lt(ZERO) ? ZERO : total;
}

/**
 * handleLiFiGenericSwapCompleted: "valory" swaps received by a service safe.
 * Records the swap for slippage, and moves the ETH balance when either leg
 * is native ETH (the zero address).
 */
export async function handleLiFiGenericSwapCompleted(
  ctx: Ctx,
  meta: EventMeta,
  e: {
    transactionId: string;
    integrator: string;
    receiver: string;
    fromAssetId: string;
    toAssetId: string;
    fromAmount: bigint;
    toAmount: bigint;
  },
): Promise<void> {
  if (e.integrator !== "valory") return;
  if ((await ctx.cache.get(Service, e.receiver)) == null) return;
  await createSwapTransaction(ctx, meta, { agent: e.receiver, ...e });
  if (e.fromAssetId === ETH_ADDRESS) await updateETHBalance(ctx, e.receiver, e.fromAmount, false, meta);
  if (e.toAssetId === ETH_ADDRESS) await updateETHBalance(ctx, e.receiver, e.toAmount, true, meta);
}
