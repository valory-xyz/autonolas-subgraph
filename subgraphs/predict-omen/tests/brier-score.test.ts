import { assert, describe, test, clearStore, beforeEach } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { handleBuy, handleSell } from "../src/FixedProductMarketMakerMapping";
import { handleLogNewAnswer } from "../src/realitio";
import { createBuyEvent, createNewAnswerEvent, createSellEvent } from "./profit";
import { Bet, ConditionPreparation, DailyProfitStatistic, FixedProductMarketMakerCreation, Question, TraderAgent } from "../generated/schema";

const AGENT = Address.fromString("0x1234567890123456789012345678901234567890");
const MARKET = Address.fromString("0x0000000000000000000000000000000000000010");
const ANSWER_0_HEX = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");
const ANSWER_1_HEX = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001");
const INVALID_HEX = Bytes.fromHexString("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
const DUMMY_HASH = Bytes.fromHexString("0x1234567890123456789012345678901234567890123456789012345678901234");
const START_TS = BigInt.fromI32(1710000000);
const NORMALIZED_TS = BigInt.fromI32(1709942400);

const ONE_E18 = BigInt.fromString("1000000000000000000");

function setupAgent(): void {
  let agent = new TraderAgent(AGENT);
  agent.totalBets = 0;
  agent.serviceId = BigInt.fromI32(1);
  agent.totalTraded = BigInt.zero();
  agent.totalPayout = BigInt.zero();
  agent.totalExpectedPayout = BigInt.zero();
  agent.totalFees = BigInt.zero();
  agent.totalTradedSettled = BigInt.zero();
  agent.totalFeesSettled = BigInt.zero();
  agent.blockNumber = BigInt.fromI32(1000);
  agent.blockTimestamp = START_TS;
  agent.transactionHash = DUMMY_HASH;
  agent.save();
}

function setupMarket(marketAddr: Address, questionId: string): void {
  let question = new Question(questionId);
  question.question = "Will it rain?";
  question.fixedProductMarketMaker = marketAddr;
  question.save();

  let condition = new ConditionPreparation(questionId);
  condition.questionId = Bytes.fromHexString(questionId);
  condition.conditionId = Bytes.fromHexString(questionId);
  condition.oracle = Address.zero();
  condition.outcomeSlotCount = BigInt.fromI32(2);
  condition.blockNumber = BigInt.fromI32(1000);
  condition.blockTimestamp = START_TS;
  condition.transactionHash = DUMMY_HASH;
  condition.save();

  let fpmm = new FixedProductMarketMakerCreation(marketAddr);
  fpmm.creator = Address.fromString("0x89c5cc945dd550bcffb72fe42bff002429f46fec");
  fpmm.conditionIds = [Bytes.fromHexString(questionId)];
  fpmm.fee = BigInt.zero();
  fpmm.conditionalTokens = Address.zero();
  fpmm.collateralToken = Address.zero();
  fpmm.blockNumber = BigInt.fromI32(1000);
  fpmm.blockTimestamp = START_TS;
  fpmm.transactionHash = DUMMY_HASH;
  fpmm.save();
}

function dailyStatId(timestamp: BigInt): string {
  return AGENT.toHexString() + "_" + timestamp.toString();
}

describe("Brier Score", () => {
  beforeEach(() => {
    clearStore();
    setupAgent();
  });

  test("Buy records impliedProbability = investment / tokens (1e18-scaled)", () => {
    setupMarket(MARKET, "0x0000000000000000000000000000000000000000000000000000000000000001");
    // Investment 0.4, tokens 1.0 → implied probability 0.4 (4e17)
    let event = createBuyEvent(AGENT, BigInt.fromString("400000000000000000"), BigInt.zero(), BigInt.zero(), MARKET, START_TS, 0, ONE_E18);
    handleBuy(event);

    let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
    let bet = Bet.load(id);
    assert.assertNotNull(bet);
    assert.bigIntEquals(bet!.impliedProbability!, BigInt.fromString("400000000000000000"));
  });

  test("Sell records impliedProbability = returnAmount / tokensSold", () => {
    setupMarket(MARKET, "0x0000000000000000000000000000000000000000000000000000000000000001");
    // Return 0.6, tokens sold 1.0 → implied probability 0.6 (6e17)
    let event = createSellEvent(AGENT, BigInt.fromString("600000000000000000"), BigInt.zero(), BigInt.zero(), MARKET, START_TS, 0, ONE_E18);
    handleSell(event);

    let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
    let bet = Bet.load(id);
    assert.assertNotNull(bet);
    assert.bigIntEquals(bet!.impliedProbability!, BigInt.fromString("600000000000000000"));
    // Sells store negative amount
    assert.bigIntEquals(bet!.amount, BigInt.zero().minus(BigInt.fromString("600000000000000000")));
  });

  test("Buy with zero tokens leaves impliedProbability null", () => {
    setupMarket(MARKET, "0x0000000000000000000000000000000000000000000000000000000000000001");
    let event = createBuyEvent(AGENT, ONE_E18, BigInt.zero(), BigInt.zero(), MARKET, START_TS, 0, BigInt.zero());
    handleBuy(event);

    let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
    let bet = Bet.load(id);
    assert.assertNotNull(bet);
    assert.assertNull(bet!.impliedProbability);
  });

  test("Winning bet: Brier = (p - 1)^2; losing bet: Brier = p^2", () => {
    setupMarket(MARKET, "0x0000000000000000000000000000000000000000000000000000000000000001");
    // Bet on outcome 1 at p=0.4, market resolves to 1 (win).
    // Bet on outcome 0 at p=0.6, same market — resolves to 1 (loss).
    handleBuy(createBuyEvent(AGENT, BigInt.fromString("400000000000000000"), BigInt.zero(), BigInt.fromI32(1), MARKET, START_TS, 0, ONE_E18));
    handleBuy(createBuyEvent(AGENT, BigInt.fromString("600000000000000000"), BigInt.zero(), BigInt.zero(), MARKET, START_TS, 1, ONE_E18));

    handleLogNewAnswer(createNewAnswerEvent(
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001"),
      ANSWER_1_HEX,
      START_TS
    ));

    let stat = DailyProfitStatistic.load(dailyStatId(NORMALIZED_TS));
    assert.assertNotNull(stat);
    // Win contribution: (0.4 - 1)^2 = 0.36 = 360000000000000000
    // Loss contribution: (0.6 - 0)^2 = 0.36 = 360000000000000000
    // Sum: 0.72 = 720000000000000000
    assert.bigIntEquals(stat!.brierSum, BigInt.fromString("720000000000000000"));
    assert.i32Equals(stat!.brierCount, 2);
  });

  test("Sell is excluded from Brier", () => {
    setupMarket(MARKET, "0x0000000000000000000000000000000000000000000000000000000000000001");
    // Buy then Sell, same outcome. Only the buy should contribute to Brier.
    handleBuy(createBuyEvent(AGENT, BigInt.fromString("400000000000000000"), BigInt.zero(), BigInt.fromI32(1), MARKET, START_TS, 0, BigInt.fromString("2000000000000000000")));
    handleSell(createSellEvent(AGENT, BigInt.fromString("200000000000000000"), BigInt.zero(), BigInt.fromI32(1), MARKET, START_TS, 1, ONE_E18));

    handleLogNewAnswer(createNewAnswerEvent(
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001"),
      ANSWER_1_HEX,
      START_TS
    ));

    let stat = DailyProfitStatistic.load(dailyStatId(NORMALIZED_TS));
    assert.assertNotNull(stat);
    // Only the buy contributes: p = 0.4/2.0 = 0.2 → (0.2 - 1)^2 = 0.64 = 640000000000000000
    assert.bigIntEquals(stat!.brierSum, BigInt.fromString("640000000000000000"));
    assert.i32Equals(stat!.brierCount, 1);
  });

  test("Invalid answer: Brier vs 0.5 actual for both outcomes", () => {
    setupMarket(MARKET, "0x0000000000000000000000000000000000000000000000000000000000000001");
    // Bet on outcome 0 at p=0.4; bet on outcome 1 at p=0.6. Market resolves invalid.
    handleBuy(createBuyEvent(AGENT, BigInt.fromString("400000000000000000"), BigInt.zero(), BigInt.zero(), MARKET, START_TS, 0, ONE_E18));
    handleBuy(createBuyEvent(AGENT, BigInt.fromString("600000000000000000"), BigInt.zero(), BigInt.fromI32(1), MARKET, START_TS, 1, ONE_E18));

    handleLogNewAnswer(createNewAnswerEvent(
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001"),
      INVALID_HEX,
      START_TS
    ));

    let stat = DailyProfitStatistic.load(dailyStatId(NORMALIZED_TS));
    assert.assertNotNull(stat);
    // Bet 1: (0.4 - 0.5)^2 = 0.01 = 10000000000000000
    // Bet 2: (0.6 - 0.5)^2 = 0.01 = 10000000000000000
    // Sum: 0.02 = 20000000000000000
    assert.bigIntEquals(stat!.brierSum, BigInt.fromString("20000000000000000"));
    assert.i32Equals(stat!.brierCount, 2);
  });

  test("Re-answer: subtracts old Brier from old day, applies new Brier to new day", () => {
    setupMarket(MARKET, "0x0000000000000000000000000000000000000000000000000000000000000001");
    // Buy on outcome 1 at p=0.4.
    handleBuy(createBuyEvent(AGENT, BigInt.fromString("400000000000000000"), BigInt.zero(), BigInt.fromI32(1), MARKET, START_TS, 0, ONE_E18));

    // Day A: settles to answer 0 (bet loses). Brier = (0.4 - 0)^2 = 0.16
    let DAY_A = START_TS;
    let DAY_A_BUCKET = NORMALIZED_TS;
    handleLogNewAnswer(createNewAnswerEvent(
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001"),
      ANSWER_0_HEX,
      DAY_A
    ));

    let statA = DailyProfitStatistic.load(dailyStatId(DAY_A_BUCKET));
    assert.bigIntEquals(statA!.brierSum, BigInt.fromString("160000000000000000"));
    assert.i32Equals(statA!.brierCount, 1);

    // Day B: re-answer flips to 1 (bet now wins). Brier = (0.4 - 1)^2 = 0.36
    let DAY_B = BigInt.fromI32(1710000000 + 86400 * 2);
    let DAY_B_BUCKET = BigInt.fromI32(1710115200); // (DAY_B / 86400) * 86400
    handleLogNewAnswer(createNewAnswerEvent(
      Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001"),
      ANSWER_1_HEX,
      DAY_B
    ));

    // Old day reverted to zero
    let statARev = DailyProfitStatistic.load(dailyStatId(DAY_A_BUCKET));
    assert.bigIntEquals(statARev!.brierSum, BigInt.zero());
    assert.i32Equals(statARev!.brierCount, 0);

    // New day has the new Brier
    let statB = DailyProfitStatistic.load(dailyStatId(DAY_B_BUCKET));
    assert.assertNotNull(statB);
    assert.bigIntEquals(statB!.brierSum, BigInt.fromString("360000000000000000"));
    assert.i32Equals(statB!.brierCount, 1);
  });
});
