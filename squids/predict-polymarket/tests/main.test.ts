// The production entry point: src/main.ts's batch handler, driven with
// recorded Polygon blocks as SQD's run() would hand them over, over an
// in-memory store. It must still route the V1 logs it routed on main and
// route Protocol V2 fills too.
import { expect, it, vi } from "vitest";

const runner = vi.hoisted(() => ({ handler: null as null | ((ctx: unknown) => Promise<void>) }));
vi.mock("@subsquid/batch-processor", () => ({
  run: vi.fn((_source: unknown, _db: unknown, handler: (ctx: unknown) => Promise<void>) => {
    runner.handler = handler;
  }),
}));
const derived = vi.hoisted(() => ({ ids: {} as Record<string, string[]> }));
vi.mock("../src/tokenDerivation", () => ({
  getOutcomeTokenId: vi.fn(async (conditionId: string, _c: string, indexSet: number) => derived.ids[conditionId]?.[indexSet - 1] ?? null),
}));

import { InMemoryCache } from "./inMemoryCache";
import { loadFixture, RawLog, RecordedBlock, snapshot } from "./replay";
import * as factory from "../src/abi/DepositWalletFactory/events";
import { Bet } from "../src/model";
import "../src/main";

/** The TypeORM store surface EntityCache reads and writes. */
class FakeStore extends InMemoryCache {
  async upsert(rows: { id: string; constructor: { name: string } }[]) {
    for (const r of rows) this.set(r.constructor as never, r);
  }
  async findOne(cls: { name: string }, opts: { where: { id: string } }) {
    return this.get(cls as never, opts.where.id);
  }
  async find() {
    return [];
  }
}

const MINT_TX = "0xe0abd59682255da75d2b12783e64c1fae4f24dca7544f61dfbb9e8c227e411c4";
const AGENT_297_SAFE = "0x0f5937fb14b8a52ee3d9356b068de1a48bc4d6d9";

function sqdBlockItem(block: RecordedBlock, logs: RawLog[]) {
  // evm-stream: timestamps in milliseconds
  const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
  return {
    header: { number: block.number, hash: hash(block.number), parentHash: hash(block.number - 1), timestamp: block.timestamp * 1000 },
    transactions: [],
    logs: logs.map((l) => ({ ...l, transactionIndex: 0 })),
    traces: [],
    stateDiffs: [],
  };
}

it("routes the recorded V1 logs and a Protocol V2 ExchangeV3 fill", async () => {
  expect(runner.handler, "main.ts must register its batch handler with run()").toBeTypeOf("function");
  const v1 = loadFixture<{ derivedTokenIds: Record<string, string[]>; logs: { block: RecordedBlock; log: RawLog }[] }>("v1-replay.json");
  const v2 = loadFixture<{ trades: Record<string, { block: RecordedBlock; logs: RawLog[] }> }>("v2-trades.json").trades[MINT_TX]!;
  derived.ids = v1.derivedTokenIds;
  // agent 297's instance EOA also deploys 0xfc26…, the maker of the recorded V2 fill
  const walletDeployed = factory.WalletDeployed.encode({
    wallet: "0xfc26c4758c104d62a6a54a7e36dfd0ee64c0bc5b",
    owner: "0x75bf948904a6e8921e97c0667ad398474b18084b",
    salt: `0x${"5a".repeat(32)}`,
    implementation: `0x${"11".repeat(20)}`,
  });

  const store = new FakeStore();
  await runner.handler!({
    blocks: [
      ...v1.logs.map(({ block, log }) => sqdBlockItem(block, [log])),
      sqdBlockItem({ number: 95_000_000, timestamp: 1_790_000_000 }, [
        { address: "0x00000000000fb5c9adea0298d729a0cb3823cc07", ...walletDeployed, transactionHash: `0x${"ab".repeat(32)}`, logIndex: 0 },
      ]),
      sqdBlockItem(v2.block, v2.logs),
    ],
    store,
    isHead: false,
  });

  const { bets } = snapshot(store);
  const expectedV1 = loadFixture<ReturnType<typeof snapshot>>("v1-replay.expected.json").bets;
  expect(bets.filter((b) => b.id !== `${MINT_TX}_383`)).toEqual(expectedV1);
  const v2Bet = await store.get(Bet, `${MINT_TX}_383`);
  expect([v2Bet?.bettor.id, v2Bet?.collateral, v2Bet?.amount, v2Bet?.shares, v2Bet?.blockTimestamp]).toEqual([
    AGENT_297_SAFE,
    "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
    999_989n,
    1_052_620n,
    BigInt(v2.block.timestamp),
  ]);
});
