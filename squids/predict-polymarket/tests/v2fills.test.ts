// Protocol V2 bets: recorded Polygon ExchangeV3 OrderFilled logs
// (tests/fixtures/v2-trades.json) go through src/main.ts's batch handler into
// the existing entities.
// No Olas agent has traded on ExchangeV3 yet, so each test makes one real
// maker the agent's DepositWallet. Expected side and shares come from the
// Data API /v2/trades rows recorded with the logs; expected amounts are the
// pUSD the maker moved in the transaction, so they include the ExchangeV3 fee
// (BUY: makerAmountFilled + fee, SELL: takerAmountFilled - fee).
// Results, payouts and market rules (tests/fixtures/v2-results.json) register
// the recorded Safes as agent Safes.
import { beforeEach, expect, it, vi } from "vitest";
import { getMetadataArgsStorage } from "typeorm";

const derivation = vi.hoisted(() => ({ calls: 0, legacy: new Map<string, string>(), legacyCalls: [] as string[] }));
vi.mock("../src/tokenDerivation", () => ({
  getOutcomeTokenId: vi.fn(async () => {
    derivation.calls += 1;
    return null;
  }),
  // BinaryModule.legacyConditionId: zero unless a test registers a migration
  getLegacyConditionId: vi.fn(async (conditionId: string) => {
    derivation.legacyCalls.push(conditionId);
    return derivation.legacy.get(conditionId) ?? `0x${"00".repeat(32)}`;
  }),
}));

import { FakeStore, loadFixture, RawLog, RecordedBlock, runBatch, snapshot } from "./replay";
import * as handlers from "../src/handlers";
import * as exchangeV3 from "../src/abi/ExchangeV3/events";
import * as binaryModule from "../src/abi/BinaryModule/events";
import * as ooReporter from "../src/abi/PolymarketOOReporter/events";
import { Bet, DailyProfitStatistic, Global, MarketMetadata, MarketParticipant, PayoutRedemptionEntity, Question, QuestionResolution, TraderAgent } from "../src/model";

const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const EXCHANGE_V3 = "0xe3333700ca9d93003f00f0f71f8515005f6c00aa";
const AGENT_EOA = "0x75bf948904a6e8921e97c0667ad398474b18084b";
const SAFE = "0x1000000000000000000000000000000000000001";

type Trade = {
  block: RecordedBlock;
  dataApiTrades: { proxy_wallet: string; side: "BUY" | "SELL"; condition_id: string; size: number; price: number; outcome_index: number }[];
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
// both makers sell (shares merged into pUSD): log 95 maker 0x8d3f… without a
// fee, log 105 maker 0xb1c3… paying fee 62,500
const SELL_TX = "0xd79d328d9a2f8eea15b3637113a76eb971f09ec3b8c8c341a31a4c3fd401a738";

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
  derivation.calls = 0;
  derivation.legacy.clear();
  derivation.legacyCalls = [];
});

/** Agent 86 service with `safe` as multisig and, if given, `depositWallet` deployed for its instance. */
async function registerAgent(depositWallet?: string, safe = SAFE) {
  const meta = (logIndex: number) => ({ blockNumber: 1n, blockTimestamp: 1n, transactionHash: "0x01", logIndex });
  await handlers.handleRegisterInstance(store, meta(0), { agentInstance: AGENT_EOA, serviceId: 297n, agentId: 86n });
  await handlers.handleCreateMultisigWithAgents(store, meta(1), { serviceId: 297n, multisig: safe });
  if (depositWallet != null) await handlers.handleWalletDeployed(store, meta(2), { wallet: depositWallet, owner: AGENT_EOA });
}

