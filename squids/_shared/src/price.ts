// Price sources used to convert on-chain amounts to USD at the event's block.
// Every source returns null when the chain cannot answer (revert, no feed),
// and callers turn null into $0 with a warning — graph-node's `.reverted`.

import { BigDecimal } from "@subsquid/big-decimal";
import { BlockMemo, isRevert, Rpc } from "./rpc";

export const ZERO_USD = BigDecimal(0);

export function pow10(n: number): BigDecimal {
  return BigDecimal(10).pow(n);
}

/** A fixed-point price: `answer / 10^decimals` USD per unit. */
export interface UsdPrice {
  answer: bigint;
  decimals: number;
}

/** USD per one whole unit of some asset at a block. */
export interface UsdPriceSource {
  usdAt(blockNumber: bigint): Promise<UsdPrice | null>;
}

export const NO_PRICE_SOURCE: UsdPriceSource = { usdAt: async () => null };

/** A constant source, for tests and for stablecoins at 1:1. */
export function fixedPrice(answer: bigint, decimals: number): UsdPriceSource {
  return { usdAt: async () => ({ answer, decimals }) };
}

/** `amount` (raw, `assetDecimals`) × price → USD. */
export function toUsd(amount: bigint, assetDecimals: number, price: UsdPrice): BigDecimal {
  return BigDecimal(amount)
    .times(BigDecimal(price.answer))
    .div(pow10(price.decimals))
    .div(pow10(assetDecimals));
}

/** A stablecoin amount at 1:1. */
export function stableToUsd(amount: bigint, decimals: number): BigDecimal {
  return BigDecimal(amount).div(pow10(decimals));
}

// --- Chainlink -----------------------------------------------------------

const AGGREGATOR_V3_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/**
 * Chainlink AggregatorV3 `latestRoundData()` read at the event's block, with
 * the shared fallback chain and a per-block memo (a batch of N events at one
 * block reads the feed once; only successful reads are cached).
 */
export class ChainlinkSource implements UsdPriceSource {
  private decimals: number | null = null;
  private readonly memo = new BlockMemo<UsdPrice>();

  constructor(
    private readonly rpc: Rpc,
    readonly feed: `0x${string}`,
    private readonly log: { warn(msg: string): void } = console
  ) {}

  /**
   * Feed decimals, memoized. A revert means this address is not an
   * AggregatorV3 and yields null; anything else is re-thrown so SQD retries
   * the batch. No assumed default: it would mis-scale every price in the
   * block that provoked it, and the mistake reads as a plausible figure.
   */
  private async readDecimals(): Promise<number | null> {
    if (this.decimals != null) return this.decimals;
    try {
      this.decimals = Number(
        await this.rpc.latest((c) =>
          c.readContract({ address: this.feed, abi: AGGREGATOR_V3_ABI, functionName: "decimals" })
        )
      );
    } catch (err) {
      if (!isRevert(err)) throw err;
      this.log.warn(`[price] ${this.feed}.decimals() reverted; not a Chainlink feed`);
      return null;
    }
    return this.decimals;
  }

  /**
   * Price at `blockNumber`, or null when the feed has nothing usable to say.
   *
   * Not a freshness check: a feed that keeps returning its last good answer
   * past its heartbeat still reads as valid here, because the heartbeat is
   * per-feed and not configured. What is caught is an unusable answer and a
   * round that has not been answered yet.
   */
  async usdAt(blockNumber: bigint): Promise<UsdPrice | null> {
    const hit = this.memo.get(this.feed, blockNumber);
    if (hit != null) return hit;
    const decimals = await this.readDecimals();
    if (decimals == null) return null;
    const round = await this.rpc.at(blockNumber, `latestRoundData(${this.feed})`, (c, block) =>
      c.readContract({
        address: this.feed,
        abi: AGGREGATOR_V3_ABI,
        functionName: "latestRoundData",
        ...(block == null ? {} : { blockNumber: block }),
      })
    );
    if (round == null) return null;
    // A non-positive answer is not a price. Zero is what a feed returns for a
    // block predating its first round; negative would decrement the running
    // USD totals rather than skip. Filtered here so neither squid has to
    // remember to do it at the call site.
    // latestRoundData() is (roundId, answer, startedAt, updatedAt, answeredInRound).
    if (round[1] <= 0n) {
      this.log.warn(
        `[price] ${this.feed} answered ${round[1]} at block ${blockNumber}; not a usable price`
      );
      return null;
    }
    // A round still in progress carries the previous round's answer. Skipping
    // it is the same policy as a missing price rather than shipping a stale
    // figure that looks plausible. This does not catch a feed that is merely
    // slow — that needs the per-feed heartbeat, see the note in usdAt's doc.
    if (round[4] < round[0]) {
      this.log.warn(
        `[price] ${this.feed} round ${round[0]} not yet answered (answeredInRound ` +
          `${round[4]}) at block ${blockNumber}; skipping rather than using a stale answer`
      );
      return null;
    }
    return this.memo.set(this.feed, blockNumber, { answer: round[1], decimals });
  }
}

// --- Balancer V2 weighted pool --------------------------------------------

const BALANCER_VAULT_ABI = [
  {
    type: "function",
    name: "getPoolTokens",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "tokens", type: "address[]" },
      { name: "balances", type: "uint256[]" },
      { name: "lastChangeBlock", type: "uint256" },
    ],
  },
] as const;

