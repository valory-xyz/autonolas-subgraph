import { assert, describe, test, clearStore, beforeEach } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { handleFixedProductMarketMakerCreation } from "../src/FPMMDeterministicFactoryMapping";
import { FixedProductMarketMakerCreation, Question, ConditionPreparation } from "../generated/schema";

// Matches the QUESTION_SEPARATOR constant (\u241f = ␟)
const SEPARATOR = "\u241f";
const CREATOR = Address.fromString("0x89c5cc945dd550bcffb72fe42bff002429f46fec"); // in CREATOR_ADDRESSES
const DUMMY_HASH = Bytes.fromHexString("0x1234567890123456789012345678901234567890123456789012345678901234");
const START_TS = BigInt.fromI32(1710000000);

function createFixedProductMarketMakerCreationEvent(
  fixedProductMarketMaker: Address,
  conditionId: Bytes
): any {
  return {
    params: {
      creator: CREATOR,
      fixedProductMarketMaker: fixedProductMarketMaker,
      conditionalTokens: Address.zero(),
      collateralToken: Address.zero(),
      conditionIds: [conditionId],
      fee: BigInt.zero(),
    },
    block: {
      number: BigInt.fromI32(1000),
      timestamp: START_TS,
    },
    transaction: {
      hash: DUMMY_HASH,
    },
  } as any;
}

function setupQuestionWithFields(
  questionId: Bytes,
  title: string,
  outcomes: string,
  category: string | null = null,
  language: string | null = null
): void {
  let questionText: string;
  if (category !== null && language !== null) {
    questionText = title + SEPARATOR + outcomes + SEPARATOR + category + SEPARATOR + language;
  } else if (category !== null) {
    questionText = title + SEPARATOR + outcomes + SEPARATOR + category;
  } else {
    questionText = title + SEPARATOR + outcomes;
  }

  let question = new Question(questionId.toHexString());
  question.question = questionText;
  question.save();

  let condition = new ConditionPreparation(questionId.toHexString());
  condition.questionId = questionId;
  condition.conditionId = questionId;
  condition.oracle = Address.zero();
  condition.outcomeSlotCount = BigInt.fromI32(2);
  condition.blockNumber = BigInt.fromI32(1000);
  condition.blockTimestamp = START_TS;
  condition.transactionHash = DUMMY_HASH;
  condition.save();
}