const ZERO32 = `0x${"00".repeat(32)}`;
const orderFilled = (maker: string, side: number, tokenId: bigint, makerAmountFilled: bigint, takerAmountFilled: bigint, fee = 0n) =>
  exchangeV3.OrderFilled.encode({
    orderHash: `0x${"0d".repeat(32)}`,
    maker,
    taker: EXCHANGE_V3,
    side,
    tokenId,
    makerAmountFilled,
    takerAmountFilled,
    fee,
    builder: ZERO32,
    metadata: ZERO32,
  });

/** Every stored row, JSON-safe. */
const dump = () => JSON.stringify([...store.store].map(([name, rows]) => [name, [...rows]]), (_, v) => (typeof v === "bigint" ? `${v}` : v));

async function replay(tx: string) {
  await runBatch(store, [trades[tx]!]);
}

let n = 0;
async function runSynthetic(address: string, rec: { topics: string[]; data: string }) {
  n += 1;
  const block = { number: 96_000_000 + n, timestamp: 1_792_600_000 };
  await runBatch(store, [{ block, logs: [{ address, ...rec, transactionHash: `0x${n.toString(16).padStart(64, "0")}`, logIndex: 0 }] }]);
}

// amount: the pUSD the maker moved in the tx, negative when it received it.
// MINT_TX: its Transfer to ExchangeV3 (logs 371, 372); log 383 pays
// makerAmountFilled 999,989 + fee 22,480, log 373 has no fee.
// SELL_TX: ExchangeV3's Transfer to it (log 102), takerAmountFilled
// 2,500,000 - fee 62,500.
it.each([
  [DW, 383, 1_022_469n, MINT_TX],
  ["0x23a5e5e9090d78ecc97e6555f7f11b0f9e2311c1", 373, 52_631n, MINT_TX],
  ["0xb1c383134661be8edcf8f2162abbfbb815f43f98", 105, -2_437_500n, SELL_TX],
])("records the fill by DepositWallet %s (log %i) as one pUSD bet of the agent", async (maker, logIndex, amount, tx) => {
  const api = trades[tx]!.dataApiTrades.find((r) => r.proxy_wallet === maker)!;
  // a market known under the padded condition ID Gamma and the Data API use
  store.set(Question, new Question({ id: api.condition_id }));
  await registerAgent(maker);
  await replay(tx);

  // sells record negative amounts and shares
  const isBuy = api.side === "BUY";
  const shares = BigInt(Math.round(api.size * 1e6)) * (isBuy ? 1n : -1n);
  const fill = trades[tx]!.logs.find((l) => l.logIndex === logIndex)!;

  const bets = store.all(Bet);
  expect(bets.map((b) => b.id)).toEqual([`${tx}_${logIndex}`]);
  const bet = bets[0]!;
  expect(bet.bettor.id).toBe(SAFE);
  expect(bet.collateral).toBe(PUSD);
  expect([bet.amount, bet.shares, bet.isBuy]).toEqual([amount, shares, isBuy]);
  expect(bet.outcomeIndex).toBe(BigInt(api.outcome_index));
  expect(bet.builder).toBe(`0x${fill.data.slice(2 + 64 * 5, 2 + 64 * 6)}`);
  expect(bet.metadata).toBe(`0x${fill.data.slice(2 + 64 * 6, 2 + 64 * 7)}`);
  expect(bet.blockTimestamp).toBe(BigInt(trades[tx]!.block.timestamp));
  // keyed by the padded condition ID
  const participant = await store.get(MarketParticipant, `${SAFE}_${api.condition_id}`);
  expect([bet.marketParticipant?.id, bet.question?.id, participant?.question?.id]).toEqual([participant?.id, api.condition_id, api.condition_id]);
  expect([participant?.outcomeShares0, participant?.outcomeShares1]).toEqual(api.outcome_index ? [0n, shares] : [shares, 0n]);
  expect(participant?.totalTraded).toBe(amount);
  expect(store.all(DailyProfitStatistic).map((d) => d.totalTraded)).toEqual([amount]);
  expect((await store.get(TraderAgent, SAFE))?.totalTraded).toBe(amount);
  expect((await store.get(Global, ""))?.totalTraded).toBe(amount);
  // V2 position IDs are decoded, never derived from USDC.e
  expect(derivation.calls).toBe(0);
});

