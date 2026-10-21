// Protocol V2 bets end to end: recorded Polygon receipts (ExchangeV3
// OrderFilled + PositionManager TransferSingle + pUSD transfers + module
// events, see tests/fixtures/v2-trades.json) go through src/dispatch.ts, the
// same entry the processor uses, and must land in the existing entities.
//
// No Olas agent has traded on ExchangeV3 yet, so each test makes one of the
// real makers in the receipt the agent's DepositWallet. The expected amounts
// are cross-checked against the Data API /v2/trades rows recorded with the
// receipts (size and price per maker).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Abi } from "viem";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const derivation = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../src/tokenDerivation", () => ({
  // V2 position IDs are decoded, never derived: any call here is a failure
  getOutcomeTokenId: vi.fn(async (...args: unknown[]) => {
    derivation.calls.push(args);
    throw new Error("token derivation must not run for Protocol V2 logs");
  }),
}));

import { InMemoryCache } from "./inMemoryCache";
import { loadFixture, RawLog, RecordedBlock, snapshot, sqdBlock } from "./replay";
import { dispatchLog } from "../src/dispatch";
import * as handlers from "../src/handlers";
import { EventMeta } from "../src/logic";
import {
  Bet,
  DailyProfitStatistic,
  Global,
  MarketMetadata,
  MarketParticipant,
  Question,
  TokenRegistry,
  TraderAgent,
} from "../src/model";

const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const EXCHANGE_V3 = "0xe3333700ca9d93003f00f0f71f8515005f6c00aa";
const POSITION_MANAGER = "0x006f54f7f9a22e0000cc2ab60031000000ae9fef";
const CTF_EXCHANGE_V2 = "0xe111180000d2663c0091e4f400237545b87b996b";

const AGENT_EOA = "0x75bf948904a6e8921e97c0667ad398474b18084b";
const SAFE = "0x1000000000000000000000000000000000000001";
const SERVICE_ID = 297n;

type TradeFixture = {
  block: RecordedBlock;
  dataApiTrades: {
    proxy_wallet: string;
    side: "BUY" | "SELL";
    token_id: string;
    condition_id: string;
    size: number;
    price: number;
    outcome_index: number;
  }[];
  logs: RawLog[];
};
const trades = loadFixture<Record<string, TradeFixture>>("v2-trades.json");

// tx 0xe0ab…: complementary BUYs minted by BinaryModule. Log 373 is a maker
// order (maker 0x23a5…, NO side, taker 0xfc26…); log 383 is the taker order
// (maker 0xfc26…, YES side, taker = the exchange, fee 22480).
const MINT_TX = "0xe0abd59682255da75d2b12783e64c1fae4f24dca7544f61dfbb9e8c227e411c4";
// tx 0x7c1a…: maker 0x8d3f… SELLs 5 YES shares at 0.5; the shares move by a
// direct PositionManager transfer (log 295) from the seller to the buyer.
const SELL_TX = "0x7c1a2ff71e3133db46bd37979a8adc9956f72980d1889f4dcc622379ed6c1e10";

const MINT_YES_MAKER = "0xfc26c4758c104d62a6a54a7e36dfd0ee64c0bc5b";
const MINT_NO_MAKER = "0x23a5e5e9090d78ecc97e6555f7f11b0f9e2311c1";
const SELLER = "0x8d3f52833636d0918b74426b7f5be855bd51b84d";

// Gamma market 5929025: conditionId and positionIds [Yes, No]
const MINT_CONDITION = "0x01e8a4b7d8fb97379337bb29380b28df56000000000000000000000000000000";
const MINT_YES = 863358210533918701740174954868484610826072786730813595626095950865979408384n;
const MINT_NO = 863358210533918701740174954868484610826072786730813595626095950865979408385n;
// Data API row of the sell: condition_id and token_id (outcome 0)
const SELL_CONDITION = "0x010c0043707a7d6424d706ff95fd57486b000000000000000000000000000000";
const SELL_YES = 473516831522399751166910538569036922431732286640529568208012330442459971584n;

const DAY = 86_400n;

