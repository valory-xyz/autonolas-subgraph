// Shared helpers for the log-replay tests: recorded Polygon logs (see
// tests/fixtures/) are fed through src/dispatch.ts exactly as the processor
// would feed them, and the resulting store is reduced to a plain snapshot.
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/** The block header dispatch gets: SQD's evm-stream timestamps are MILLISECONDS. */
export function sqdBlock(b: RecordedBlock): RecordedBlock {
  return { number: b.number, timestamp: b.timestamp * 1000 };
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