it("persists Bet.collateral", () => {
  const columns = getMetadataArgsStorage().columns.filter((c) => c.target === Bet);
  expect(columns.map((c) => c.propertyName)).toContain("collateral");
});

// a CombinatorialModule (module 3) position: its last byte is 0x00, but the
// Data API reports outcome_index 999, so it is not a binary outcome
it("records no bet for a fill on a combinatorial position", async () => {
  await registerAgent("0x13a5c2b4f8696de4db9748581ccc4ca856cf67a6");
  await replay("0x859bffc95b57d30762bb729d8747e33eb62ff56fbc2e6083e8aabc7807cc8064");
  expect(store.all(Bet)).toEqual([]);
  expect(store.all(MarketParticipant)).toEqual([]);
});

it("attributes a DepositWallet buy and a Safe sell of the position to the same agent", async () => {
  await registerAgent(DW);
  await replay(MINT_TX);

  // the Safe sells what the DepositWallet bought: same agent, position closed
  await runSynthetic(EXCHANGE_V3, orderFilled(SAFE, 1, YES, 1_052_620n, 900_000n, 4_000n));
  const participants = store.all(MarketParticipant);
  expect(participants.map((p) => [p.id, p.totalBets, p.outcomeShares0])).toEqual([[`${SAFE}_${CONDITION}`, 2, 0n]]);
  // BUY paid 999,989 + fee 22,480; SELL receives 900,000 - fee 4,000
  expect((await store.get(TraderAgent, SAFE))?.totalTraded).toBe(1_022_469n - 896_000n);
});

// Handlers called directly log to the store's `warnings`.
const meta = (logIndex: number) => ({ blockNumber: 96_100_000n, blockTimestamp: 1_792_700_000n, transactionHash: `0x${logIndex.toString(16).padStart(64, "0")}`, logIndex });
const v2Fill = (outcomeTokenId: bigint) => ({
  maker: DW,
  isBuying: true,
  outcomeTokenId,
  makerAmountFilled: 500_000n,
  takerAmountFilled: 1_000_000n,
  fee: 0n,
  builder: null,
  metadata: null,
});

it("warns once per skipped position, not on every fill", async () => {
  await registerAgent(DW);
  // module 3 (combinatorial) and module 2 (NegRisk) positions on made-up conditions
  const combinatorial = (3n << 248n) | (0xabn << 8n);
  const negRisk = (2n << 248n) | (0xcdn << 8n);
  for (const [i, position] of [combinatorial, combinatorial, negRisk].entries()) {
    await handlers.handlePositionFill(store, meta(i), v2Fill(position));
  }
  expect(store.all(Bet)).toEqual([]);
  expect(store.warnings).toHaveLength(2);
  expect(store.warnings[0]).toContain(combinatorial.toString());
  expect(store.warnings[1]).toContain(negRisk.toString());
});

// A V2 fill creates its market's Question, so it has none missing to warn
// about (the V1 warning is pinned in lifecycle.test.ts)
it("does not warn about a missing Question for a V2 fill", async () => {
  await registerAgent(DW);
  await handlers.handlePositionFill(store, meta(0), v2Fill(YES));
  expect((await store.get(MarketParticipant, `${SAFE}_${CONDITION}`))?.question?.id).toBe(CONDITION);
  expect(store.warnings).toEqual([]);
});

