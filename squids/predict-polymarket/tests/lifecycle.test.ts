// Full agent lifecycle against the extracted handlers + in-memory cache:
// register (agent id 86) -> multisig -> tokens -> question -> buy -> resolve
// -> re-resolve (no-op) -> redeem, plus condition preparation with a stubbed
// token derivation and the factory-based DepositWallet linking + v2 sell.
// Mirrors the behavioral expectations of the original subgraph's Matchstick
// suite and the Envio port's vitest suite.
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCache } from "./inMemoryCache";
import * as handlers from "../src/handlers";
import { processRedemption, EventMeta } from "../src/logic";
import {
  Bet,
  DailyProfitStatistic,
  DepositWallet,
  Global,
  MarketMetadata,
  MarketParticipant,
  PayoutRedemptionEntity,
  Question,
  QuestionIdToConditionId,
  QuestionResolution,
  TokenRegistry,
  TraderAgent,
  TraderService,
  AgentInstance,
} from "../src/model";

const AGENT_EOA = "0x75bf948904a6e8921e97c0667ad398474b18084b";
const SAFE = "0x1000000000000000000000000000000000000001";
const OTHER_EOA = "0x2000000000000000000000000000000000000002";
const DW = "0xfc44573392de3b50fd48b76890aa4ba4a79934c2";
const TAKER = "0x3000000000000000000000000000000000000003";
const ORACLE = "0x65070be91477460d8a7aeeb94ef92fe056c2f2a7";

const CONDITION_ID = `0x${"ab".repeat(32)}`;
const QUESTION_ID = `0x${"cd".repeat(32)}`;

const TOKEN_NO = 111111n;
const TOKEN_YES = 222222n;

const USDC = (n: number) => BigInt(n) * 1_000_000n;
const utf8ToHex = (s: string) => `0x${Buffer.from(s, "utf8").toString("hex")}`;

// Two distinct UTC days so bet-day and resolution-day stats separate cleanly.
const BET_TS = 1_750_010_000n; //  day 1_749_945_600
const RESOLUTION_TS = 1_750_060_000n; // day 1_750_032_000
const BET_DAY = 1_749_945_600n;
const RESOLUTION_DAY = 1_750_032_000n;

let txCounter = 0;
function meta(blockTimestamp: bigint, logIndex = 0): EventMeta {
  txCounter += 1;
  return {
    blockNumber: 80_000_000n + BigInt(txCounter),
    blockTimestamp,
    transactionHash: `0x${String(txCounter).padStart(64, "0")}`,
    logIndex,
  };
}

let cache: InMemoryCache;
beforeEach(() => {
  cache = new InMemoryCache();
  txCounter = 0;
});

async function registerAgent() {
  await handlers.handleRegisterInstance(cache, meta(1_750_000_000n), {
    agentInstance: AGENT_EOA,
    serviceId: 297n,
    agentId: 86n,
  });
  await handlers.handleCreateMultisigWithAgents(cache, meta(1_750_000_000n), {
    serviceId: 297n,
    multisig: SAFE,
  });
}

async function setupMarket() {
  cache.set(
    QuestionIdToConditionId,
    new QuestionIdToConditionId({
      id: QUESTION_ID,
      conditionId: CONDITION_ID,
      oracle: ORACLE,
      transactionHash: "0x00",
    }),
  );
  await handlers.handleTokenRegistered(cache, meta(1_750_000_100n), {
    token0: TOKEN_NO,
    token1: TOKEN_YES,
    conditionId: CONDITION_ID,
  });
  await handlers.handleQuestionInitialization(cache, meta(1_750_000_100n), {
    questionID: QUESTION_ID,
    ancillaryData: utf8ToHex(
      "q: title: Will BTC hit 100k?, res_data: p1: 0, p2: 1",
    ),
  });
}

