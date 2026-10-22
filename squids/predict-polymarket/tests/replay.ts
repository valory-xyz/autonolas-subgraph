// Shared helpers for the log-replay tests: recorded Polygon logs (see
// tests/fixtures/) are fed as SQD batches to src/main.ts's batch handler,
// over an in-memory store, and the store is reduced to a plain snapshot.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { InMemoryCache } from "./inMemoryCache";
import {
  Bet,
  DailyProfitStatistic,
  Global,
  MarketParticipant,
  TraderAgent,
} from "../src/model";

export type RawLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  logIndex: number;
};

/** Block number + timestamp in SECONDS, as recorded from the chain. */
export type RecordedBlock = { number: number; timestamp: number };

export function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8")) as T;
}

/** The TypeORM store surface EntityCache reads and writes. */
export class FakeStore extends InMemoryCache {
  async upsert(rows: { id: string; constructor: { name: string } }[]) {
    for (const r of rows) this.set(r.constructor as never, r);
  }
  async findOne(cls: { name: string }, opts: { where: { id: string } }) {
    return this.get(cls as never, opts.where.id);
  }
  /** Only the two settlement queries EntityCache makes: participants by question, bets by participant. */
  async find(cls: { name: string }, opts: { where: Record<string, { id: string }> }) {
    const [[field, ref], ...rest] = Object.entries(opts.where);
    const supported = { [MarketParticipant.name]: "question", [Bet.name]: "marketParticipant" };
    if (rest.length > 0 || supported[cls.name] !== field || ref?.id == null) {
      throw new Error(`FakeStore.find does not support ${cls.name} ${JSON.stringify(opts.where)}`);
    }
    return this.all(cls as never).filter((row) => (row as Record<string, { id: string } | null>)[field]?.id === ref.id);
  }
}

type BatchHandler = (ctx: { blocks: unknown[]; store: FakeStore; isHead: boolean }) => Promise<void>;
let mainHandler: Promise<BatchHandler> | undefined;

/** Imports src/main.ts with SQD's run() mocked, and returns the handler it registers. */
function captureMainHandler(): Promise<BatchHandler> {
  mainHandler ??= (async () => {
    let handler: BatchHandler | undefined;
    vi.doMock("@subsquid/batch-processor", () => ({
      run: (_source: unknown, _db: unknown, h: BatchHandler) => {
        handler = h;
      },
    }));
    await import("../src/main");
    if (handler == null) throw new Error("main.ts must register its batch handler with run()");
    return handler;
  })();
  return mainHandler;
}

/** Feeds the blocks to main.ts's batch handler as one SQD batch. */
export async function runBatch(store: FakeStore, blocks: { block: RecordedBlock; logs: RawLog[] }[]) {
  const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
  const handler = await captureMainHandler();
  await handler({
    blocks: blocks.map(({ block, logs }) => ({
      // evm-stream: timestamps in milliseconds
      header: { number: block.number, hash: hash(block.number), parentHash: hash(block.number - 1), timestamp: block.timestamp * 1000 },
      transactions: [],
      logs: logs.map((l) => ({ ...l, transactionIndex: 0 })),
      traces: [],
      stateDiffs: [],
    })),
    store,
    isHead: false,
  });
}

const s = (v: bigint | null | undefined) => (v == null ? null : v.toString());

/** Order-independent, JSON-safe reduction of the bet totals readers query. */
export function snapshot(cache: InMemoryCache) {
  const byId = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const global = cache.store.get(Global.name)?.get("") as Global | undefined;
  return {
    global: global && {
      totalTraderAgents: global.totalTraderAgents,
      totalActiveTraderAgents: global.totalActiveTraderAgents,
      totalBets: global.totalBets,
      totalTraded: s(global.totalTraded),
      totalMarketsParticipated: global.totalMarketsParticipated,
    },
    traderAgents: byId(cache.all(TraderAgent)).map((a) => ({
      id: a.id,
      serviceId: s(a.serviceId),
      totalBets: a.totalBets,
      totalTraded: s(a.totalTraded),
      firstParticipation: s(a.firstParticipation),
      lastActive: s(a.lastActive),
    })),
    bets: byId(cache.all(Bet)).map((b) => ({
      id: b.id,
      bettor: b.bettor.id,
      outcomeIndex: s(b.outcomeIndex),
      amount: s(b.amount),
      shares: s(b.shares),
      isBuy: b.isBuy,
      impliedProbability: s(b.impliedProbability),
      question: b.question?.id ?? null,
      marketParticipant: b.marketParticipant?.id ?? null,
      dailyStatistic: b.dailyStatistic?.id ?? null,
      builder: b.builder ?? null,
      metadata: b.metadata ?? null,
      blockTimestamp: s(b.blockTimestamp),
      transactionHash: b.transactionHash,
    })),
    marketParticipants: byId(cache.all(MarketParticipant)).map((p) => ({
      id: p.id,
      traderAgent: p.traderAgent.id,
      totalBets: p.totalBets,
      totalTraded: s(p.totalTraded),
      outcomeShares0: s(p.outcomeShares0),
      outcomeShares1: s(p.outcomeShares1),
    })),
    dailyProfitStatistics: byId(cache.all(DailyProfitStatistic)).map((d) => ({
      id: d.id,
      totalBets: d.totalBets,
      totalTraded: s(d.totalTraded),
    })),
  };
}
