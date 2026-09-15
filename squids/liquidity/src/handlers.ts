// Event handlers, ported branch-for-branch from subgraphs/liquidity-l2/src/mapping.ts.
// Each takes the cache interface, plain EventMeta and decoded params, so
// tests/handlers.test.ts runs them against InMemoryCache with stubbed readers.
import type { EventMeta, IEntityCache, UsdPriceSource } from "@olas/squid-shared";
import { dayTimestamp, logId } from "@olas/squid-shared";
import { BPTTransfer, DailyFees, PoolMetrics, PriceData } from "./model";
import {
  BalancerReader,
  PairReader,
  balancerFee,
  dailyFeesId,
  poolAddressFromPoolId,
  subtractClamped,
  uniswapV2Fee,
} from "./logic";
import { PRICE_DATA_ID, PRICE_STALENESS_SECONDS, ZERO_ADDRESS, type PoolConfig } from "./constants";

export interface Ctx {
  cache: IEntityCache;
  /** Tracked pools by lowercase address. */
  pools: Map<string, PoolConfig>;
  balancer(pool: string): BalancerReader;
  pair(pool: string): PairReader;
  /** null when the chain has no native/USD feed. */
  price: UsdPriceSource | null;
  /** For error messages only. */
  chainName: string;
}

async function getOrCreateMetrics(ctx: Ctx, pool: string): Promise<PoolMetrics> {
  let m = await ctx.cache.get(PoolMetrics, pool);
  if (m == null) {
    const cfg = ctx.pools.get(pool);
    // main.ts only dispatches configured pools; a miss here is a config bug.
    if (cfg == null) throw new Error(`[liquidity] pool ${pool} is not in CHAINS.${ctx.chainName}.pools`);
    m = new PoolMetrics({
      id: pool,
      dex: cfg.dex,
      poolId: null,
      token0: null,
      token1: null,
      reserve0: 0n,
      reserve1: 0n,
      totalSupply: 0n,
      reservesRefreshedAtBlock: 0n,
      totalMinted: 0n,
      totalBurned: 0n,
      cumulativeFeesToken0: 0n,
      cumulativeFeesToken1: 0n,
      swapFeePercentage: 0n,
      nativeUsdPrice: 0n,
      lastUpdatedBlock: 0n,
      lastUpdatedTimestamp: 0n,
      lastUpdatedTransaction: "",
    });
    ctx.cache.set(PoolMetrics, m);
  }
  return m;
}

async function getOrCreateDailyFees(ctx: Ctx, metrics: PoolMetrics, ts: bigint): Promise<DailyFees> {
  const day = dayTimestamp(ts);
  const id = dailyFeesId(metrics.id, day);
  let d = await ctx.cache.get(DailyFees, id);
  if (d == null) {
    d = new DailyFees({
      id,
      pool: metrics,
      dayTimestamp: day,
      totalFeesToken0: 0n,
      totalFeesToken1: 0n,
      swapCount: 0,
    });
  }
  return d;
}

function touch(m: PoolMetrics, meta: EventMeta): void {
  m.lastUpdatedBlock = meta.blockNumber;
  m.lastUpdatedTimestamp = meta.blockTimestamp;
  m.lastUpdatedTransaction = meta.txHash;
}

/**
 * Chainlink native/USD, re-read at most once per PRICE_STALENESS_SECONDS
 * (the subgraph's Celo path, generalised to any chain with a feed).
 */
async function refreshNativePrice(ctx: Ctx, meta: EventMeta, m: PoolMetrics): Promise<void> {
  if (ctx.price == null) return;
  let pd = await ctx.cache.get(PriceData, PRICE_DATA_ID);
  const stale = pd == null || meta.blockTimestamp - pd.lastUpdatedTimestamp >= PRICE_STALENESS_SECONDS;
  if (stale) {
    const p = await ctx.price.usdAt(meta.blockNumber);
    if (p != null && p.answer > 0n) {
      pd = new PriceData({
        id: PRICE_DATA_ID,
        price: p.answer,
        decimals: p.decimals,
        lastUpdatedBlock: meta.blockNumber,
        lastUpdatedTimestamp: meta.blockTimestamp,
      });
      ctx.cache.set(PriceData, pd);
    }
  }
  if (pd != null && pd.price > 0n) m.nativeUsdPrice = pd.price;
}

// --- LP token Transfer (both DEX kinds) ---------------------------------

export async function handleLpTransfer(
  ctx: Ctx,
  meta: EventMeta,
  p: { from: string; to: string; value: bigint },
): Promise<void> {
  const pool = meta.address;
  const m = await getOrCreateMetrics(ctx, pool);

  ctx.cache.set(
    BPTTransfer,
    new BPTTransfer({
      id: logId(meta),
      pool: m,
      from: p.from,
      to: p.to,
      value: p.value,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    }),
  );

  const isMint = p.from === ZERO_ADDRESS;
  const isBurn = p.to === ZERO_ADDRESS;
  if (isMint) {
    m.totalSupply += p.value;
    m.totalMinted += p.value;
  } else if (isBurn) {
    // Clamp at zero against partial-history indexing, as the subgraph does.
    m.totalSupply = p.value > m.totalSupply ? 0n : m.totalSupply - p.value;
    m.totalBurned += p.value;
  }

  // Balancer: absolute reserve refetch on join/exit. eth_call state is
  // end-of-block, so this already includes every swap in the block —
  // handleVaultSwap skips deltas for it. Uniswap V2 reserves come from Sync.
  if ((isMint || isBurn) && m.dex === "balancer-v2") {
    const reader = ctx.balancer(pool);
    const poolId = await reader.getPoolId();
    if (poolId != null) {
      m.poolId = poolId.toLowerCase();
      const res = await reader.reservesAt(meta.blockNumber);
      if (res != null && res.tokens.length >= 2 && res.balances.length >= 2) {
        m.token0 = res.tokens[0];
        m.token1 = res.tokens[1];
        m.reserve0 = res.balances[0];
        m.reserve1 = res.balances[1];
        m.reservesRefreshedAtBlock = meta.blockNumber;
      }
    }
  }

  touch(m, meta);
  ctx.cache.set(PoolMetrics, m);
}