describe("registration gating", () => {
  it("creates TraderAgent only for agent id 86 services", async () => {
    await registerAgent();
    // non-86 registration must be ignored entirely
    await handlers.handleRegisterInstance(cache, meta(1_750_000_000n), {
      agentInstance: OTHER_EOA,
      serviceId: 298n,
      agentId: 25n,
    });
    await handlers.handleCreateMultisigWithAgents(cache, meta(1_750_000_000n), {
      serviceId: 298n,
      multisig: OTHER_EOA,
    });

    expect((await cache.get(TraderAgent, SAFE))?.serviceId).toBe(297n);
    expect(await cache.get(TraderAgent, OTHER_EOA)).toBeUndefined();
    expect(await cache.get(TraderService, "298")).toBeUndefined();
    expect((await cache.get(AgentInstance, AGENT_EOA))?.serviceId).toBe(297n);
    expect(await cache.get(AgentInstance, OTHER_EOA)).toBeUndefined();
    expect((await cache.get(Global, ""))?.totalTraderAgents).toBe(1);
  });
});

describe("market setup", () => {
  it("dedupes the swapped TokenRegistered pair", async () => {
    await setupMarket();
    // Polymarket registers the swapped pair too; must be deduped
    await handlers.handleTokenRegistered(cache, meta(1_750_000_100n), {
      token0: TOKEN_NO,
      token1: TOKEN_YES,
      conditionId: CONDITION_ID,
    });
    expect(cache.all(TokenRegistry)).toHaveLength(2);
    expect((await cache.get(TokenRegistry, TOKEN_YES.toString()))?.outcomeIndex).toBe(1n);
  });

  it("parses metadata and creates the Question", async () => {
    await setupMarket();
    const question = await cache.get(Question, CONDITION_ID);
    expect(question?.questionId).toBe(QUESTION_ID);
    expect(question?.isNegRisk).toBe(false);
    const md = await cache.get(MarketMetadata, QUESTION_ID);
    expect(md?.title).toBe("Will BTC hit 100k?");
    expect(md?.outcomes).toEqual(["Yes", "No"]);
  });

  it("derives v2 tokens at ConditionPreparation via the injected derivation", async () => {
    const derive = async (_c: string, _col: string, indexSet: number) =>
      indexSet === 1 ? "555" : "666";
    await handlers.handleConditionPreparation(
      cache,
      meta(1_750_000_100n),
      {
        conditionId: CONDITION_ID,
        oracle: ORACLE,
        questionId: QUESTION_ID,
        outcomeSlotCount: 2n,
      },
      derive,
    );
    expect((await cache.get(TokenRegistry, "555"))?.outcomeIndex).toBe(0n);
    expect((await cache.get(TokenRegistry, "666"))?.outcomeIndex).toBe(1n);

    // repeated questionId must be rejected (bridge guard)
    await handlers.handleConditionPreparation(
      cache,
      meta(1_750_000_101n),
      {
        conditionId: `0x${"ee".repeat(32)}`,
        oracle: ORACLE,
        questionId: QUESTION_ID,
        outcomeSlotCount: 2n,
      },
      derive,
    );
    expect((await cache.get(QuestionIdToConditionId, QUESTION_ID))?.conditionId).toBe(CONDITION_ID);

    // non-binary markets are ignored
    await handlers.handleConditionPreparation(
      cache,
      meta(1_750_000_102n),
      {
        conditionId: `0x${"ff".repeat(32)}`,
        oracle: ORACLE,
        questionId: `0x${"aa".repeat(32)}`,
        outcomeSlotCount: 3n,
      },
      derive,
    );
    expect(await cache.get(QuestionIdToConditionId, `0x${"aa".repeat(32)}`)).toBeUndefined();
  });
});

