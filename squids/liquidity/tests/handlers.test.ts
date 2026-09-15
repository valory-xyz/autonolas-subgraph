// Ported from subgraphs/liquidity-l2/tests/mapping.test.ts (Matchstick):
// LP transfer supply tracking, Balancer reserve refetch on mint/burn, Vault
// swap fee attribution / reserve deltas / pool-id filtering, Uniswap V2
// Sync + Swap, and the native price refresh with staleness.
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCache, type EventMeta, type UsdPriceSource } from "@olas/squid-shared";
import * as h from "../src/handlers";
import type { Ctx } from "../src/handlers";
import { BPTTransfer, DailyFees, PoolMetrics, PriceData } from "../src/model";
import type { BalancerReader, PairReader } from "../src/logic";
import { PRICE_DATA_ID, type PoolConfig } from "../src/constants";

const ZERO = "0x0000000000000000000000000000000000000000";
const POOL = "0x79c872ed3acb3fc5770dd8a0cd9cd5db3b3ac985"; // Gnosis Balancer BPT
const POOL_ID = `${POOL}000200000000000000000009`;
const OTHER_POOL_ID = "0x1111111111111111111111111111111111111111000200000000000000000001";
const PAIR = "0xc2ea98b5a75fd85f7ce57af856baaffecd445659"; // Robinhood Uniswap V2
const VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const USER_1 = "0x0000000000000000000000000000000000000001";
const USER_2 = "0x0000000000000000000000000000000000000002";
const OLAS = "0xce11e14225575945b8e6dc0d4f2dd4c570f79d9f";
const WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";

const BPT = 1000n * 10n ** 18n;
const BPT_SMALL = 500n * 10n ** 18n;
const RESERVE_OLAS = 500_000n * 10n ** 18n;
const RESERVE_WXDAI = 100_000n * 10n ** 18n;
const SWAP_FEE = 10n ** 16n; // 1%
const SWAP_IN = 1000n * 10n ** 18n;
const DAY1 = 1_789_000_000n;
const DAY1_START = (DAY1 / 86400n) * 86400n;

let txCounter = 0;
function meta(address: string, ts = DAY1, block = 100n): EventMeta {
  txCounter += 1;
  return {
    blockNumber: block,
    blockTimestamp: ts,
    txHash: `0x${String(txCounter).padStart(64, "0")}`,
    logIndex: 0,
    address,
    txFrom: null,
    txTo: null,
  };
}

class StubBalancer implements BalancerReader {
  calls: string[] = [];
  constructor(
    public poolId: string | null = POOL_ID,
    public fee: bigint | null = SWAP_FEE,
    public reserves: { tokens: string[]; balances: bigint[] } | null = {
      tokens: [OLAS, WXDAI],
      balances: [RESERVE_OLAS, RESERVE_WXDAI],
    },
  ) {}
  async getPoolId() {
    this.calls.push("getPoolId");
    return this.poolId;
  }
  async getSwapFeePercentage(block: bigint) {
    this.calls.push(`getSwapFeePercentage:${block}`);
    return this.fee;
  }
  async reservesAt(block: bigint) {
    this.calls.push(`reservesAt:${block}`);
    return this.reserves;
  }
}

class StubPair implements PairReader {
  calls = 0;
  constructor(public tokens: [string, string] | null = [OLAS, WXDAI]) {}
  async getTokens() {
    this.calls += 1;
    return this.tokens;
  }
}

function priceSource(answer: bigint | null): UsdPriceSource & { calls: bigint[] } {
  const calls: bigint[] = [];
  return {
    calls,
    usdAt: async (b: bigint) => {
      calls.push(b);
      return answer == null ? null : { answer, decimals: 8 };
    },
  };
}

let cache: InMemoryCache;
let balancer: StubBalancer;
let pairStub: StubPair;

