import { InMemoryCache, type EventMeta } from "@olas/squid-shared";
import type { Ctx } from "../src/handlers";
import type { ChainReader, RpcLog, RpcTransaction } from "../src/rpc";
import { ETH_USD_FEED, USDC_USD_FEED } from "../src/constants";

export interface Round {
  answer: bigint;
  updatedAt: bigint;
}
export interface Pool {
  token0: string;
  token1: string;
  r0: bigint;
  r1: bigint;
  ts?: bigint;
}

/** A ChainReader stand-in: Chainlink feeds, v2 pools and code by address. */
export class FakeChain {
  feeds = new Map<string, Round | null>();
  pools = new Map<string, Pool | null>();
  contracts = new Set<string>();
  logs: RpcLog[] = [];
  txs = new Map<string, RpcTransaction>();
  calls: string[] = [];

  constructor() {
    // $3000 ETH, $1 USDC, fresh at any timestamp used in the tests.
    this.feeds.set(ETH_USD_FEED, { answer: 3000_00000000n, updatedAt: 10n ** 12n });
    this.feeds.set(USDC_USD_FEED, { answer: 1_00000000n, updatedAt: 10n ** 12n });
  }

  async call(to: string, block: bigint, fn: { encode(a: any): string }, args: any): Promise<any> {
    const sel = fn.encode(args).slice(0, 10);
    this.calls.push(`${sel}@${to}#${block}`);
    if (sel === "0xfeaf968c") {
      const r = this.feeds.get(to);
      if (r == null) return null;
      return { roundId: 1n, answer: r.answer, startedAt: r.updatedAt, updatedAt: r.updatedAt, answeredInRound: 1n };
    }
    const pool = this.pools.get(to);
    if (pool == null) return null;
    if (sel === "0x0dfe1681") return pool.token0;
    if (sel === "0xd21220a7") return pool.token1;
    if (sel === "0x0902f1ac") return { _reserve0: pool.r0, _reserve1: pool.r1, _blockTimestampLast: pool.ts ?? 0n };
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
}

export function setup() {
  const cache = new InMemoryCache();
  const chain = new FakeChain();
  const ctx: Ctx = {
    cache,
    chain: chain as unknown as ChainReader,
    log: cache.log,
    spawnedSafes: [],
    newServices: [],
  };
  return { cache, chain, ctx };
}

export const addr = (n: number) => "0x" + n.toString(16).padStart(40, "0");
export const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");

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
