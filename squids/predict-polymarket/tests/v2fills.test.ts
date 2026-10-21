// Protocol V2 bets: a recorded Polygon trade (ExchangeV3 OrderFilled +
// PositionManager TransferSingle, tests/fixtures/v2-trades.json) goes through
// src/main.ts's batch handler into the existing entities.
// No Olas agent has traded on ExchangeV3 yet, so each test makes one real
// maker the agent's DepositWallet. Expected amounts come from the Data API
// /v2/trades rows recorded with the logs.
import { beforeEach, expect, it, vi } from "vitest";
import { getMetadataArgsStorage } from "typeorm";

const derivation = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../src/tokenDerivation", () => ({
  getOutcomeTokenId: vi.fn(async () => {
    derivation.calls += 1;
    return null;
  }),
}));

import { FakeStore, loadFixture, RawLog, RecordedBlock, runBatch, snapshot } from "./replay";
import * as handlers from "../src/handlers";
import * as exchangeV3 from "../src/abi/ExchangeV3/events";
import * as positionManager from "../src/abi/PositionManager/events";
import { Bet, Global, MarketParticipant, Question, TraderAgent } from "../src/model";

const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const EXCHANGE_V3 = "0xe3333700ca9d93003f00f0f71f8515005f6c00aa";
const POSITION_MANAGER = "0x006f54f7f9a22e0000cc2ab60031000000ae9fef";
const AGENT_EOA = "0x75bf948904a6e8921e97c0667ad398474b18084b";
const SAFE = "0x1000000000000000000000000000000000000001";

type Trade = {
  block: RecordedBlock;
  dataApiTrades: { proxy_wallet: string; condition_id: string; size: number; price: number; outcome_index: number }[];
  logs: RawLog[];
};
const { trades } = loadFixture<{ trades: Record<string, Trade> }>("v2-trades.json");
// complementary BUYs: log 373 maker 0x23a5… (No), log 383 maker 0xfc26… (Yes),
// where 0xfc26… is also log 373's taker
const MINT_TX = "0xe0abd59682255da75d2b12783e64c1fae4f24dca7544f61dfbb9e8c227e411c4";
const DW = "0xfc26c4758c104d62a6a54a7e36dfd0ee64c0bc5b";
// Gamma market 5929025: Yes position ID (No = Yes + 1) and padded condition ID
const YES = 863358210533918701740174954868484610826072786730813595626095950865979408384n;
const CONDITION = "0x01e8a4b7d8fb97379337bb29380b28df56000000000000000000000000000000";

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
  derivation.calls = 0;
});

/** Agent 86 service with SAFE as multisig and `depositWallet` deployed for its instance. */
async function registerAgent(depositWallet: string) {
  const meta = (logIndex: number) => ({ blockNumber: 1n, blockTimestamp: 1n, transactionHash: "0x01", logIndex });
  await handlers.handleRegisterInstance(store, meta(0), { agentInstance: AGENT_EOA, serviceId: 297n, agentId: 86n });
  await handlers.handleCreateMultisigWithAgents(store, meta(1), { serviceId: 297n, multisig: SAFE });
  await handlers.handleWalletDeployed(store, meta(2), { wallet: depositWallet, owner: AGENT_EOA });
}

async function replay(tx: string) {
  await runBatch(store, [trades[tx]!]);
}

let n = 0;
async function runSynthetic(address: string, rec: { topics: string[]; data: string }) {
  n += 1;
  const block = { number: 96_000_000 + n, timestamp: 1_792_600_000 };
  await runBatch(store, [{ block, logs: [{ address, ...rec, transactionHash: `0x${n.toString(16).padStart(64, "0")}`, logIndex: 0 }] }]);
}