function makeCtx(opts: { price?: UsdPriceSource | null; pools?: PoolConfig[] } = {}): Ctx {
  const pools = opts.pools ?? [
    { address: POOL, dex: "balancer-v2", startBlock: 1 },
    { address: PAIR, dex: "uniswap-v2", startBlock: 1 },
  ];
  return {
    cache,
    pools: new Map(pools.map((p) => [p.address, p])),
    balancer: () => balancer,
    pair: () => pairStub,
    price: opts.price === undefined ? null : opts.price,
  };
}

beforeEach(() => {
  cache = new InMemoryCache();
  balancer = new StubBalancer();
  pairStub = new StubPair();
  txCounter = 0;
});

const mint = (ctx: Ctx, pool: string, value = BPT, block = 100n) =>
  h.handleLpTransfer(ctx, meta(pool, DAY1, block), { from: ZERO, to: USER_1, value });
const burn = (ctx: Ctx, pool: string, value: bigint, block = 100n) =>
  h.handleLpTransfer(ctx, meta(pool, DAY1, block), { from: USER_1, to: ZERO, value });

describe("handleLpTransfer", () => {
  it("mint increases supply and totalMinted and records the transfer", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL);
    const m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.totalSupply).toBe(BPT);
    expect(m.totalMinted).toBe(BPT);
    expect(m.dex).toBe("balancer-v2");
    const rows = cache.all(BPTTransfer);
    expect(rows).toHaveLength(1);
    expect(rows[0].pool.id).toBe(POOL);
    expect(rows[0].from).toBe(ZERO);
    expect(rows[0].to).toBe(USER_1);
  });

  it("burn decreases supply, clamped at zero, and counts totalBurned", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL);
    await burn(ctx, POOL, BPT_SMALL);
    let m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.totalSupply).toBe(BPT - BPT_SMALL);
    expect(m.totalBurned).toBe(BPT_SMALL);
    await burn(ctx, POOL, BPT); // more than left
    m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.totalSupply).toBe(0n);
    expect(m.totalBurned).toBe(BPT_SMALL + BPT);
  });

  it("Balancer mint fetches pool id, tokens and reserves at the event block", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL, BPT, 123n);
    const m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.poolId).toBe(POOL_ID);
    expect(m.token0).toBe(OLAS);
    expect(m.token1).toBe(WXDAI);
    expect(m.reserve0).toBe(RESERVE_OLAS);
    expect(m.reserve1).toBe(RESERVE_WXDAI);
    expect(m.reservesRefreshedAtBlock).toBe(123n);
    expect(balancer.calls).toEqual(["getPoolId", "reservesAt:123"]);
  });

  it("a regular transfer changes neither supply nor reserves and makes no reads", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL);
    balancer.calls.length = 0;
    await h.handleLpTransfer(ctx, meta(POOL), { from: USER_1, to: USER_2, value: BPT_SMALL });
    const m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.totalSupply).toBe(BPT);
    expect(balancer.calls).toEqual([]);
    expect(cache.all(BPTTransfer)).toHaveLength(2);
  });

  it("multiple mints accumulate", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL, BPT);
    await mint(ctx, POOL, BPT_SMALL);
    const m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.totalSupply).toBe(BPT + BPT_SMALL);
    expect(m.totalMinted).toBe(BPT + BPT_SMALL);
  });

  it("Uniswap V2 mint tracks supply but reads nothing from the vault", async () => {
    const ctx = makeCtx();
    await mint(ctx, PAIR);
    const m = (await cache.get(PoolMetrics, PAIR))!;
    expect(m.dex).toBe("uniswap-v2");
    expect(m.totalSupply).toBe(BPT);
    expect(m.reserve0).toBe(0n);
    expect(balancer.calls).toEqual([]);
  });

  it("keeps going when the vault reads revert (null), leaving reserves untouched", async () => {
    balancer = new StubBalancer(null, null, null);
    const ctx = makeCtx();
    await mint(ctx, POOL);
    const m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.totalSupply).toBe(BPT);
    expect(m.poolId).toBeNull();
    expect(m.reservesRefreshedAtBlock).toBe(0n);
  });
});