describe("Market Category & Language Parsing", () => {
  beforeEach(() => {
    clearStore();
  });

  /**
   * Test 1: Full 4-field Realitio template
   * Question: "Will BTC hit $50k?"␟"Yes,No"␟"Crypto"␟"en-US"
   * Expected: category = "Crypto", language = "en-US"
   */
  test("Full template (4 fields): category and language parsed", () => {
    const marketAddr = Address.fromString("0x0000000000000000000000000000000000000001");
    const questionId = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001");

    setupQuestionWithFields(
      questionId,
      "Will BTC hit $50k?",
      "Yes,No",
      "Crypto",
      "en-US"
    );

    const event = createFixedProductMarketMakerCreationEvent(marketAddr, questionId);
    handleFixedProductMarketMakerCreation(event);

    const entity = FixedProductMarketMakerCreation.load(marketAddr);
    assert.assertNotNull(entity);
    assert.stringEquals(entity!.question, "Will BTC hit $50k?");
    assert.stringEquals(entity!.category, "Crypto");
    assert.stringEquals(entity!.language, "en-US");
  });

  /**
   * Test 2: 3-field template (no language)
   * Question: "US Election Winner?"␟"Trump,Harris"␟"Politics"
   * Expected: category = "Politics", language = null
   */
  test("3-field template: category parsed, language null", () => {
    const marketAddr = Address.fromString("0x0000000000000000000000000000000000000002");
    const questionId = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000002");

    setupQuestionWithFields(
      questionId,
      "US Election Winner?",
      "Trump,Harris",
      "Politics",
      null
    );

    const event = createFixedProductMarketMakerCreationEvent(marketAddr, questionId);
    handleFixedProductMarketMakerCreation(event);

    const entity = FixedProductMarketMakerCreation.load(marketAddr);
    assert.assertNotNull(entity);
    assert.stringEquals(entity!.question, "US Election Winner?");
    assert.stringEquals(entity!.category, "Politics");
    assert.assertNull(entity!.language);
  });

  /**
   * Test 3: 2-field template (legacy, no category or language)
   * Question: "Will it rain?"␟"Yes,No"
   * Expected: category = null, language = null
   */
  test("2-field template (legacy): category and language null", () => {
    const marketAddr = Address.fromString("0x0000000000000000000000000000000000000003");
    const questionId = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000003");

    setupQuestionWithFields(
      questionId,
      "Will it rain?",
      "Yes,No",
      null,
      null
    );

    const event = createFixedProductMarketMakerCreationEvent(marketAddr, questionId);
    handleFixedProductMarketMakerCreation(event);

    const entity = FixedProductMarketMakerCreation.load(marketAddr);
    assert.assertNotNull(entity);
    assert.stringEquals(entity!.question, "Will it rain?");
    assert.assertNull(entity!.category);
    assert.assertNull(entity!.language);
  });

  /**
   * Test 4: Whitespace trimming
   * Question: "Sports Question?"␟"Team A,Team B"␟"  Sports  "␟"  en  "
   * Expected: category = "Sports" (trimmed), language = "en" (trimmed)
   */
  test("Whitespace in category/language is trimmed", () => {
    const marketAddr = Address.fromString("0x0000000000000000000000000000000000000004");
    const questionId = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000004");

    let questionText = "Sports Question?" + SEPARATOR + "Team A,Team B" + SEPARATOR + "  Sports  " + SEPARATOR + "  en  ";
    let question = new Question(questionId.toHexString());
    question.question = questionText;
    question.save();

    let condition = new ConditionPreparation(questionId.toHexString());
    condition.questionId = questionId;
    condition.conditionId = questionId;
    condition.oracle = Address.zero();
    condition.outcomeSlotCount = BigInt.fromI32(2);
    condition.blockNumber = BigInt.fromI32(1000);
    condition.blockTimestamp = START_TS;
    condition.transactionHash = DUMMY_HASH;
    condition.save();

    const event = createFixedProductMarketMakerCreationEvent(marketAddr, questionId);
    handleFixedProductMarketMakerCreation(event);

    const entity = FixedProductMarketMakerCreation.load(marketAddr);
    assert.assertNotNull(entity);
    assert.stringEquals(entity!.category, "Sports");
    assert.stringEquals(entity!.language, "en");
  });

  /**
   * Test 5: Outcomes with special characters (ensure category isn't affected)
   * Question: "Question?"␟""Yes, No", "Maybe""␟"Culture"␟"fr"
   * Expected: outcomes parsed correctly, category = "Culture", language = "fr"
   */
  test("Special characters in outcomes don't affect category parsing", () => {
    const marketAddr = Address.fromString("0x0000000000000000000000000000000000000005");
    const questionId = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000005");

    // Outcomes with quotes and slashes (existing tests show these are stripped)
    let questionText = "Culture Question?" + SEPARATOR + "\"Yes/No\",\"Maybe/Not\"" + SEPARATOR + "Culture" + SEPARATOR + "fr";
    let question = new Question(questionId.toHexString());
    question.question = questionText;
    question.save();

    let condition = new ConditionPreparation(questionId.toHexString());
    condition.questionId = questionId;
    condition.conditionId = questionId;
    condition.oracle = Address.zero();
    condition.outcomeSlotCount = BigInt.fromI32(2);
    condition.blockNumber = BigInt.fromI32(1000);
    condition.blockTimestamp = START_TS;
    condition.transactionHash = DUMMY_HASH;
    condition.save();

    const event = createFixedProductMarketMakerCreationEvent(marketAddr, questionId);
    handleFixedProductMarketMakerCreation(event);

    const entity = FixedProductMarketMakerCreation.load(marketAddr);
    assert.assertNotNull(entity);
    assert.stringEquals(entity!.category, "Culture");
    assert.stringEquals(entity!.language, "fr");
    // Outcomes should have quotes/slashes stripped
    assert.i32Equals(entity!.outcomes!.length, 2);
  });
});