it.each([
  [DW, 383],
  ["0x23a5e5e9090d78ecc97e6555f7f11b0f9e2311c1", 373],
])("records the fill by DepositWallet %s (log %i) as one pUSD bet of the agent", async (maker, logIndex) => {
  const tx = MINT_TX;
  const api = trades[tx]!.dataApiTrades.find((r) => r.proxy_wallet === maker)!;
  // a market known under the padded condition ID Gamma and the Data API use
  store.set(Question, new Question({ id: api.condition_id }));
  await registerAgent(maker);
  await replay(tx);

  const amount = BigInt(Math.round(api.size * api.price * 1e6)); // pUSD, 6 decimals
  const shares = BigInt(Math.round(api.size * 1e6));
  const fill = trades[tx]!.logs.find((l) => l.logIndex === logIndex)!;

  const bets = store.all(Bet);
  expect(bets.map((b) => b.id)).toEqual([`${tx}_${logIndex}`]);
  const bet = bets[0]!;
  expect(bet.bettor.id).toBe(SAFE);
  expect(bet.collateral).toBe(PUSD);
  expect([bet.amount, bet.shares, bet.isBuy]).toEqual([amount, shares, true]);
  expect(bet.outcomeIndex).toBe(BigInt(api.outcome_index));
  expect(bet.builder).toBe(`0x${fill.data.slice(2 + 64 * 5, 2 + 64 * 6)}`);
  expect(bet.metadata).toBe(`0x${fill.data.slice(2 + 64 * 6, 2 + 64 * 7)}`);
  expect(bet.blockTimestamp).toBe(BigInt(trades[tx]!.block.timestamp));
  // keyed by the padded condition ID; the PositionManager share legs in the
  // same tx do not count a second time
  const participant = await store.get(MarketParticipant, `${SAFE}_${api.condition_id}`);
  expect([bet.marketParticipant?.id, bet.question?.id, participant?.question?.id]).toEqual([participant?.id, api.condition_id, api.condition_id]);
  expect([participant?.outcomeShares0, participant?.outcomeShares1]).toEqual(api.outcome_index ? [0n, shares] : [shares, 0n]);
  expect((await store.get(TraderAgent, SAFE))?.totalTraded).toBe(amount);
  expect((await store.get(Global, ""))?.totalTraded).toBe(amount);
  // V2 position IDs are decoded, never derived from USDC.e
  expect(derivation.calls).toBe(0);
});

it("persists Bet.collateral", () => {
  const columns = getMetadataArgsStorage().columns.filter((c) => c.target === Bet);
  expect(columns.map((c) => c.propertyName)).toContain("collateral");
});

it("keeps the position on the agent when it moves from the DepositWallet to the Safe", async () => {
  await registerAgent(DW);
  await replay(MINT_TX);
  const before = snapshot(store);

  const move = { operator: DW, from: DW, to: SAFE };
  await runSynthetic(POSITION_MANAGER, positionManager.TransferSingle.encode({ ...move, id: YES, amount: 1_052_620n }));
  await runSynthetic(POSITION_MANAGER, positionManager.TransferBatch.encode({ ...move, ids: [YES, YES + 1n], amounts: [1n, 1n] }));
  expect(snapshot(store)).toEqual(before);

  // the Safe sells what the DepositWallet bought: same agent, position closed
  await runSynthetic(
    EXCHANGE_V3,
    exchangeV3.OrderFilled.encode({
      orderHash: `0x${"0d".repeat(32)}`,
      maker: SAFE,
      taker: EXCHANGE_V3,
      side: 1,
      tokenId: YES,
      makerAmountFilled: 1_052_620n,
      takerAmountFilled: 900_000n,
      fee: 0n,
      builder: `0x${"00".repeat(32)}`,
      metadata: `0x${"00".repeat(32)}`,
    }),
  );
  const participants = store.all(MarketParticipant);
  expect(participants.map((p) => [p.id, p.totalBets, p.outcomeShares0])).toEqual([[`${SAFE}_${CONDITION}`, 2, 0n]]);
  expect((await store.get(TraderAgent, SAFE))?.totalTraded).toBe(999_989n - 900_000n);
});