describe("trade -> resolution -> redemption", () => {
  beforeEach(async () => {
    await registerAgent();
    await setupMarket();
  });

  async function buy(amountUsd: number, shares: number) {
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: SAFE,
      isBuying: true,
      outcomeTokenId: TOKEN_YES,
      makerAmountFilled: USDC(amountUsd),
      takerAmountFilled: USDC(shares),
      builder: null,
      metadata: null,
    });
  }

  it("records a buy with correct math and links", async () => {
    await buy(100, 200);
    // unknown maker must be ignored
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: TAKER,
      isBuying: true,
      outcomeTokenId: TOKEN_YES,
      makerAmountFilled: USDC(1),
      takerAmountFilled: USDC(2),
      builder: null,
      metadata: null,
    });

    const agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalBets).toBe(1);
    expect(agent?.totalTraded).toBe(USDC(100));
    expect(agent?.totalTradedSettled).toBe(0n);
    expect(agent?.firstParticipation).toBe(BET_TS);

    const bets = cache.all(Bet);
    expect(bets).toHaveLength(1);
    expect(bets[0]!.isBuy).toBe(true);
    expect(bets[0]!.amount).toBe(USDC(100));
    expect(bets[0]!.shares).toBe(USDC(200));
    expect(bets[0]!.outcomeIndex).toBe(1n);
    expect(bets[0]!.question?.id).toBe(CONDITION_ID);
    expect(bets[0]!.marketParticipant?.id).toBe(`${SAFE}_${CONDITION_ID}`);

    const participant = await cache.get(
      MarketParticipant,
      `${SAFE}_${CONDITION_ID}`,
    );
    expect(participant?.outcomeShares0).toBe(0n);
    expect(participant?.outcomeShares1).toBe(USDC(200));
    expect(participant?.settled).toBe(false);

    const global = await cache.get(Global, "");
    expect(global?.totalBets).toBe(1);
    expect(global?.totalTraded).toBe(USDC(100));
    expect(global?.totalActiveTraderAgents).toBe(1);
    expect(global?.totalMarketsParticipated).toBe(1);
  });

  it("settles at resolution, idempotently, and tracks redemption", async () => {
    await buy(100, 200);

    // Resolution: YES wins -> profit = 200 - 100 = 100
    const resolve = () =>
      handlers.handleQuestionResolution(cache, meta(RESOLUTION_TS), {
        questionID: QUESTION_ID,
        settledPrice: 10n ** 18n,
        payouts: [0n, 1n],
      });
    await resolve();

    const resolution = await cache.get(QuestionResolution, CONDITION_ID);
    expect(resolution?.winningIndex).toBe(1n);
    expect(resolution?.payouts).toEqual(["0", "1"]);

    const participant = await cache.get(
      MarketParticipant,
      `${SAFE}_${CONDITION_ID}`,
    );
    expect(participant?.settled).toBe(true);
    expect(participant?.expectedPayout).toBe(USDC(200));
    expect(participant?.totalTradedSettled).toBe(USDC(100));

    let agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalTradedSettled).toBe(USDC(100));
    expect(agent?.totalExpectedPayout).toBe(USDC(200));

    expect(cache.all(Bet)[0]!.countedInProfit).toBe(true);
    expect(cache.all(Bet)[0]!.countedInTotal).toBe(true);

    // Global settlement deltas
    const globalAfter = await cache.get(Global, "");
    expect(globalAfter?.totalTradedSettled).toBe(USDC(100));
    expect(globalAfter?.totalExpectedPayout).toBe(USDC(200));

    // Re-resolution must be a no-op (idempotency)
    await resolve();
    agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalExpectedPayout).toBe(USDC(200)); // not 400
    expect((await cache.get(Global, ""))?.totalTradedSettled).toBe(USDC(100));

    // Daily stats: activity on bet day, profit on resolution day
    const betDay = cache
      .all(DailyProfitStatistic)
      .find((s) => s.date === BET_DAY);
    expect(betDay?.totalBets).toBe(1);
    expect(betDay?.totalTraded).toBe(USDC(100));
    expect(betDay?.dailyProfit).toBe(0n);

    const resolutionDay = cache
      .all(DailyProfitStatistic)
      .find((s) => s.date === RESOLUTION_DAY);
    expect(resolutionDay?.dailyProfit).toBe(USDC(100));
    expect(resolutionDay?.dailyTradedSettled).toBe(USDC(100));
    expect(resolutionDay?.profitParticipants).toEqual([CONDITION_ID]);

    // Redemption (collateral adapter path): payout totals only, no profit change
    await processRedemption(
      cache,
      SAFE,
      CONDITION_ID,
      USDC(200),
      meta(RESOLUTION_TS + 200n),
    );
    agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalPayout).toBe(USDC(200));
    expect((await cache.get(Global, ""))?.totalPayout).toBe(USDC(200));
    expect(cache.all(PayoutRedemptionEntity)).toHaveLength(1);
    expect(resolutionDay?.dailyProfit).toBe(USDC(100)); // unchanged by payout
  });

  it("halves share value on an invalid resolution (winningIndex -1)", async () => {
    await buy(100, 200);

    // equal payouts -> invalid market; each share worth 1/2 collateral
    await handlers.handleQuestionResolution(cache, meta(RESOLUTION_TS), {
      questionID: QUESTION_ID,
      settledPrice: 5n * 10n ** 17n, // 0.5 — UMA's "invalid/unresolvable" price
      payouts: [1n, 1n],
    });

    const resolution = await cache.get(QuestionResolution, CONDITION_ID);
    expect(resolution?.winningIndex).toBe(-1n);

    const participant = await cache.get(
      MarketParticipant,
      `${SAFE}_${CONDITION_ID}`,
    );
    expect(participant?.settled).toBe(true);
    expect(participant?.expectedPayout).toBe(USDC(100)); // 200 shares / 2

    const agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalExpectedPayout).toBe(USDC(100));
    // profit = 100 (halved payout) - 100 (traded) = 0
    const resolutionDay = cache
      .all(DailyProfitStatistic)
      .find((s) => s.date === RESOLUTION_DAY);
    expect(resolutionDay?.dailyProfit).toBe(0n);
  });

  it("records a bet on a question-less market with a warning", async () => {
    // token registered but QuestionInitialized never fired for this market
    const LONELY_CONDITION = `0x${"dd".repeat(32)}`;
    await handlers.handleTokenRegistered(cache, meta(1_750_000_100n), {
      token0: 777n,
      token1: 888n,
      conditionId: LONELY_CONDITION,
    });
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: SAFE,
      isBuying: true,
      outcomeTokenId: 888n,
      makerAmountFilled: USDC(10),
      takerAmountFilled: USDC(20),
      builder: null,
      metadata: null,
    });

    // the bet is recorded, unlinked, and warned about — and can never settle
    const bets = cache.all(Bet).filter((b) => b.amount === USDC(10));
    expect(bets).toHaveLength(1);
    expect(bets[0]!.question).toBeNull();
    const participant = await cache.get(
      MarketParticipant,
      `${SAFE}_${LONELY_CONDITION}`,
    );
    expect(participant?.question).toBeNull();
    expect(cache.warnings.some((w) => w.includes("without Question"))).toBe(true);
  });

  it("clamps expectedPayout to zero for a net-negative position", async () => {
    // sell 50 YES shares with no prior buy -> outcomeShares1 = -50
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: SAFE,
      isBuying: false,
      outcomeTokenId: TOKEN_YES,
      makerAmountFilled: USDC(50), // shares given
      takerAmountFilled: USDC(30), // USDC received
      builder: null,
      metadata: null,
    });
    const before = await cache.get(
      MarketParticipant,
      `${SAFE}_${CONDITION_ID}`,
    );
    expect(before?.outcomeShares1).toBe(-USDC(50));

    // YES wins: negative share balance must clamp to 0, never negative
    await handlers.handleQuestionResolution(cache, meta(RESOLUTION_TS), {
      questionID: QUESTION_ID,
      settledPrice: 10n ** 18n,
      payouts: [0n, 1n],
    });

    const participant = await cache.get(
      MarketParticipant,
      `${SAFE}_${CONDITION_ID}`,
    );
    expect(participant?.settled).toBe(true);
    expect(participant?.expectedPayout).toBe(0n);

    const agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalExpectedPayout).toBe(0n);
    // two-tier accounting: the negative traded amount settles as-is
    expect(agent?.totalTradedSettled).toBe(-USDC(30));
    // profit = 0 (payout) - (-30 traded) = +30 kept from the sale
    const resolutionDay = cache
      .all(DailyProfitStatistic)
      .find((s) => s.date === RESOLUTION_DAY);
    expect(resolutionDay?.dailyProfit).toBe(USDC(30));
  });
});