const exchangeV3Abi = JSON.parse(
  readFileSync(join(__dirname, "../../../abis/ExchangeV3.json"), "utf8"),
) as Abi;
const positionManagerAbi = JSON.parse(
  readFileSync(join(__dirname, "../../../abis/PositionManager.json"), "utf8"),
) as Abi;

let cache: InMemoryCache;
beforeEach(() => {
  cache = new InMemoryCache();
  derivation.calls.length = 0;
});

let setupCounter = 0;
function setupMeta(): EventMeta {
  setupCounter += 1;
  return {
    blockNumber: 88_000_000n + BigInt(setupCounter),
    blockTimestamp: 1_760_000_000n,
    transactionHash: `0x${"5e".repeat(30)}${String(setupCounter).padStart(4, "0")}`,
    logIndex: 0,
  };
}

/** Agent 86 service with SAFE as multisig and `depositWallet` linked through the factory path. */
async function registerAgent(depositWallet: string) {
  await handlers.handleRegisterInstance(cache, setupMeta(), {
    agentInstance: AGENT_EOA,
    serviceId: SERVICE_ID,
    agentId: 86n,
  });
  await handlers.handleCreateMultisigWithAgents(cache, setupMeta(), {
    serviceId: SERVICE_ID,
    multisig: SAFE,
  });
  await handlers.handleWalletDeployed(cache, setupMeta(), {
    wallet: depositWallet,
    owner: AGENT_EOA,
  });
}

async function replay(tx: string) {
  const t = trades[tx]!;
  for (const log of t.logs) await dispatchLog(cache, sqdBlock(t.block), log);
}

function dataApiRow(tx: string, wallet: string) {
  const row = trades[tx]!.dataApiTrades.find((r) => r.proxy_wallet === wallet);
  expect(row, `Data API row for ${wallet}`).toBeDefined();
  return row!;
}

const toUnits = (x: number) => BigInt(Math.round(x * 1_000_000));
const word = (data: string, i: number) => `0x${data.slice(2 + 64 * i, 2 + 64 * (i + 1))}`;

function fillLog(tx: string, logIndex: number): RawLog {
  const log = trades[tx]!.logs.find((l) => l.logIndex === logIndex);
  expect(log).toBeDefined();
  return log!;
}

let synthCounter = 0;
function synthBlock(): { number: number; timestamp: number } {
  // one day after the mint receipt, same SQD millisecond convention
  return sqdBlock({ number: 95_900_000 + synthCounter, timestamp: trades[MINT_TX]!.block.timestamp + 86_400 });
}
function synthLog(address: string, topics: readonly string[], data: string): RawLog {
  synthCounter += 1;
  return {
    address,
    topics: [...topics],
    data,
    transactionHash: `0x${"ee".repeat(30)}${String(synthCounter).padStart(4, "0")}`,
    logIndex: synthCounter,
  };
}

