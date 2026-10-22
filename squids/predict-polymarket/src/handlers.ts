// Event handlers, decoupled from SQD's runtime types: each takes the cache
// interface, plain EventMeta, and already-decoded parameters (addresses
// lowercased at the decode boundary in main.ts). This keeps them unit-testable
// without a database or network — see tests/lifecycle.test.ts.
import {
  AgentInstance,
  Bet,
  DailyProfitStatistic,
  DepositWallet,
  Global,
  MarketMetadata,
  MarketParticipant,
  Question,
  QuestionIdToConditionId,
  QuestionResolution,
  TokenRegistry,
  TraderAgent,
  TraderService,
} from "./model";
import { IEntityCache } from "./entityCache";
import {
  EventMeta,
  getDailyProfitStatistic,
  getGlobal,
  processMarketResolution,
  processRedemption,
  processTradeActivity,
} from "./logic";
import { bytesToUtf8, extractBinaryOutcomes, extractTitle } from "./ancillary";
import { getOutcomeTokenId } from "./tokenDerivation";
import { decodePositionId, padConditionId } from "./positionId";
import { computeImpliedProbability } from "./brier";
import { RESULT_DENOMINATOR, winningOutcomeFromResult } from "./resolution";
import {
  PREDICT_AGENT_ID,
  PROBABILITY_SCALE,
  BINARY_MODULE_ID,
  NEG_RISK_ADAPTER,
  PUSD_ADDRESS,
  ROUTER,
  USDC_E_ADDRESS,
} from "./constants";