describe("deposit wallet factory linking + v2 orders", () => {
  beforeEach(async () => {
    await registerAgent();
    await setupMarket();
  });

  it("links a DW for a known agent EOA and ignores unknown owners", async () => {
    await handlers.handleWalletDeployed(cache, meta(1_760_000_000n), {
      wallet: DW,
      owner: AGENT_EOA,
    });
    await handlers.handleWalletDeployed(cache, meta(1_760_000_000n), {
      wallet: TAKER,
      owner: OTHER_EOA,
    });

    const dw = await cache.get(DepositWallet, DW);
    expect(dw?.traderAgent.id).toBe(SAFE);
    expect(dw?.agentInstance).toBe(AGENT_EOA);
    expect(await cache.get(DepositWallet, TAKER)).toBeUndefined();
  });

  it("resolves a v2 sell through the DW to the agent (negative amounts)", async () => {
    await handlers.handleWalletDeployed(cache, meta(1_760_000_000n), {
      wallet: DW,
      owner: AGENT_EOA,
    });
    // v2 sell: maker gives 50 shares, receives 30 USDC
    await handlers.handleOrderFill(cache, meta(1_760_000_100n), {
      maker: DW,
      isBuying: false,
      outcomeTokenId: TOKEN_YES,
      makerAmountFilled: USDC(50),
      takerAmountFilled: USDC(30),
      builder: `0x${"00".repeat(32)}`,
      metadata: `0x${"00".repeat(32)}`,
    });

    const agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalBets).toBe(1);
    expect(agent?.totalTraded).toBe(-USDC(30)); // sells are negative

    const bets = cache.all(Bet);
    expect(bets).toHaveLength(1);
    expect(bets[0]!.bettor.id).toBe(SAFE); // resolved through the DW link
    expect(bets[0]!.isBuy).toBe(false);
    expect(bets[0]!.amount).toBe(-USDC(30));
    expect(bets[0]!.shares).toBe(-USDC(50));

    const participant = await cache.get(
      MarketParticipant,
      `${SAFE}_${CONDITION_ID}`,
    );
    expect(participant?.outcomeShares1).toBe(-USDC(50));
  });

  it("warns and drops a trade on an unknown token", async () => {
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: SAFE,
      isBuying: true,
      outcomeTokenId: 999999n,
      makerAmountFilled: USDC(1),
      takerAmountFilled: USDC(2),
      builder: null,
      metadata: null,
    });
    expect(cache.all(Bet)).toHaveLength(0);
    expect(cache.warnings.some((w) => w.includes("TokenRegistry missing"))).toBe(true);
  });
});

