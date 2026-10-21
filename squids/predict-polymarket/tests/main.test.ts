// The production entry point: src/main.ts's batch handler, driven with a
// recorded Polygon block exactly as SQD's run() would drive it, over a fake
// TypeORM store. The replay tests exercise src/dispatch.ts directly; this one
// makes sure the processor that actually runs routes Protocol V2 fills too,
// and still routes the CLOB v2 CTF Exchange fills it routed on main.
import { beforeEach, describe, expect, it, vi } from "vitest";

const runner = vi.hoisted(() => ({
  handler: null as null | ((ctx: unknown) => Promise<void>),
}));
vi.mock("@subsquid/batch-processor", () => ({
  run: vi.fn((_source: unknown, _db: unknown, handler: (ctx: unknown) => Promise<void>) => {
    runner.handler = handler;
  }),
}));
// TypeormDatabase's constructor only stores options; run() is what would
// connect, and it is mocked above. The handler gets the fake store below
// through ctx.store.

import { loadFixture, RawLog, RecordedBlock } from "./replay";
import { Bet, DepositWallet, TokenRegistry, TraderAgent } from "../src/model";
import "../src/main";

const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const SAFE = "0x1000000000000000000000000000000000000001";
const MINT_TX = "0xe0abd59682255da75d2b12783e64c1fae4f24dca7544f61dfbb9e8c227e411c4";
const MINT_YES_MAKER = "0xfc26c4758c104d62a6a54a7e36dfd0ee64c0bc5b";

// agent 297's DepositWallet fill on the CLOB v2 CTF Exchange (see
// tests/fixtures/v1-replay.json): token 9801557736… is outcome 0 of
// condition 0x33533de7…
const V1_TX = "0xd44716474978b2c0e48140692fc64c26caed36f83111db2850f50edcd0e19d07";
const V1_SAFE = "0x0f5937fb14b8a52ee3d9356b068de1a48bc4d6d9";
const V1_DW = "0xfc44573392de3b50fd48b76890aa4ba4a79934c2";
const V1_CONDITION = "0x33533de70f94b422000bca977204b2f8b5620accd5ec94d5cc58448b66aa7e21";
const V1_TOKEN = "9801557736292658995163091700144020519221214526298349731804708782281865649071";

type Row = { id: string };
class FakeStore {
  rows = new Map<string, Map<string, Row>>();
  private bucket(name: string) {
    let b = this.rows.get(name);
    if (b == null) this.rows.set(name, (b = new Map()));
    return b;
  }
  put(row: Row) {
    this.bucket(row.constructor.name).set(row.id, row);
  }
  async get(cls: { name: string }, id: string) {
    return this.bucket(cls.name).get(id);
  }
  async findOne(cls: { name: string }, opts: { where: { id: string } }) {
    return this.bucket(cls.name).get(opts.where.id);
  }
  async find() {
    return [];
  }
  async upsert(rows: Row[] | Row) {
    for (const r of Array.isArray(rows) ? rows : [rows]) this.put(r);
  }
  async insert(rows: Row[] | Row) {
    await this.upsert(rows);
  }
  async save(rows: Row[] | Row) {
    await this.upsert(rows);
  }
  all<T>(cls: { name: string }): T[] {
    return [...this.bucket(cls.name).values()] as T[];
  }
}

function agent(id: string, serviceId: bigint) {
  return new TraderAgent({
    id,
    serviceId,
    firstParticipation: null,
    lastActive: null,
    totalBets: 0,
    totalTraded: 0n,
    totalTradedSettled: 0n,
    totalPayout: 0n,
    totalExpectedPayout: 0n,
    blockNumber: 1n,
    blockTimestamp: 1n,
    transactionHash: "0x00",
  });
}

function sqdBlockItem(block: RecordedBlock, logs: RawLog[]) {
  return {
    // evm-stream: timestamps in milliseconds, addresses lowercase
    header: {
      number: block.number,
      hash: `0x${block.number.toString(16).padStart(64, "0")}`,
      parentHash: `0x${(block.number - 1).toString(16).padStart(64, "0")}`,
      timestamp: block.timestamp * 1000,
    },
    transactions: [],
    logs: logs.map((l) => ({ ...l, transactionIndex: 0 })),
    traces: [],
    stateDiffs: [],
  };
}

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
});

describe("src/main.ts batch handler", () => {
  it("records a Protocol V2 ExchangeV3 fill and a CLOB v2 CTF Exchange fill from the blocks run() hands it", async () => {
    expect(runner.handler, "main.ts must register its batch handler with run()").toBeTypeOf("function");

    const v2Agent = agent(SAFE, 297n);
    const v1Agent = agent(V1_SAFE, 297n);
    store.put(v2Agent);
    store.put(v1Agent);
    const dw = (id: string, a: TraderAgent) =>
      new DepositWallet({
        id,
        traderAgent: a,
        agentInstance: "0x75bf948904a6e8921e97c0667ad398474b18084b",
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0x00",
      });
    store.put(dw(MINT_YES_MAKER, v2Agent));
    store.put(dw(V1_DW, v1Agent));
    store.put(
      new TokenRegistry({
        id: V1_TOKEN,
        tokenId: BigInt(V1_TOKEN),
        conditionId: V1_CONDITION,
        outcomeIndex: 0n,
        transactionHash: "0x00",
      }),
    );

    const v2 = loadFixture<Record<string, { block: RecordedBlock; logs: RawLog[] }>>("v2-trades.json")[MINT_TX]!;
    const v1 = loadFixture<{ logs: { block: RecordedBlock; log: RawLog }[] }>("v1-replay.json").logs.find(
      (e) => e.log.transactionHash === V1_TX && e.log.logIndex === 371,
    )!;
    expect(v1, "recorded CLOB v2 fill").toBeDefined();

    await runner.handler!({
      blocks: [sqdBlockItem(v1.block, [v1.log]), sqdBlockItem(v2.block, v2.logs)],
      store,
      isHead: false,
    });

    const bets = store.all<Bet>(Bet).sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(bets.map((b) => b.id)).toEqual([`${V1_TX}_371`, `${MINT_TX}_383`]);

    const v1Bet = bets[0]!;
    expect(v1Bet.bettor.id).toBe(V1_SAFE);
    expect(v1Bet.amount).toBe(2_129_999n);
    expect(v1Bet.shares).toBe(4_953_487n);

    const v2Bet = bets[1]!;
    expect(v2Bet.bettor.id).toBe(SAFE);
    expect((v2Bet as Bet & { collateral?: string | null }).collateral).toBe(PUSD);
    expect(v2Bet.amount).toBe(999_989n);
    expect(v2Bet.shares).toBe(1_052_620n);
    expect(v2Bet.outcomeIndex).toBe(0n);
    expect(v2Bet.blockTimestamp).toBe(BigInt(v2.block.timestamp));
    expect(v2Bet.marketParticipant?.id).toBe(
      `${SAFE}_0x01e8a4b7d8fb97379337bb29380b28df56000000000000000000000000000000`,
    );
  });
});