function orderFilled(p: {
  maker: string;
  taker: string;
  side: 0 | 1;
  tokenId: bigint;
  makerAmountFilled: bigint;
  takerAmountFilled: bigint;
  fee?: bigint;
  address?: string;
}): RawLog {
  const topics = encodeEventTopics({
    abi: exchangeV3Abi,
    eventName: "OrderFilled",
    args: { orderHash: `0x${"0d".repeat(32)}`, maker: p.maker as `0x${string}`, taker: p.taker as `0x${string}` },
  } as never);
  const data = encodeAbiParameters(
    [
      { type: "uint8" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [p.side, p.tokenId, p.makerAmountFilled, p.takerAmountFilled, p.fee ?? 0n, `0x${"00".repeat(32)}`, `0x${"00".repeat(32)}`],
  );
  return synthLog(p.address ?? EXCHANGE_V3, topics as string[], data);
}

function transferSingle(from: string, to: string, id: bigint, amount: bigint): RawLog {
  const topics = encodeEventTopics({
    abi: positionManagerAbi,
    eventName: "TransferSingle",
    args: { operator: from as `0x${string}`, from: from as `0x${string}`, to: to as `0x${string}` },
  } as never);
  const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [id, amount]);
  return synthLog(POSITION_MANAGER, topics as string[], data);
}

function transferBatch(from: string, to: string, ids: bigint[], amounts: bigint[]): RawLog {
  const topics = encodeEventTopics({
    abi: positionManagerAbi,
    eventName: "TransferBatch",
    args: { operator: from as `0x${string}`, from: from as `0x${string}`, to: to as `0x${string}` },
  } as never);
  const data = encodeAbiParameters([{ type: "uint256[]" }, { type: "uint256[]" }], [ids, amounts]);
  return synthLog(POSITION_MANAGER, topics as string[], data);
}

/** Everything a reader sees about bets and positions (TokenRegistry is internal plumbing). */
function positions(c: InMemoryCache) {
  const { tokenRegistry: _internal, ...rest } = snapshot(c);
  return rest;
}

/** No TokenRegistry row may tie a V2 position to anything but its decoded condition. */
function expectNoUsdcEDerivation(positions: Record<string, string>) {
  expect(derivation.calls, "getOutcomeTokenId must not be called for V2 logs").toEqual([]);
  for (const t of cache.all(TokenRegistry)) {
    const expected = positions[t.id];
    expect(expected, `unexpected TokenRegistry row ${t.id}`).toBeDefined();
    expect(t.conditionId).toBe(expected);
  }
}

describe("collateral: a V2 bet is recorded in pUSD", () => {
  it("records the real ExchangeV3 BUY with pUSD collateral and its 6-decimal pUSD amount", async () => {
    await registerAgent(MINT_YES_MAKER);
    await replay(MINT_TX);

    const api = dataApiRow(MINT_TX, MINT_YES_MAKER);
    const amount = toUnits(api.size * api.price); // 0.999989 pUSD
    const shares = toUnits(api.size); // 1.05262 shares
    expect(amount).toBe(999_989n);
    expect(shares).toBe(1_052_620n);

    const bets = cache.all(Bet);
    expect(bets).toHaveLength(1);
    const bet = bets[0]!;
    expect(bet.id).toBe(`${MINT_TX}_383`);
    expect(bet.bettor.id).toBe(SAFE);
    expect((bet as Bet & { collateral?: string | null }).collateral).toBe(PUSD);
    expect(bet.isBuy).toBe(true);
    // pUSD base units straight from the fill: no rescaling, fee not added
    expect(bet.amount).toBe(amount);
    expect(bet.shares).toBe(shares);
    expect(bet.outcomeIndex).toBe(BigInt(api.outcome_index));
    expect(bet.outcomeIndex).toBe(0n);
    expect(bet.impliedProbability).toBe((amount * 10n ** 18n) / shares);
    expect(bet.builder).toBe(word(fillLog(MINT_TX, 383).data, 5));
    expect(bet.metadata).toBe(word(fillLog(MINT_TX, 383).data, 6));
    expect(bet.blockTimestamp).toBe(BigInt(trades[MINT_TX]!.block.timestamp));
    expect(bet.transactionHash).toBe(MINT_TX);

    const agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalBets).toBe(1);
    expect(agent?.totalTraded).toBe(amount);
    expect(agent?.firstParticipation).toBe(BigInt(trades[MINT_TX]!.block.timestamp));

    const global = await cache.get(Global, "");
    expect(global?.totalBets).toBe(1);
    expect(global?.totalTraded).toBe(amount);
    expect(global?.totalMarketsParticipated).toBe(1);

    const day = (BigInt(trades[MINT_TX]!.block.timestamp) / DAY) * DAY;
    const daily = await cache.get(DailyProfitStatistic, `${SAFE}_${day}`);
    expect(daily?.totalBets).toBe(1);
    expect(daily?.totalTraded).toBe(amount);
    expect(bet.dailyStatistic?.id).toBe(`${SAFE}_${day}`);

    expectNoUsdcEDerivation({ [MINT_YES.toString()]: MINT_CONDITION, [MINT_NO.toString()]: MINT_CONDITION });
  });

  it("records the real ExchangeV3 SELL as a negative pUSD amount", async () => {
    await registerAgent(SELLER);
    await replay(SELL_TX);

    const api = dataApiRow(SELL_TX, SELLER);
    expect(api.side).toBe("SELL");
    const amount = toUnits(api.size * api.price); // 2.5 pUSD received
    const shares = toUnits(api.size); // 5 shares given

    const bets = cache.all(Bet);
    expect(bets).toHaveLength(1);
    const bet = bets[0]!;
    expect(bet.id).toBe(`${SELL_TX}_297`);
    expect(bet.bettor.id).toBe(SAFE);
    expect((bet as Bet & { collateral?: string | null }).collateral).toBe(PUSD);
    expect(bet.isBuy).toBe(false);
    expect(bet.amount).toBe(-amount);
    expect(bet.shares).toBe(-shares);
    expect(bet.outcomeIndex).toBe(0n);

    const agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalTraded).toBe(-amount);

    // the seller's PositionManager transfer (log 295) is the fill's own share
    // movement and must not be counted a second time
    const participant = await cache.get(MarketParticipant, `${SAFE}_${SELL_CONDITION}`);
    expect(participant?.outcomeShares0).toBe(-shares);
    expect(participant?.outcomeShares1).toBe(0n);
    expect(participant?.totalBets).toBe(1);

    expectNoUsdcEDerivation({ [SELL_YES.toString()]: SELL_CONDITION, [(SELL_YES + 1n).toString()]: SELL_CONDITION });
  });
});