const BALANCER_POOL_ABI = [
  { type: "function", name: "getPoolId", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function",
    name: "getSwapFeePercentage",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8" as const;

export interface PoolReserves {
  /** Lowercase token addresses, in the pool's order. */
  tokens: string[];
  balances: bigint[];
}

/** Balancer V2 pool reads: id, tokens/balances at a block, swap fee. */
export class BalancerPool {
  private poolId: `0x${string}` | null = null;
  private readonly memo = new BlockMemo<PoolReserves>();

  constructor(
    private readonly rpc: Rpc,
    readonly pool: `0x${string}`,
    readonly vault: `0x${string}` = BALANCER_VAULT,
    private readonly log: { warn(msg: string): void } = console
  ) {}

  /**
   * Pool id, memoized. A revert means this address is not a Balancer pool and
   * yields null; anything else is re-thrown so SQD retries the batch, rather
   * than letting a transport failure read as "no such pool".
   */
  async getPoolId(): Promise<`0x${string}` | null> {
    if (this.poolId != null) return this.poolId;
    try {
      this.poolId = await this.rpc.latest((c) =>
        c.readContract({ address: this.pool, abi: BALANCER_POOL_ABI, functionName: "getPoolId" })
      );
    } catch (err) {
      if (!isRevert(err)) throw err;
      this.log.warn(`[price] ${this.pool}.getPoolId() reverted; not a Balancer pool`);
      return null;
    }
    return this.poolId;
  }

  /**
   * Swap fee percentage (18-decimal fixed point) at `blockNumber` — the
   * subgraph read it at the block of the first observed swap and cached it,
   * so a pool whose fee was changed later must be read at that block, not
   * at `latest`, to reproduce the same cumulative fees.
   */
  async getSwapFeePercentage(blockNumber: bigint): Promise<bigint | null> {
    return this.rpc.at(blockNumber, `getSwapFeePercentage(${this.pool})`, (c, block) =>
      c.readContract({
        address: this.pool,
        abi: BALANCER_POOL_ABI,
        functionName: "getSwapFeePercentage",
        ...(block == null ? {} : { blockNumber: block }),
      })
    );
  }

  async reservesAt(blockNumber: bigint): Promise<PoolReserves | null> {
    const hit = this.memo.get(this.pool, blockNumber);
    if (hit != null) return hit;
    const poolId = await this.getPoolId();
    if (poolId == null) return null;
    const res = await this.rpc.at(blockNumber, `getPoolTokens(${this.pool})`, (c, block) =>
      c.readContract({
        address: this.vault,
        abi: BALANCER_VAULT_ABI,
        functionName: "getPoolTokens",
        args: [poolId],
        ...(block == null ? {} : { blockNumber: block }),
      })
    );
    if (res == null) return null;
    return this.memo.set(this.pool, blockNumber, {
      tokens: res[0].map((t) => t.toLowerCase()),
      balances: [...res[1]],
    });
  }
}

/**
 * Price of `base` in units of `quote` from a two-token pool's reserves, as
 * the subgraphs compute it: quoteReserve / baseReserve, decimals-adjusted.
 * Returns null when either reserve is zero or a token is missing.
 */
export function poolPrice(
  reserves: PoolReserves,
  base: string,
  baseDecimals: number,
  quote: string,
  quoteDecimals: number
): BigDecimal | null {
  const bi = reserves.tokens.indexOf(base.toLowerCase());
  const qi = reserves.tokens.indexOf(quote.toLowerCase());
  if (bi < 0 || qi < 0) return null;
  const b = reserves.balances[bi];
  const q = reserves.balances[qi];
  if (b === 0n || q === 0n) return null;
  return BigDecimal(q).div(pow10(quoteDecimals)).div(BigDecimal(b).div(pow10(baseDecimals)));
}

// --- Uniswap V2 pair --------------------------------------------------------

const UNISWAP_V2_PAIR_ABI = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

/** Uniswap V2 pair reads: tokens (memoized) and reserves at a block. */
export class UniswapV2Pair {
  private tokens: [string, string] | null = null;
  private readonly memo = new BlockMemo<PoolReserves>();

  constructor(
    private readonly rpc: Rpc,
    readonly pair: `0x${string}`,
    private readonly log: { warn(msg: string): void } = console
  ) {}

  /**
   * Both token addresses, memoized and lowercased. As with
   * {@link BalancerPool.getPoolId}, only a revert yields null; a transport
   * failure is re-thrown so the batch retries instead of leaving the pool's
   * token identity unset with no trace.
   */
  async getTokens(): Promise<[string, string] | null> {
    if (this.tokens != null) return this.tokens;
    try {
      const [t0, t1] = await Promise.all([
        this.rpc.latest((c) => c.readContract({ address: this.pair, abi: UNISWAP_V2_PAIR_ABI, functionName: "token0" })),
        this.rpc.latest((c) => c.readContract({ address: this.pair, abi: UNISWAP_V2_PAIR_ABI, functionName: "token1" })),
      ]);
      this.tokens = [t0.toLowerCase(), t1.toLowerCase()];
    } catch (err) {
      if (!isRevert(err)) throw err;
      this.log.warn(`[price] ${this.pair} token0()/token1() reverted; not a Uniswap V2 pair`);
      return null;
    }
    return this.tokens;
  }

  async reservesAt(blockNumber: bigint): Promise<PoolReserves | null> {
    const hit = this.memo.get(this.pair, blockNumber);
    if (hit != null) return hit;
    const tokens = await this.getTokens();
    if (tokens == null) return null;
    const res = await this.rpc.at(blockNumber, `getReserves(${this.pair})`, (c, block) =>
      c.readContract({
        address: this.pair,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: "getReserves",
        ...(block == null ? {} : { blockNumber: block }),
      })
    );
    if (res == null) return null;
    return this.memo.set(this.pair, blockNumber, { tokens: [...tokens], balances: [res[0], res[1]] });
  }
}