describe("handleVaultSwap", () => {
  const swap = (ctx: Ctx, over: Partial<Parameters<typeof h.handleVaultSwap>[2]> = {}, block = 200n, ts = DAY1) =>
    h.handleVaultSwap(ctx, meta(VAULT, ts, block), {
      poolId: POOL_ID,
      tokenIn: WXDAI,
      tokenOut: OLAS,
      amountIn: SWAP_IN,
      amountOut: 5000n * 10n ** 18n,
      ...over,
    });

  it("matching pool id attributes the fee to the tokenIn side and opens a daily row", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL);
    await swap(ctx);
    const expectedFee = (SWAP_IN * SWAP_FEE) / 10n ** 18n;
    const daily = cache.all(DailyFees);
    expect(daily).toHaveLength(1);
    expect(daily[0].id).toBe(`${POOL}-${DAY1_START}`);
    expect(daily[0].totalFeesToken1).toBe(expectedFee);
    expect(daily[0].totalFeesToken0).toBe(0n);
    expect(daily[0].swapCount).toBe(1);
    expect(balancer.calls.filter((c) => c.startsWith("getSwapFeePercentage:"))).toHaveLength(1);
  });

  it("is ignored before any mint (no PoolMetrics) and for a non-matching pool id", async () => {
    const ctx = makeCtx();
    await swap(ctx);
    expect(cache.all(DailyFees)).toHaveLength(0);
    await mint(ctx, POOL);
    await swap(ctx, { poolId: OTHER_POOL_ID });
    expect(cache.all(DailyFees)).toHaveLength(0);
  });

  it("accumulates daily and cumulative fees across swaps and caches the swap fee", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL);
    await swap(ctx);
    await swap(ctx, { tokenIn: OLAS, tokenOut: WXDAI });
    const single = (SWAP_IN * SWAP_FEE) / 10n ** 18n;
    const [daily] = cache.all(DailyFees);
    expect(daily.swapCount).toBe(2);
    expect(daily.totalFeesToken0).toBe(single);
    expect(daily.totalFeesToken1).toBe(single);
    const m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.cumulativeFeesToken0).toBe(single);
    expect(m.cumulativeFeesToken1).toBe(single);
    expect(balancer.calls.filter((c) => c.startsWith("getSwapFeePercentage:"))).toHaveLength(1);
  });

  it("applies reserve deltas after the refetch block and skips them in it", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL, BPT, 100n);
    // same block as the refetch: no delta
    await swap(ctx, {}, 100n);
    let m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.reserve0).toBe(RESERVE_OLAS);
    expect(m.reserve1).toBe(RESERVE_WXDAI);
    // later block: tokenIn (WXDAI = token1) enters, tokenOut (OLAS = token0) leaves
    await swap(ctx, { amountOut: 5000n * 10n ** 18n }, 101n);
    m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.reserve1).toBe(RESERVE_WXDAI + SWAP_IN);
    expect(m.reserve0).toBe(RESERVE_OLAS - 5000n * 10n ** 18n);
  });

  it("clamps a reserve at zero with a warning instead of going negative", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL, BPT, 100n);
    await swap(ctx, { amountOut: RESERVE_OLAS * 2n }, 101n);
    const m = (await cache.get(PoolMetrics, POOL))!;
    expect(m.reserve0).toBe(0n);
    expect(cache.warnings.some((w) => w.includes("clamped"))).toBe(true);
  });

  it("skips fee attribution while token addresses are unknown", async () => {
    balancer = new StubBalancer(POOL_ID, SWAP_FEE, null);
    const ctx = makeCtx();
    await mint(ctx, POOL);
    await swap(ctx);
    expect(cache.all(DailyFees)).toHaveLength(0);
    expect(cache.warnings.some((w) => w.includes("token addresses unset"))).toBe(true);
  });

  it("separates daily rows per pool and per day", async () => {
    const ctx = makeCtx();
    await mint(ctx, POOL);
    await swap(ctx, {}, 200n, DAY1);
    await swap(ctx, {}, 201n, DAY1 + 86_400n);
    const ids = cache.all(DailyFees).map((d) => d.id).sort();
    expect(ids).toEqual([`${POOL}-${DAY1_START}`, `${POOL}-${DAY1_START + 86_400n}`].sort());
  });
});

