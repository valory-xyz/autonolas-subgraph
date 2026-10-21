// V1 regression: a fixed range of recorded V1 (CTF position system) logs,
// replayed through src/dispatch.ts, must give exactly the bet totals main
// gives.
//
// tests/fixtures/v1-replay.json holds 65 recorded Polygon logs for two agent
// 86 services: service 66 trading from its Safe on CTFExchange and
// NegRiskCtfExchange (blocks 82,836,397-82,839,338), and service 297 trading
// through its DepositWallet on the CLOB v2 CTF Exchange (blocks
// 88,815,221-89,236,088), plus the registry, wallet-factory, TokenRegistered
// and ConditionPreparation logs those fills depend on.
//
// tests/fixtures/v1-replay.expected.json is the store snapshot main (base
// 7d0705d3) produces for that replay: computed by running main.ts's
// decode-and-dispatch over the same logs with main's handlers. The CTF
// getCollectionId eth_call is replaced by the token IDs Gamma serves for those
// conditions (clobTokenIds, index 0 = indexSet 1), as recorded in the fixture.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEventTopics, type Abi } from "viem";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const derivation = vi.hoisted(() => ({
  derived: {} as Record<string, string[]>,
  calls: [] as [string, string, number][],
}));
vi.mock("../src/tokenDerivation", () => ({
  getOutcomeTokenId: vi.fn(async (conditionId: string, collateral: string, indexSet: number) => {
    derivation.calls.push([conditionId, collateral, indexSet]);
    return derivation.derived[conditionId]?.[indexSet - 1] ?? null;
  }),
}));

import { InMemoryCache } from "./inMemoryCache";
import { loadFixture, RawLog, RecordedBlock, snapshot, sqdBlock } from "./replay";
import { dispatchLog } from "../src/dispatch";

type ReplayFixture = {
  derivedTokenIds: Record<string, string[]>;
  logs: { block: RecordedBlock; log: RawLog }[];
};
type V2Fixture = Record<string, { block: RecordedBlock; logs: RawLog[] }>;
type Snapshot = ReturnType<typeof snapshot>;

const v1 = loadFixture<ReplayFixture>("v1-replay.json");
const expected = loadFixture<Snapshot>("v1-replay.expected.json");
const v2 = loadFixture<V2Fixture>("v2-trades.json");

const USDC_E = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const DEPOSIT_WALLET_FACTORY = "0x00000000000fb5c9adea0298d729a0cb3823cc07";
const AGENT_297_EOA = "0x75bf948904a6e8921e97c0667ad398474b18084b";
const AGENT_297_SAFE = "0x0f5937fb14b8a52ee3d9356b068de1a48bc4d6d9";
const AGENT_66_SAFE = "0xdf242e5bded8fe15a98ffd60ec4b8747368575a8";
const MINT_TX = "0xe0abd59682255da75d2b12783e64c1fae4f24dca7544f61dfbb9e8c227e411c4";
const MINT_YES_MAKER = "0xfc26c4758c104d62a6a54a7e36dfd0ee64c0bc5b";
const MINT_CONDITION = "0x01e8a4b7d8fb97379337bb29380b28df56000000000000000000000000000000";

let cache: InMemoryCache;
beforeEach(() => {
  cache = new InMemoryCache();
  derivation.derived = v1.derivedTokenIds;
  derivation.calls.length = 0;
});

async function replayV1() {
  for (const { block, log } of v1.logs) await dispatchLog(cache, sqdBlock(block), log);
}

async function replayV2(tx: string) {
  const t = v2[tx]!;
  for (const log of t.logs) await dispatchLog(cache, sqdBlock(t.block), log);
}