describe("multi-participant resolution", () => {
  const SAFE2 = "0x4000000000000000000000000000000000000004";
  const EOA2 = "0x5000000000000000000000000000000000000005";

  it("settles two agents in one resolution: per-agent stats isolated, global = sum", async () => {
    await registerAgent();
    await handlers.handleRegisterInstance(cache, meta(1_750_000_000n), {
      agentInstance: EOA2,
      serviceId: 300n,
      agentId: 86n,
    });
    await handlers.handleCreateMultisigWithAgents(cache, meta(1_750_000_000n), {
      serviceId: 300n,
      multisig: SAFE2,
    });
    await setupMarket();

    // agent1 buys 100 -> 200 YES; agent2 buys 40 -> 50 NO
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: SAFE,
      isBuying: true,
      outcomeTokenId: TOKEN_YES,
      makerAmountFilled: USDC(100),
      takerAmountFilled: USDC(200),
      builder: null,
      metadata: null,
    });
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: SAFE2,
      isBuying: true,
      outcomeTokenId: TOKEN_NO,
      makerAmountFilled: USDC(40),
      takerAmountFilled: USDC(50),
      builder: null,
      metadata: null,
    });

    // YES wins: both participants settle in ONE call
    await handlers.handleQuestionResolution(cache, meta(RESOLUTION_TS), {
      questionID: QUESTION_ID,
      settledPrice: 10n ** 18n,
      payouts: [0n, 1n],
    });

    const p1 = await cache.get(MarketParticipant, `${SAFE}_${CONDITION_ID}`);
    const p2 = await cache.get(MarketParticipant, `${SAFE2}_${CONDITION_ID}`);
    expect(p1?.settled).toBe(true);
    expect(p2?.settled).toBe(true);
    expect(p1?.expectedPayout).toBe(USDC(200)); // won
    expect(p2?.expectedPayout).toBe(0n); // held NO, YES won

    // per-agent daily stats are isolated (ids keyed agent_day)
    const day1 = cache.all(DailyProfitStatistic).find(
      (s) => s.id === `${SAFE}_${RESOLUTION_DAY}`,
    );
    const day2 = cache.all(DailyProfitStatistic).find(
      (s) => s.id === `${SAFE2}_${RESOLUTION_DAY}`,
    );
    expect(day1?.dailyProfit).toBe(USDC(100)); // 200 - 100
    expect(day2?.dailyProfit).toBe(-USDC(40)); // 0 - 40

    // global deltas are the sum over both participants
    const global = await cache.get(Global, "");
    expect(global?.totalTradedSettled).toBe(USDC(140)); // 100 + 40
    expect(global?.totalExpectedPayout).toBe(USDC(200)); // 200 + 0
  });
});