// Recorded results and claims. A claim through the Router redeems each
// position on BinaryModule, whose PositionRedeemed carries the position
// amount and the pUSD payout sent to the recipient: what an agent was paid
// is the pUSD its Safe received.
type Tx = { block: RecordedBlock; logs: RawLog[] };
const results = loadFixture<{ txs: Record<string, Tx> }>("v2-results.json").txs;
const tx = (hash: string) => results[hash]!;
const BINARY_MODULE = "0x1000008dd9001b968442c1000017eae6e0da00ba";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const day = (ts: number) => BigInt(Math.floor(ts / 86_400) * 86_400);
const redemptions = (claim: Tx) => claim.logs.filter((l) => l.address === BINARY_MODULE);
/** Position ID a recorded claim redeems. */
const claimed = (claim: Tx, i: number) => BigInt(redemptions(claim)[i]!.topics[2]!);

/** Block just before `next` in which `maker` buys, per [tokenId, pUSD, shares], with no fee. */
const buysBefore = (next: Tx, maker: string, buys: [bigint, bigint, bigint][]): Tx => ({
  block: { number: next.block.number - 1, timestamp: next.block.timestamp - 2 },
  logs: buys.map(([tokenId, amount, shares], logIndex) => ({
    address: EXCHANGE_V3,
    ...orderFilled(maker, 0, tokenId, amount, shares),
    transactionHash: `0x${"b0".repeat(32)}`,
    logIndex,
  })),
});

// Safe 0x378a… buys YES (999,995 + fee 45,480 pUSD -> 1,123,590 shares) and
// NO (1,000,000 + fee 69,000 pUSD -> 2,380,953 shares); YES wins. Its claim
// redeems YES (amount 1,123,500, payout 1,123,500) and NO (amount 2,380,900,
// payout 0).
const FILL_A_NO = tx("0x31cb13348ec764de34638f6e0a01ac738e672a60ad1dc814cc205862e5ae7953");
const YES_WON = {
  name: "YES won",
  safe: "0x378a84d576bc58df81a25638b051c729edf7f885",
  condition: "0x0186303a83d786acc59edacaf8ef4d1627000000000000000000000000000000",
  fills: [tx("0x182fb28016d26e7c83167889243af637ca1e55f47ea85738e924a0cc3e438f4e"), FILL_A_NO],
  resolution: tx("0xca275673baf3d2cc719f900352d3304bacc5f93d8f070eb3e53c26320147a6e8"),
  claim: tx("0x40ba1923613b4f9ce05851766d2016243319eb896a0bec8efe8f06b734b325be"),
  winningIndex: 0n,
  payouts: ["1000000", "0"],
  settledPrice: 10n ** 18n,
  expectedPayout: 1_123_590n,
  profit: 1_123_590n - 1_045_475n - 1_069_000n,
  paid: 1_123_500n,
};
// A 50/50 result: Safe 0xf83e…'s claim of 6,817 NO pays 3,408. Its buy is
// not recorded, so a fill of the claimed shares stands in for it.
const RESOLVE_D = tx("0x8bebc3292081d45d54ed5f6ad2c54392c3331e69fa5b2d3a06733f4d4f861bf1");
const CLAIM_D = tx("0xbb0a8149731da86f04cf9e7657d02cb189ded8e5b8fbbc574da866baddc150e3");
const SAFE_D = "0xf83ec0e37ac9eece71c064507270e9001a734663";
const SPLIT = {
  name: "50/50",
  safe: SAFE_D,
  condition: "0x0132205266f4b9be03be9b8826a65ab910000000000000000000000000000000",
  fills: [buysBefore(RESOLVE_D, SAFE_D, [[claimed(CLAIM_D, 0), 3_500n, 6_817n]])],
  resolution: RESOLVE_D,
  claim: CLAIM_D,
  winningIndex: -1n,
  payouts: ["500000", "500000"],
  settledPrice: 5n * 10n ** 17n,
  expectedPayout: 3_408n,
  profit: 3_408n - 3_500n,
  paid: 3_408n,
};