// --- Uniswap V2 -----------------------------------------------------------

export async function handleUniswapSync(
  ctx: Ctx,
  meta: EventMeta,
  p: { reserve0: bigint; reserve1: bigint },
): Promise<void> {
  const m = await getOrCreateMetrics(ctx, meta.address);
  m.reserve0 = p.reserve0;
  m.reserve1 = p.reserve1;
  if (m.token0 == null || m.token1 == null) {
    const tokens = await ctx.pair(meta.address).getTokens();
    if (tokens != null) {
      m.token0 = tokens[0];
      m.token1 = tokens[1];
    }
  }
  await refreshNativePrice(ctx, meta, m);
  touch(m, meta);
  ctx.cache.set(PoolMetrics, m);
}

export async function handleUniswapSwap(
  ctx: Ctx,
  meta: EventMeta,
  p: { amount0In: bigint; amount1In: bigint },
): Promise<void> {
  const m = await getOrCreateMetrics(ctx, meta.address);
  const fee0 = uniswapV2Fee(p.amount0In);
  const fee1 = uniswapV2Fee(p.amount1In);
  await addFees(ctx, meta, m, fee0, fee1);
}

// --- Balancer V2 Vault Swap -------------------------------------------------

export async function handleVaultSwap(
  ctx: Ctx,
  meta: EventMeta,
  p: { poolId: string; tokenIn: string; tokenOut: string; amountIn: bigint; amountOut: bigint },
): Promise<void> {
  const pool = poolAddressFromPoolId(p.poolId);
  // Only pools initialised by a prior mint/burn; every other Vault swap on
  // the chain arrives here too and is dropped.
  if (!ctx.pools.has(pool)) return;
  const m = await ctx.cache.get(PoolMetrics, pool);
  if (m == null) return;
  const poolId = p.poolId.toLowerCase();
  if (m.poolId == null) m.poolId = poolId;
  if (m.poolId !== poolId) return;

  if (m.token0 == null || m.token1 == null) {
    ctx.cache.log.warn(`[liquidity] pool ${pool} swap skipped: token addresses unset`);
    return;
  }

  if (m.swapFeePercentage === 0n) {
    // Read at the block of the first observed swap, as the subgraph did.
    const fee = await ctx.balancer(pool).getSwapFeePercentage(meta.blockNumber);
    if (fee != null) m.swapFeePercentage = fee;
  }

  const fee = balancerFee(p.amountIn, m.swapFeePercentage);
  const tokenIn = p.tokenIn.toLowerCase();
  const tokenOut = p.tokenOut.toLowerCase();
  const fee0 = tokenIn === m.token0 ? fee : 0n;
  const fee1 = tokenIn === m.token0 ? 0n : fee;

  // Swap deltas keep reserves live between joins/exits. Skip swaps in the
  // block of the last absolute refetch, which already included them.
  if (meta.blockNumber > m.reservesRefreshedAtBlock) {
    if (tokenIn === m.token0) m.reserve0 += p.amountIn;
    else if (tokenIn === m.token1) m.reserve1 += p.amountIn;

    if (tokenOut === m.token0) {
      const r = subtractClamped(m.reserve0, p.amountOut);
      if (r.clamped) ctx.cache.log.warn(`[liquidity] pool ${pool} reserve0 clamped to 0: out ${p.amountOut} > reserve ${m.reserve0}`);
      m.reserve0 = r.value;
    } else if (tokenOut === m.token1) {
      const r = subtractClamped(m.reserve1, p.amountOut);
      if (r.clamped) ctx.cache.log.warn(`[liquidity] pool ${pool} reserve1 clamped to 0: out ${p.amountOut} > reserve ${m.reserve1}`);
      m.reserve1 = r.value;
    }
  }

  await refreshNativePrice(ctx, meta, m);
  await addFees(ctx, meta, m, fee0, fee1);
}

async function addFees(ctx: Ctx, meta: EventMeta, m: PoolMetrics, fee0: bigint, fee1: bigint): Promise<void> {
  const d = await getOrCreateDailyFees(ctx, m, meta.blockTimestamp);
  d.totalFeesToken0 += fee0;
  d.totalFeesToken1 += fee1;
  d.swapCount += 1;
  ctx.cache.set(DailyFees, d);

  m.cumulativeFeesToken0 += fee0;
  m.cumulativeFeesToken1 += fee1;
  touch(m, meta);
  ctx.cache.set(PoolMetrics, m);
}