describe("Uniswap V2", () => {
  it("Sync sets reserves, resolves tokens once, and refreshes the native price", async () => {
    const price = priceSource(2000n * 10n ** 8n);
    const ctx = makeCtx({ price });
    await h.handleUniswapSync(ctx, meta(PAIR, DAY1, 300n), { reserve0: 10n, reserve1: 20n });
    await h.handleUniswapSync(ctx, meta(PAIR, DAY1 + 10n, 301n), { reserve0: 11n, reserve1: 21n });
    const m = (await cache.get(PoolMetrics, PAIR))!;
    expect([m.reserve0, m.reserve1]).toEqual([11n, 21n]);
    expect([m.token0, m.token1]).toEqual([OLAS, WXDAI]);
    expect(pairStub.calls).toBe(1);
    expect(m.nativeUsdPrice).toBe(2000n * 10n ** 8n);
    expect(m.poolId).toBeNull();
    const pd = (await cache.get(PriceData, PRICE_DATA_ID))!;
    expect(pd.decimals).toBe(8);
    // second Sync within the staleness window did not re-read the feed
    expect(price.calls).toEqual([300n]);
  });

  it("re-reads the price once it is stale, and keeps the last value on a revert", async () => {
    const price = priceSource(2000n * 10n ** 8n);
    const ctx = makeCtx({ price });
    await h.handleUniswapSync(ctx, meta(PAIR, DAY1, 300n), { reserve0: 1n, reserve1: 1n });
    await h.handleUniswapSync(ctx, meta(PAIR, DAY1 + 3600n, 400n), { reserve0: 1n, reserve1: 1n });
    expect(price.calls).toEqual([300n, 400n]);
    // now the feed reverts: the stored price stays
    const reverting = priceSource(null);
    const ctx2: Ctx = { ...ctx, price: reverting };
    await h.handleUniswapSync(ctx2, meta(PAIR, DAY1 + 7200n, 500n), { reserve0: 1n, reserve1: 1n });
    const m = (await cache.get(PoolMetrics, PAIR))!;
    expect(m.nativeUsdPrice).toBe(2000n * 10n ** 8n);
  });

  it("without a feed the price stays 0 and nothing is read", async () => {
    const ctx = makeCtx({ price: null });
    await h.handleUniswapSync(ctx, meta(PAIR), { reserve0: 1n, reserve1: 1n });
    const m = (await cache.get(PoolMetrics, PAIR))!;
    expect(m.nativeUsdPrice).toBe(0n);
    expect(await cache.get(PriceData, PRICE_DATA_ID)).toBeUndefined();
  });

  it("Swap charges 0.3% of each input side into daily and cumulative fees", async () => {
    const ctx = makeCtx();
    await h.handleUniswapSwap(ctx, meta(PAIR), { amount0In: 1000n, amount1In: 0n });
    await h.handleUniswapSwap(ctx, meta(PAIR), { amount0In: 0n, amount1In: 2000n });
    const m = (await cache.get(PoolMetrics, PAIR))!;
    expect(m.cumulativeFeesToken0).toBe(3n);
    expect(m.cumulativeFeesToken1).toBe(6n);
    const [daily] = cache.all(DailyFees);
    expect(daily.pool.id).toBe(PAIR);
    expect(daily.swapCount).toBe(2);
    expect(daily.totalFeesToken0).toBe(3n);
    expect(daily.totalFeesToken1).toBe(6n);
  });
});
