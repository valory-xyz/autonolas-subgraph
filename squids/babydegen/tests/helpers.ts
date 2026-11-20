import { InMemoryCache, type EntityClass, type EventMeta } from "@olas/squid-shared";
import type { Cache } from "../src/entityCache";

/** InMemoryCache with graph-node's `store.remove`. */
export class TestCache extends InMemoryCache implements Cache {
  remove<T extends { id: string }>(cls: EntityClass<T>, id: string): void {
    this.bucket(cls.name).delete(id);
  }
}
import type { Ctx, Tx } from "../src/handlers";
import type { ChainReader, RpcLog, RpcTransaction } from "../src/rpc";
import { ETH_USD_FEED, USDC_USD_FEED } from "../src/constants";

export interface Round {
  answer: bigint;
  updatedAt: bigint;
}
export interface Pool {
  token0: string;
  token1: string;
  r0?: bigint;
  r1?: bigint;
  /** stable(); undefined = the call reverts (Aero v2 pools have none). */
  stable?: boolean;
  /** getAmountOut(amountIn, tokenIn) by `${amountIn}:${tokenIn}`; missing = revert. */
  quotes?: Map<string, bigint>;
  /** CL slot0().sqrtPriceX96. */
  sqrtPriceX96?: bigint;
}

/** A ChainReader stand-in: Chainlink feeds, pools, Safes and code by address. */
export class FakeChain {
  feeds = new Map<string, Round | null>();
  pools = new Map<string, Pool | null>();
  contracts = new Set<string>();
  /** Contracts whose getThreshold() answers. */
  safes = new Set<string>();
  logs: RpcLog[] = [];
  txs = new Map<string, RpcTransaction>();
  receipts = new Map<string, { address: string; topics: string[]; data?: string; logIndex?: number }[]>();
  calls: string[] = [];
  /** Exact eth_call answers by `${to}:${calldata}`; null = revert. Checked first. */
  mocks = new Map<string, unknown>();

  mock<A>(to: string, fn: { encode(a: A): string }, args: A, result: unknown): this {
    this.mocks.set(`${to}:${fn.encode(args)}`, result);
    return this;
  }

  constructor() {
    // $3000 ETH, $1 USDC, fresh at any timestamp used in the tests.
    this.feeds.set(ETH_USD_FEED, { answer: 3000_00000000n, updatedAt: 10n ** 12n });
    this.feeds.set(USDC_USD_FEED, { answer: 1_00000000n, updatedAt: 10n ** 12n });
  }

  async call(to: string, block: bigint, fn: { encode(a: any): string }, args: any): Promise<any> {
    const data = fn.encode(args);
    const sel = data.slice(0, 10);
    this.calls.push(`${sel}@${to}#${block}`);
    if (this.mocks.has(`${to}:${data}`)) return this.mocks.get(`${to}:${data}`);
    if (sel === "0xfeaf968c") {
      const r = this.feeds.get(to);
      if (r == null) return null;
      return { roundId: 1n, answer: r.answer, startedAt: r.updatedAt, updatedAt: r.updatedAt, answeredInRound: 1n };
    }
    if (sel === "0xe75235b8") return this.safes.has(to) ? 1n : null;
    const pool = this.pools.get(to);
    if (pool == null) return null;
    if (sel === "0x0dfe1681") return pool.token0;
    if (sel === "0xd21220a7") return pool.token1;
    if (sel === "0x0902f1ac") {
      if (pool.r0 === undefined) return null;
      return { _reserve0: pool.r0, _reserve1: pool.r1!, _blockTimestampLast: 0n };
    }
    if (sel === "0x22be3de1") return pool.stable ?? null;
    if (sel === "0xf140a35a") return pool.quotes?.get(`${args.amountIn}:${args.tokenIn}`) ?? null;
    if (sel === "0x3850c7bd") {
      if (pool.sqrtPriceX96 === undefined) return null;
      return {
        sqrtPriceX96: pool.sqrtPriceX96,
        tick: 0,
        observationIndex: 0,
        observationCardinality: 0,
        observationCardinalityNext: 0,
        unlocked: true,
      };
    }
    throw new Error(`unexpected call ${sel} to ${to}`);
  }

  async hasCode(address: string): Promise<boolean> {
    return this.contracts.has(address);
  }

  async getLogs(filter: { address?: string[]; topics?: (string[] | null)[] }): Promise<RpcLog[]> {
    return this.logs.filter((l) => {
      if (filter.address && !filter.address.includes(l.address)) return false;
      return (filter.topics ?? []).every((want, i) => want == null || want.includes(l.topics[i]));
    });
  }

  async getTransaction(hash: string): Promise<RpcTransaction> {
    const tx = this.txs.get(hash);
    if (tx == null) throw new Error(`no tx ${hash}`);
    return tx;
  }

  async getReceiptLogs(hash: string): Promise<{ address: string; topics: string[]; data: string; logIndex: number }[]> {
    const r = this.receipts.get(hash);
    if (r == null) throw new Error(`no receipt ${hash}`);
    return r as { address: string; topics: string[]; data: string; logIndex: number }[];
  }
}

export function setup() {
  const cache = new TestCache();
  const chain = new FakeChain();
  const ctx: Ctx = {
    cache,
    chain: chain as unknown as ChainReader,
    log: cache.log,
    spawnedSafes: [],
    newServices: [],
    spawnedPools: [],
  };
  return { cache, chain, ctx };
}

export const addr = (n: number) => "0x" + n.toString(16).padStart(40, "0");
export const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");

/** A tx sent by an unrelated relayer to an unrelated contract, no calldata. */
export const RELAYER = addr(0xfff1);
export function tx(over: Partial<Tx> = {}): Tx {
  return { from: RELAYER, to: addr(0xfff2), value: 0n, input: "0x", ...over };
}

export function meta(over: Partial<EventMeta> = {}): EventMeta {
  return {
    blockNumber: 47_200_000n,
    blockTimestamp: 1_781_000_000n,
    txHash: hash(1),
    logIndex: 0,
    address: addr(0),
    txFrom: null,
    txTo: null,
    ...over,
  };
}