describe("V1 regression", () => {
  it("replays the recorded V1 range through dispatch with exactly main's bet totals", async () => {
    await replayV1();
    const got = snapshot(cache);

    // headline totals first, so a mismatch reads clearly
    expect(got.global).toEqual(expected.global);
    expect(got.global?.totalBets).toBe(24);
    expect(got.global?.totalTraded).toBe("54589970");
    expect(got.traderAgents).toEqual(expected.traderAgents);
    expect(got.bets).toEqual(expected.bets);
    expect(got.marketParticipants).toEqual(expected.marketParticipants);
    expect(got.dailyProfitStatistics).toEqual(expected.dailyProfitStatistics);
    expect(got.depositWallets).toEqual(expected.depositWallets);
    expect(got).toEqual(expected);

    // V1 conditions still derive their CTF token IDs with USDC.e (never pUSD)
    expect(derivation.calls.length).toBe(24); // 12 ConditionPreparation x 2 index sets
    expect(derivation.calls.every(([, collateral]) => collateral === USDC_E)).toBe(true);
    expect(derivation.calls.some(([, collateral]) => collateral === PUSD)).toBe(false);
  });

  it("recorded V2 trades replayed after the V1 range add only their own bet and leave every V1 total unchanged", async () => {
    await replayV1();
    // a second DepositWallet for agent 297's instance EOA, deployed through
    // the factory (synthetic WalletDeployed, V1 code path)
    const factoryAbi = JSON.parse(
      readFileSync(join(__dirname, "../../../abis/DepositWalletFactory.json"), "utf8"),
    ) as Abi;
    const topics = encodeEventTopics({
      abi: factoryAbi,
      eventName: "WalletDeployed",
      args: {
        wallet: MINT_YES_MAKER,
        owner: AGENT_297_EOA,
        salt: `0x${"5a".repeat(32)}`,
      },
    } as never) as string[];
    await dispatchLog(cache, { number: 95_000_000, timestamp: 1_790_000_000_000 }, {
      address: DEPOSIT_WALLET_FACTORY,
      topics,
      data: `0x${"00".repeat(12)}${"11".repeat(20)}`, // implementation address
      transactionHash: `0x${"ab".repeat(32)}`,
      logIndex: 0,
    });
    for (const tx of Object.keys(v2)) await replayV2(tx);
    const got = snapshot(cache);

    // every V1 bet is still there, unchanged
    const v2Bets = got.bets.filter((b) => !expected.bets.some((e) => e.id === b.id));
    expect(got.bets.filter((b) => expected.bets.some((e) => e.id === b.id))).toEqual(expected.bets);
    // ...and the V2 replay added exactly one: 0xfc26…'s BUY, now agent 297's
    expect(v2Bets.map((b) => [b.id, b.bettor, b.amount, b.shares, b.outcomeIndex])).toEqual([
      [`${MINT_TX}_383`, AGENT_297_SAFE, "999989", "1052620", "0"],
    ]);

    // agent 66 untouched; agent 297 = main's totals + the one V2 bet
    const base = (id: string) => expected.traderAgents.find((a) => a.id === id)!;
    const now = (id: string) => got.traderAgents.find((a) => a.id === id)!;
    expect(now(AGENT_66_SAFE)).toEqual(base(AGENT_66_SAFE));
    expect(now(AGENT_297_SAFE).totalBets).toBe(base(AGENT_297_SAFE).totalBets + 1);
    expect(BigInt(now(AGENT_297_SAFE).totalTraded!)).toBe(
      BigInt(base(AGENT_297_SAFE).totalTraded!) + 999_989n,
    );
    expect(now(AGENT_297_SAFE).firstParticipation).toBe(base(AGENT_297_SAFE).firstParticipation);
    expect(now(AGENT_297_SAFE).lastActive).toBe(String(v2[MINT_TX]!.block.timestamp));

    expect(got.global).toEqual({
      ...expected.global!,
      totalBets: expected.global!.totalBets + 1,
      totalTraded: String(BigInt(expected.global!.totalTraded!) + 999_989n),
      totalMarketsParticipated: expected.global!.totalMarketsParticipated + 1,
    });

    // V1 participants and daily stats unchanged; the V2 ones are new rows
    for (const p of expected.marketParticipants) {
      expect(got.marketParticipants.find((x) => x.id === p.id)).toEqual(p);
    }
    expect(got.marketParticipants.length).toBe(expected.marketParticipants.length + 1);
    expect(got.marketParticipants.find((x) => x.id === `${AGENT_297_SAFE}_${MINT_CONDITION}`)?.outcomeShares0).toBe("1052620");
    for (const d of expected.dailyProfitStatistics) {
      expect(got.dailyProfitStatistics.find((x) => x.id === d.id)).toEqual(d);
    }
    // V1 token registry rows unchanged
    for (const t of expected.tokenRegistry) {
      expect(got.tokenRegistry.find((x) => x.id === t.id)).toEqual(t);
    }
    // the V2 logs never reached the CTF token derivation
    expect(derivation.calls.length).toBe(24);
  });
});