it.each([YES_WON, SPLIT])("BinaryModule ConditionResolved ($name) resolves the agent's V2 market and settles its bets", async (c) => {
  await registerAgent(undefined, c.safe);
  await runBatch(store, [...c.fills, c.resolution]);
  const resolution = await store.get(QuestionResolution, c.condition);
  expect([resolution?.question.id, resolution?.winningIndex, resolution?.payouts, resolution?.settledPrice]).toEqual([c.condition, c.winningIndex, c.payouts, c.settledPrice]);
  expect(resolution?.question.isNegRisk).toBe(false);
  const participant = await store.get(MarketParticipant, `${c.safe}_${c.condition}`);
  expect([participant?.question?.id, participant?.settled, participant?.expectedPayout]).toEqual([c.condition, true, c.expectedPayout]);
  expect((await store.get(DailyProfitStatistic, `${c.safe}_${day(c.resolution.block.timestamp)}`))?.dailyProfit).toBe(c.profit);
  const bets = store.all(Bet);
  expect(bets).toHaveLength(c.fills.flatMap((f) => f.logs).length);
  for (const b of bets) expect([b.question?.id, b.countedInProfit], b.id).toEqual([c.condition, true]);
});

it("settles a partial V2 result by its payout vector, not as a V1 invalid answer", async () => {
  // YES pays 0.7 and NO 0.3 per share: 1,000,000 YES + 500,000 NO shares are
  // worth 850,000 pUSD (the V1 invalid-answer rule of 1/2 per share would give 750,000)
  await registerAgent(undefined, SAFE);
  const resolved: Tx = {
    block: { number: 96_000_100, timestamp: 1_792_700_000 },
    logs: [{ address: BINARY_MODULE, ...binaryModule.ConditionResolved.encode({ conditionId: CONDITION.slice(0, 64), result: [700_000n, 300_000n] }), transactionHash: `0x${"c0".repeat(32)}`, logIndex: 0 }],
  };
  await runBatch(store, [buysBefore(resolved, SAFE, [[YES, 600_000n, 1_000_000n], [YES + 1n, 200_000n, 500_000n]]), resolved]);

  const resolution = await store.get(QuestionResolution, CONDITION);
  expect([resolution?.winningIndex, resolution?.payouts, resolution?.settledPrice]).toEqual([-1n, ["700000", "300000"], 7n * 10n ** 17n]);
  const participant = await store.get(MarketParticipant, `${SAFE}_${CONDITION}`);
  expect([participant?.settled, participant?.expectedPayout]).toEqual([true, 850_000n]);
  expect((await store.get(TraderAgent, SAFE))?.totalExpectedPayout).toBe(850_000n);
  expect((await store.get(DailyProfitStatistic, `${SAFE}_${day(resolved.block.timestamp)}`))?.dailyProfit).toBe(850_000n - 800_000n);
});

it.each([YES_WON, SPLIT])("credits the payout of each BinaryModule redemption through the Router ($name) to the agent whose Safe is the recipient", async (c) => {
  await registerAgent(undefined, c.safe);
  await runBatch(store, c.fills);
  const credited = async () => [store.all(PayoutRedemptionEntity), (await store.get(TraderAgent, c.safe))?.totalPayout];
  // before the market's result is recorded, the claim credits nothing and raises no error
  await runBatch(store, [c.claim]);
  expect(await credited()).toEqual([[], 0n]);
  await runBatch(store, [c.resolution]);
  // the same redemptions initiated by the Safe instead of the Router credit nothing
  const toSafe = `0x${c.safe.slice(2).padStart(64, "0")}`;
  const direct = redemptions(c.claim).map((l) => ({ ...l, topics: [l.topics[0]!, toSafe, ...l.topics.slice(2)], transactionHash: `0x${"d0".repeat(32)}` }));
  await runBatch(store, [{ block: c.claim.block, logs: direct }]);
  expect(await credited()).toEqual([[], 0n]);
  await runBatch(store, [c.claim]);

  const paid = c.claim.logs
    .filter((l) => l.address === PUSD && l.topics[0] === TRANSFER && l.topics[2] === toSafe)
    .reduce((sum, l) => sum + BigInt(l.data), 0n);
  expect(paid).toBe(c.paid);
  const audit = store.all(PayoutRedemptionEntity).filter((r) => r.redeemer.id === c.safe && r.conditionId === c.condition);
  expect([
    (await store.get(MarketParticipant, `${c.safe}_${c.condition}`))?.totalPayout,
    (await store.get(TraderAgent, c.safe))?.totalPayout,
    (await store.get(Global, ""))?.totalPayout,
    (await store.get(DailyProfitStatistic, `${c.safe}_${day(c.claim.block.timestamp)}`))?.totalPayout,
    audit.reduce((sum, r) => sum + r.payoutAmount, 0n),
  ]).toEqual([paid, paid, paid, paid, paid]);
});