export async function handleRegisterInstance(
  cache: IEntityCache,
  meta: EventMeta,
  p: { agentInstance: string; serviceId: bigint; agentId: bigint },
) {
  if (p.agentId !== PREDICT_AGENT_ID) return;

  // agent instance EOA -> serviceId link used by the WalletDeployed handler.
  cache.set(
    AgentInstance,
    new AgentInstance({
      id: p.agentInstance,
      serviceId: p.serviceId,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );

  const serviceId = p.serviceId.toString();
  const existing = await cache.get(TraderService, serviceId);
  if (existing != null) return;
  cache.set(TraderService, new TraderService({ id: serviceId, multisig: null }));
}

export async function handleCreateMultisigWithAgents(
  cache: IEntityCache,
  meta: EventMeta,
  p: { serviceId: bigint; multisig: string },
) {
  const traderService = await cache.get(TraderService, p.serviceId.toString());
  if (traderService == null) return; // non-trader service

  traderService.multisig = p.multisig;
  cache.set(TraderService, traderService);

  const existing = await cache.get(TraderAgent, p.multisig);
  if (existing == null) {
    cache.set(
      TraderAgent,
      new TraderAgent({
        id: p.multisig,
        serviceId: p.serviceId,
        firstParticipation: null,
        lastActive: null,
        totalBets: 0,
        totalTraded: 0n,
        totalTradedSettled: 0n,
        totalPayout: 0n,
        totalExpectedPayout: 0n,
        blockNumber: meta.blockNumber,
        blockTimestamp: meta.blockTimestamp,
        transactionHash: meta.transactionHash,
      }),
    );
    const global = await getGlobal(cache);
    global.totalTraderAgents += 1;
    cache.set(Global, global);
  }
}

export async function handleWalletDeployed(
  cache: IEntityCache,
  meta: EventMeta,
  p: { wallet: string; owner: string },
) {
  const instance = await cache.get(AgentInstance, p.owner);
  if (instance == null) return; // not one of our agents (the common case)

  const traderService = await cache.get(
    TraderService,
    instance.serviceId.toString(),
  );
  if (traderService?.multisig == null) return;

  const agent = await cache.get(TraderAgent, traderService.multisig);
  if (agent == null) return;

  const existing = await cache.get(DepositWallet, p.wallet);
  if (existing != null) return; // write-once per DW

  cache.set(
    DepositWallet,
    new DepositWallet({
      id: p.wallet,
      traderAgent: agent,
      agentInstance: p.owner,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );
}

export async function handleConditionPreparation(
  cache: IEntityCache,
  meta: EventMeta,
  p: { conditionId: string; oracle: string; questionId: string; outcomeSlotCount: bigint },
  // injectable for tests; production uses the RPC-backed derivation
  deriveTokenId: typeof getOutcomeTokenId = getOutcomeTokenId,
) {
  // we don't handle conditions with more than 2 outcomes
  if (p.outcomeSlotCount !== 2n) return;

  const bridge = await cache.get(QuestionIdToConditionId, p.questionId);
  if (bridge != null) return; // REPETITIVE_QUESTION_ID — same guard as ports

  cache.set(
    QuestionIdToConditionId,
    new QuestionIdToConditionId({
      id: p.questionId,
      conditionId: p.conditionId,
      oracle: p.oracle,
      transactionHash: meta.transactionHash,
    }),
  );

  // v2 exchanges do not emit TokenRegistered — derive outcome tokenIds here.
  const isNegRisk = p.oracle === NEG_RISK_ADAPTER;
  const collateral = isNegRisk ? NEG_RISK_ADAPTER : USDC_E_ADDRESS;

  for (const [indexSet, outcomeIndex] of [
    [1, 0],
    [2, 1],
  ] as const) {
    const tokenId = await deriveTokenId(p.conditionId, collateral, indexSet);
    if (tokenId == null) continue;

    const existing = await cache.get(TokenRegistry, tokenId);
    if (existing != null) continue;

    cache.set(
      TokenRegistry,
      new TokenRegistry({
        id: tokenId,
        tokenId: BigInt(tokenId),
        conditionId: p.conditionId,
        outcomeIndex: BigInt(outcomeIndex),
        transactionHash: meta.transactionHash,
      }),
    );
  }
}

export async function handleQuestionInitialization(
  cache: IEntityCache,
  meta: EventMeta,
  p: { questionID: string; ancillaryData: string },
) {
  const rawData = bytesToUtf8(p.ancillaryData);
  const outcomes = extractBinaryOutcomes(rawData);
  if (outcomes.length === 0) return; // not a binary market

  const bridge = await cache.get(QuestionIdToConditionId, p.questionID);
  if (bridge == null) return;

  const metadata = new MarketMetadata({
    id: p.questionID,
    title: extractTitle(rawData),
    outcomes,
    rawAncillaryData: rawData,
  });
  cache.set(MarketMetadata, metadata);

  cache.set(
    Question,
    new Question({
      id: bridge.conditionId,
      questionId: p.questionID,
      metadata,
      isNegRisk: false,
      marketId: null,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );
}

export async function handleQuestionResolution(
  cache: IEntityCache,
  meta: EventMeta,
  p: { questionID: string; settledPrice: bigint; payouts: bigint[] },
) {
  const bridge = await cache.get(QuestionIdToConditionId, p.questionID);
  if (bridge == null) return;

  let winningOutcome = -1n;
  if (p.payouts.length >= 2) {
    if (p.payouts[1]! > p.payouts[0]!) winningOutcome = 1n;
    else if (p.payouts[0]! > p.payouts[1]!) winningOutcome = 0n;
  }

  await processMarketResolution(
    cache,
    bridge.conditionId,
    winningOutcome,
    p.settledPrice,
    p.payouts,
    meta,
  );
}

export async function handleQuestionPrepared(
  cache: IEntityCache,
  meta: EventMeta,
  p: { questionId: string; marketId: string; data: string },
) {
  const rawData = bytesToUtf8(p.data);

  const bridge = await cache.get(QuestionIdToConditionId, p.questionId);
  if (bridge == null) return;

  // For Neg Risk, Outcome 0 = Yes, Outcome 1 = No
  const metadata = new MarketMetadata({
    id: p.questionId,
    title: extractTitle(rawData),
    outcomes: ["Yes", "No"],
    rawAncillaryData: rawData,
  });
  cache.set(MarketMetadata, metadata);

  cache.set(
    Question,
    new Question({
      id: bridge.conditionId,
      questionId: p.questionId,
      marketId: p.marketId,
      isNegRisk: true,
      metadata,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );
}

export async function handleOutcomeReported(
  cache: IEntityCache,
  meta: EventMeta,
  p: { questionId: string; outcome: boolean },
) {
  const bridge = await cache.get(QuestionIdToConditionId, p.questionId);
  if (bridge == null) return;

  // NegRisk Logic: true = YES (outcome 0), false = NO (outcome 1)
  const isYes = p.outcome;
  await processMarketResolution(
    cache,
    bridge.conditionId,
    isYes ? 0n : 1n,
    isYes ? 1n : 0n,
    isYes ? [1n, 0n] : [0n, 1n],
    meta,
  );
}

export type OrderFill = {
  maker: string;
  isBuying: boolean;
  outcomeTokenId: bigint;
  makerAmountFilled: bigint;
  takerAmountFilled: bigint;
  /**
   * Fee in pUSD that the order's signer (the event's `maker`) paid, from
   * OrderFilled.fee; CTF exchange fills leave it unset (0).
   */
  fee?: bigint;
  builder: string | null;
  metadata: string | null;
};

/** Fill on a CTF exchange: the CTF outcome token is looked up in TokenRegistry. */
export async function handleOrderFill(
  cache: IEntityCache,
  meta: EventMeta,
  p: OrderFill,
) {
  const agent = await resolveMakerAgent(cache, meta, p.maker);
  if (agent == null) return;

  const tokenRegistry = await cache.get(
    TokenRegistry,
    p.outcomeTokenId.toString(),
  );
  if (tokenRegistry == null) {
    // same message the subgraph logged — keeps MIGRATION.md diffs explainable
    cache.log.warn(
      `TokenRegistry missing for token ${p.outcomeTokenId} in tx ${meta.transactionHash}`,
    );
    return;
  }

  await recordBet(
    cache,
    meta,
    agent,
    p,
    tokenRegistry.conditionId,
    tokenRegistry.outcomeIndex,
    null,
  );
}

// Skipped V2 positions already warned about, for the life of the process:
// an agent trading one keeps refilling it, and each fill would warn again.
const warnedSkippedPositions = new Set<bigint>();

/**
 * Protocol V2 fill on ExchangeV3: the PositionManager position ID carries the
 * condition and outcome, so nothing is looked up or derived. The condition is
 * stored in its padded bytes32 form, the id Gamma, the CLOB and the Data API
 * use. Amounts are pUSD base units (6 decimals) and include the fee the
 * order's signer paid (OrderFilled.fee):
 * a BUY pays makerAmountFilled + fee, a SELL receives takerAmountFilled - fee.
 */
export async function handlePositionFill(
  cache: IEntityCache,
  meta: EventMeta,
  p: OrderFill,
) {
  const agent = await resolveMakerAgent(cache, meta, p.maker);
  if (agent == null) return;

  const { moduleId, conditionId, outcomeIndex } = decodePositionId(
    p.outcomeTokenId,
  );
  if (moduleId !== BINARY_MODULE_ID || outcomeIndex > 1) {
    // entities track binary positions only (outcomeShares0 / outcomeShares1):
    // BinaryModule (1) positions; NegRisk (2) and combinatorial (3) are skipped
    if (!warnedSkippedPositions.has(p.outcomeTokenId)) {
      warnedSkippedPositions.add(p.outcomeTokenId);
      cache.log.warn(
        `Non-binary position ${p.outcomeTokenId} in tx ${meta.transactionHash}`,
      );
    }
    return;
  }

  const condition = padConditionId(conditionId);
  await ensureBinaryQuestion(cache, meta, condition);
  await recordBet(
    cache,
    meta,
    agent,
    p,
    condition,
    BigInt(outcomeIndex),
    PUSD_ADDRESS,
  );
}

/**
 * Question of a BinaryModule condition, created at an agent's first fill on
 * it so its participants and bets settle at ConditionResolved. Keyed by the
 * padded condition ID.
 */
async function ensureBinaryQuestion(
  cache: IEntityCache,
  meta: EventMeta,
  conditionId: string,
) {
  if ((await cache.get(Question, conditionId)) != null) return;

  const metadata = new MarketMetadata({
    id: conditionId,
    title: "",
    outcomes: [],
    rawAncillaryData: "",
  });
  cache.set(MarketMetadata, metadata);

  cache.set(
    Question,
    new Question({
      id: conditionId,
      questionId: conditionId,
      metadata,
      isNegRisk: false,
      marketId: null,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );
}

/**
 * Protocol V2 result of a binary market: BinaryModule ConditionResolved's
 * payout vector (parts per million) settles the market through the V1
 * resolution path. settledPrice is outcome 0's payout scaled to 1e18, the
 * scale UMA reports it in.
 */
export async function handleConditionResolved(
  cache: IEntityCache,
  meta: EventMeta,
  p: { conditionId: string; result: bigint[] },
) {
  await processMarketResolution(
    cache,
    padConditionId(p.conditionId),
    winningOutcomeFromResult(p.result),
    ((p.result[0] ?? 0n) * PROBABILITY_SCALE) / RESULT_DENOMINATOR,
    p.result,
    meta,
  );
}

/**
 * Protocol V2 claim: a BinaryModule PositionRedeemed initiated by the Router
 * pays `payout` pUSD to `recipient`. It is credited like a V1
 * PayoutRedemption when the recipient is an agent's Safe and the market's
 * result is recorded.
 */
export async function handlePositionRedeemed(
  cache: IEntityCache,
  meta: EventMeta,
  p: {
    initiator: string;
    positionId: bigint;
    recipient: string;
    payout: bigint;
  },
) {
  if (p.initiator !== ROUTER) return;
  if ((await cache.get(TraderAgent, p.recipient)) == null) return;

  const condition = padConditionId(decodePositionId(p.positionId).conditionId);
  if ((await cache.get(QuestionResolution, condition)) == null) return;

  await processRedemption(cache, p.recipient, condition, p.payout, meta);
}

/** The TraderAgent behind an order maker: its Safe, or a DepositWallet it owns. */
async function resolveMakerAgent(
  cache: IEntityCache,
  meta: EventMeta,
  maker: string,
): Promise<TraderAgent | undefined> {
  const agent = await cache.get(TraderAgent, maker);
  if (agent != null) return agent;

  const dw = await cache.getDepositWallet(maker);
  // unknown maker: silent by design - this is ~all of Polymarket's order
  // flow; a warn here would emit millions of lines
  if (dw == null) return undefined;
  const owner = await cache.get(TraderAgent, dw.traderAgent.id);
  if (owner == null) {
    // a KNOWN deposit wallet pointing at a missing agent is a corrupted
    // link - rare and alarming, unlike the unknown-maker case above
    cache.log.warn(
      `DepositWallet ${maker} links to missing TraderAgent ${dw.traderAgent.id} in tx ${meta.transactionHash}`,
    );
  }
  return owner;
}

async function recordBet(
  cache: IEntityCache,
  meta: EventMeta,
  agent: TraderAgent,
  p: OrderFill,
  conditionId: string,
  outcomeIndex: bigint,
  collateral: string | null,
) {
  // Sells use NEGATIVE amounts/shares (omen convention)
  const fee = p.fee ?? 0n;
  const usdcAmount = p.isBuying
    ? p.makerAmountFilled + fee
    : -(p.takerAmountFilled - fee);
  const sharesAmount = p.isBuying ? p.takerAmountFilled : -p.makerAmountFilled;

  // 1. Update Daily Stats
  const dailyStat = await getDailyProfitStatistic(
    cache,
    agent,
    meta.blockTimestamp,
  );
  dailyStat.totalBets += 1;
  dailyStat.totalTraded += usdcAmount;
  cache.set(DailyProfitStatistic, dailyStat);

  // 2. Create Bet
  const question = await cache.get(Question, conditionId);
  const participantId = `${agent.id}_${conditionId}`;
  const bet = new Bet({
      id: `${meta.transactionHash}_${meta.logIndex}`,
      bettor: agent,
      outcomeIndex,
      amount: usdcAmount,
      shares: sharesAmount,
      isBuy: p.isBuying,
      impliedProbability: computeImpliedProbability(usdcAmount, sharesAmount),
      countedInTotal: false,
      countedInProfit: false,
      question: question ?? null,
      dailyStatistic: dailyStat,
      builder: p.builder,
      metadata: p.metadata,
      collateral,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    });
  cache.set(Bet, bet);

  // 3. Process Agent, Participant, and Global atomically
  await processTradeActivity(
    cache,
    agent,
    conditionId,
    question,
    usdcAmount,
    outcomeIndex,
    sharesAmount,
    meta,
  );

  // Bet.marketParticipant is set after processTradeActivity guarantees the
  // participant row exists (FK); attach the relation on the same instance.
  const participant = await cache.get(MarketParticipant, participantId);
  if (participant != null) {
    bet.marketParticipant = participant;
    cache.set(Bet, bet);
  }
}

export async function handleTokenRegistered(
  cache: IEntityCache,
  meta: EventMeta,
  p: { token0: bigint; token1: bigint; conditionId: string },
) {
  const token0Id = p.token0.toString();

  // Polymarket registers the swapped pair too; store only the first pair.
  const existing = await cache.get(TokenRegistry, token0Id);
  if (existing != null) return;

  cache.set(
    TokenRegistry,
    new TokenRegistry({
      id: token0Id,
      tokenId: p.token0,
      conditionId: p.conditionId,
      outcomeIndex: 0n,
      transactionHash: meta.transactionHash,
    }),
  );
  cache.set(
    TokenRegistry,
    new TokenRegistry({
      id: p.token1.toString(),
      tokenId: p.token1,
      conditionId: p.conditionId,
      outcomeIndex: 1n,
      transactionHash: meta.transactionHash,
    }),
  );
}