describe("attribution: V2 fills and PositionManager transfers", () => {
  it("attributes a fill to the agent when its DepositWallet is the maker, and only then", async () => {
    // 0xfc26… is the maker of log 383 and the TAKER of log 373: only 383 is ours
    await registerAgent(MINT_YES_MAKER);
    await replay(MINT_TX);

    expect(cache.all(Bet).map((b) => b.id)).toEqual([`${MINT_TX}_383`]);
    expect(cache.all(TraderAgent).map((a) => a.id)).toEqual([SAFE]);
    // the unknown maker 0x23a5… gets nothing
    expect(cache.all(MarketParticipant).map((p) => p.traderAgent.id)).toEqual([SAFE]);
    expect(cache.all(DailyProfitStatistic).every((d) => d.traderAgent.id === SAFE)).toBe(true);

    // the mint transfers (module -> exchange -> buyer) are the fill's share
    // movement: one fill, one share credit
    const participant = await cache.get(MarketParticipant, `${SAFE}_${MINT_CONDITION}`);
    expect(participant?.outcomeShares0).toBe(1_052_620n);
    expect(participant?.outcomeShares1).toBe(0n);
    expect(participant?.totalBets).toBe(1);
    expect(participant?.totalTraded).toBe(999_989n);
    expect(cache.all(Bet)[0]!.marketParticipant?.id).toBe(`${SAFE}_${MINT_CONDITION}`);
  });

  it("maps the NO-side maker fill to outcome 1 and links an existing Question by the padded condition ID", async () => {
    await registerAgent(MINT_NO_MAKER);
    const metadata = new MarketMetadata({
      id: `0x${"77".repeat(32)}`,
      title: "Will Central Park's maximum temperature be at least 60F on October 20, 2026?",
      outcomes: ["Yes", "No"],
      rawAncillaryData: "",
    });
    cache.set(MarketMetadata, metadata);
    cache.set(
      Question,
      new Question({
        id: MINT_CONDITION,
        questionId: metadata.id,
        isNegRisk: false,
        marketId: null,
        metadata,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0x00",
      }),
    );

    await replay(MINT_TX);

    const api = dataApiRow(MINT_TX, MINT_NO_MAKER);
    const bets = cache.all(Bet);
    expect(bets).toHaveLength(1);
    const bet = bets[0]!;
    expect(bet.id).toBe(`${MINT_TX}_373`);
    expect(bet.bettor.id).toBe(SAFE);
    expect(bet.outcomeIndex).toBe(BigInt(api.outcome_index));
    expect(bet.outcomeIndex).toBe(1n);
    expect(bet.amount).toBe(toUnits(api.size * api.price)); // 0.052631
    expect(bet.shares).toBe(toUnits(api.size));
    expect((bet as Bet & { collateral?: string | null }).collateral).toBe(PUSD);
    expect(bet.question?.id).toBe(MINT_CONDITION);

    const participant = await cache.get(MarketParticipant, `${SAFE}_${MINT_CONDITION}`);
    expect(participant?.question?.id).toBe(MINT_CONDITION);
    expect(participant?.outcomeShares0).toBe(0n);
    expect(participant?.outcomeShares1).toBe(1_052_620n);
  });

  it("attributes a V2 fill whose maker is the agent Safe itself", async () => {
    await registerAgent(MINT_YES_MAKER);
    await dispatchLog(
      cache,
      synthBlock(),
      orderFilled({
        maker: SAFE,
        taker: EXCHANGE_V3,
        side: 0,
        tokenId: MINT_NO,
        makerAmountFilled: 400_000n,
        takerAmountFilled: 1_000_000n,
      }),
    );
    const bets = cache.all(Bet);
    expect(bets).toHaveLength(1);
    expect(bets[0]!.bettor.id).toBe(SAFE);
    expect(bets[0]!.outcomeIndex).toBe(1n);
    expect(bets[0]!.amount).toBe(400_000n);
    expect((bets[0] as Bet & { collateral?: string | null }).collateral).toBe(PUSD);
    expect((await cache.get(MarketParticipant, `${SAFE}_${MINT_CONDITION}`))?.outcomeShares1).toBe(1_000_000n);
  });

  it("ignores the same OrderFilled emitted by any address other than ExchangeV3", async () => {
    await registerAgent(MINT_YES_MAKER);
    const real = fillLog(MINT_TX, 383);
    const block = sqdBlock(trades[MINT_TX]!.block);
    await dispatchLog(cache, block, { ...real, address: "0x9999999999999999999999999999999999999999" });
    await dispatchLog(cache, block, { ...real, address: POSITION_MANAGER });
    // CLOB v2 shares the event signature but its tokenId is a CTF token ID;
    // a V2 position ID arriving there is not a V2 bet
    await dispatchLog(cache, block, { ...real, address: CTF_EXCHANGE_V2 });
    expect(cache.all(Bet)).toHaveLength(0);
    // and the genuine one is recorded
    await dispatchLog(cache, block, real);
    expect(cache.all(Bet)).toHaveLength(1);
  });

  it("a PositionManager TransferSingle from the DepositWallet to the Safe keeps the position on the same agent", async () => {
    await registerAgent(MINT_YES_MAKER);
    await replay(MINT_TX);
    expect(cache.all(Bet)).toHaveLength(1); // the V2 buy is in
    const before = positions(cache);

    await dispatchLog(cache, synthBlock(), transferSingle(MINT_YES_MAKER, SAFE, MINT_YES, 1_052_620n));

    // same agent before and after: no bet, no new participant, no share move
    expect(positions(cache)).toEqual(before);

    // the Safe now sells what it received: the sale nets the same position
    await dispatchLog(
      cache,
      synthBlock(),
      orderFilled({
        maker: SAFE,
        taker: "0x4444444444444444444444444444444444444444",
        side: 1,
        tokenId: MINT_YES,
        makerAmountFilled: 1_052_620n,
        takerAmountFilled: 900_000n,
      }),
    );
    const participants = cache.all(MarketParticipant);
    expect(participants.map((p) => p.id)).toEqual([`${SAFE}_${MINT_CONDITION}`]);
    expect(participants[0]!.outcomeShares0).toBe(0n);
    expect(participants[0]!.totalBets).toBe(2);
    const agent = await cache.get(TraderAgent, SAFE);
    expect(agent?.totalBets).toBe(2);
    expect(agent?.totalTraded).toBe(999_989n - 900_000n);
    expect(cache.all(Bet).every((b) => b.bettor.id === SAFE)).toBe(true);
  });

  it("a PositionManager TransferBatch between the DepositWallet and the Safe keeps both outcomes on the agent", async () => {
    await registerAgent(MINT_YES_MAKER);
    await replay(MINT_TX);
    const before = positions(cache);

    await dispatchLog(
      cache,
      synthBlock(),
      transferBatch(MINT_YES_MAKER, SAFE, [MINT_YES, MINT_NO], [1_052_620n, 0n]),
    );
    await dispatchLog(cache, synthBlock(), transferSingle(SAFE, MINT_YES_MAKER, MINT_YES, 500_000n));

    expect(positions(cache)).toEqual(before);
  });
});