it("shows a resolved V2 bet with no payout as lost: zero payout, no error", async () => {
  // the Safe bought NO only (1,000,000 + fee 69,000 pUSD) and YES won
  const c = YES_WON;
  await registerAgent(undefined, c.safe);
  await runBatch(store, [FILL_A_NO, c.resolution]);

  const participant = await store.get(MarketParticipant, `${c.safe}_${c.condition}`);
  expect([participant?.settled, participant?.expectedPayout, participant?.totalPayout]).toEqual([true, 0n, 0n]);
  // ROI from the agent totals: (payout - settled) / settled = -100%
  const agent = await store.get(TraderAgent, c.safe);
  expect([agent?.totalPayout, agent?.totalTradedSettled]).toEqual([0n, 1_069_000n]);
  const daily = await store.get(DailyProfitStatistic, `${c.safe}_${day(c.resolution.block.timestamp)}`);
  expect(daily?.dailyProfit).toBe(-1_069_000n);
});

it("creates nothing for a redemption whose recipient is not a known agent Safe", async () => {
  // SAFE is the agent and holds YES of the resolved market; the claim's
  // recipient 0x378a… is not an agent Safe
  const c = YES_WON;
  await registerAgent(undefined, SAFE);
  await runBatch(store, [buysBefore(c.resolution, SAFE, [[claimed(c.claim, 0), 500_000n, 1_000_000n]]), c.resolution]);
  expect((await store.get(MarketParticipant, `${SAFE}_${c.condition}`))?.settled).toBe(true);
  const before = dump();

  await runBatch(store, [c.claim]);
  expect(dump()).toBe(before);
});

// Market titles. A UMA market registers its rules (JSON with title and
// res_data) with the PolymarketOOReporter at creation, under its padded
// condition ID; outcome 0 is the res_data label for value 1, outcome 1 the
// label for value 0. A migrated V1 market keeps the metadata of its legacy
// CTF condition. A Chainlink Up or Down market has no text on chain.
const RULES_OLD = tx("0xb12ff9d222931e970b33d8c824ff2665ba82acc541a1cc2f9a7b412ecb7383b2"); // "p1 corresponds to No, p2 to Yes"
const RULES_TEAM = tx("0x95b21b0698954ec226446b6c1d9e47cf6f4f71fde070883070295771432fa083"); // [[0,"Besiktas"],[1,"Bahcesehir Koleji"],[0.5,"cancel"]]
const registered = (rules: Tx) => rules.logs[0]!.topics[1]!;
// the team market's registration under a NegRisk (module 2) request ID
const NEG_RISK_ID = `0x02${registered(RULES_TEAM).slice(4)}`;
const NEG_RISK_RULES: Tx = { ...RULES_TEAM, logs: [{ ...RULES_TEAM.logs[0]!, topics: RULES_TEAM.logs[0]!.topics.map((t, i) => (i === 1 ? NEG_RISK_ID : t)), logIndex: 0 }] };
// migrated market 0x01322052… (legacyConditionId, read on chain) and the V1
// rows the V1 handlers stored for its CTF condition (tx 0x0f47392c…)
const LEGACY_D = "0x9e6b5479d70ad446f90e2e7232ab00f732205266f4b9be03be9b8826a65ab910";
const V1_QUESTION_D = "0xa8758291359dc3a36947afb9776f00af8eef07e6feaa5399bfe3b652255ecdd4";
const V1_METADATA_D = { id: V1_QUESTION_D, title: "Hercog vs. Vandromme: Match O/U 21.5", outcomes: ["Under", "Over"], rawAncillaryData: "" };