describe("negrisk question path", () => {
  it("prepares metadata, resolves with the inverted index convention", async () => {
    await registerAgent();
    cache.set(
      QuestionIdToConditionId,
      new QuestionIdToConditionId({
        id: QUESTION_ID,
        conditionId: CONDITION_ID,
        oracle: ORACLE,
        transactionHash: "0x00",
      }),
    );
    await handlers.handleTokenRegistered(cache, meta(1_750_000_100n), {
      token0: TOKEN_NO,
      token1: TOKEN_YES,
      conditionId: CONDITION_ID,
    });
    await handlers.handleQuestionPrepared(cache, meta(1_750_000_100n), {
      questionId: QUESTION_ID,
      marketId: `0x${"11".repeat(32)}`,
      data: utf8ToHex("q: NegRisk: will candidate X win?"),
    });

    const question = await cache.get(Question, CONDITION_ID);
    expect(question?.isNegRisk).toBe(true);
    expect(question?.marketId).toBe(`0x${"11".repeat(32)}`);
    const md = await cache.get(MarketMetadata, QUESTION_ID);
    expect(md?.outcomes).toEqual(["Yes", "No"]); // hardcoded for NegRisk

    // agent bets on outcome 0 (token0 = index 0 = "Yes" in NegRisk convention)
    await handlers.handleOrderFill(cache, meta(BET_TS), {
      maker: SAFE,
      isBuying: true,
      outcomeTokenId: TOKEN_NO, // registered as outcomeIndex 0
      makerAmountFilled: USDC(10),
      takerAmountFilled: USDC(30),
      builder: null,
      metadata: null,
    });

    // OutcomeReported(true) = YES = winning index 0 (INVERTED vs UMA layout)
    await handlers.handleOutcomeReported(cache, meta(RESOLUTION_TS), {
      questionId: QUESTION_ID,
      outcome: true,
    });

    const resolution = await cache.get(QuestionResolution, CONDITION_ID);
    expect(resolution?.winningIndex).toBe(0n);
    expect(resolution?.payouts).toEqual(["1", "0"]);

    const participant = await cache.get(
      MarketParticipant,
      `${SAFE}_${CONDITION_ID}`,
    );
    expect(participant?.settled).toBe(true);
    expect(participant?.expectedPayout).toBe(USDC(30)); // index-0 shares won
  });
});