it.each([
  { name: "old rules schema", rules: [RULES_OLD], condition: registered(RULES_OLD), title: "Will it rain in Central Park on Tuesday September 15th 2026", outcomes: ["Yes", "No"], calls: 0 },
  { name: "new rules schema, team labels", rules: [RULES_TEAM], condition: registered(RULES_TEAM), title: "Bahcesehir Koleji vs. Besiktas", outcomes: ["Bahcesehir Koleji", "Besiktas"], calls: 0 },
  { name: "migrated V1 market", rules: [], condition: SPLIT.condition, title: V1_METADATA_D.title, outcomes: V1_METADATA_D.outcomes, calls: 1 },
  { name: "Chainlink Up or Down market", rules: [], condition: "0x0116e3aba99821c598c616cffdce40806b000000000000000000000000000000", title: "", outcomes: [], calls: 1 },
])("titles the agent's V2 market from its first fill ($name)", async (c) => {
  await registerAgent(undefined, SAFE);
  const metadata = new MarketMetadata(V1_METADATA_D);
  store.set(MarketMetadata, metadata);
  store.set(Question, new Question({ id: LEGACY_D, questionId: V1_QUESTION_D, metadata, isNegRisk: false, marketId: null, blockNumber: 90_243_386n, blockTimestamp: 1_784_070_074n, transactionHash: "0x0f47392c300bc1745cf5fddaa1937ba82ee72154d60d00c63a376c1eb7a95eea" }));
  derivation.legacy.set(SPLIT.condition.slice(0, 64), LEGACY_D);

  await runBatch(store, [...c.rules, NEG_RISK_RULES]);
  for (const _ of [1, 2]) await runSynthetic(EXCHANGE_V3, orderFilled(SAFE, 0, BigInt(c.condition), 500_000n, 1_000_000n));

  const question = await store.get(Question, c.condition);
  const v2Metadata = question && (await store.get(MarketMetadata, question.metadata.id));
  expect([question?.isNegRisk, v2Metadata?.title, v2Metadata?.outcomes]).toEqual([false, c.title, c.outcomes]);
  // one legacyConditionId call per market without registered rules, none otherwise
  expect(derivation.legacyCalls).toEqual(Array(c.calls).fill(c.condition.slice(0, 64)));
  // the NegRisk registration leaves nothing behind
  expect(dump()).not.toContain(NEG_RISK_ID.slice(2));
});

it("leaves a V2 market untitled when its registered rules are not JSON", async () => {
  await registerAgent(undefined, SAFE);
  const log = RULES_TEAM.logs[0]!;
  const rules = { ...ooReporter.RequestRegistered.decode(log), requestRules: `0x${Buffer.from("title: Bahcesehir Koleji vs. Besiktas").toString("hex")}` };
  await runBatch(store, [{ ...RULES_TEAM, logs: [{ ...log, ...ooReporter.RequestRegistered.encode(rules) }] }]);
  await runSynthetic(EXCHANGE_V3, orderFilled(SAFE, 0, BigInt(registered(RULES_TEAM)), 500_000n, 1_000_000n));

  const question = await store.get(Question, registered(RULES_TEAM));
  const metadata = question && (await store.get(MarketMetadata, question.metadata.id));
  expect([question?.id, metadata?.title, metadata?.outcomes]).toEqual([registered(RULES_TEAM), "", []]);
});
