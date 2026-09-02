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
  processTradeActivity,
} from "./logic";
import { bytesToUtf8, extractBinaryOutcomes, extractTitle } from "./ancillary";
import { getOutcomeTokenId } from "./tokenDerivation";
import { computeImpliedProbability } from "./brier";
import {
  PREDICT_AGENT_ID,
  NEG_RISK_ADAPTER,
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

export async function handleOrderFill(
  cache: IEntityCache,
  meta: EventMeta,
  p: {
    maker: string;
    isBuying: boolean;
    outcomeTokenId: bigint;
    makerAmountFilled: bigint;
    takerAmountFilled: bigint;
    builder: string | null;
    metadata: string | null;
  },
) {
  // 1. Resolve the TraderAgent behind the maker (v2 may route via a DW)
  let agent = await cache.get(TraderAgent, p.maker);
  if (agent == null) {
    const dw = await cache.getDepositWallet(p.maker);
    // unknown maker: silent by design — this is ~all of Polymarket's order
    // flow; a warn here would emit millions of lines
    if (dw == null) return;
    agent = await cache.get(TraderAgent, dw.traderAgent.id);
    if (agent == null) {
      // a KNOWN deposit wallet pointing at a missing agent is a corrupted
      // link — rare and alarming, unlike the unknown-maker case above
      cache.log.warn(
        `DepositWallet ${p.maker} links to missing TraderAgent ${dw.traderAgent.id} in tx ${meta.transactionHash}`,
      );
      return;
    }
  }

  // 2. Sells use NEGATIVE amounts/shares (omen convention)
  const usdcAmount = p.isBuying ? p.makerAmountFilled : -p.takerAmountFilled;
  const sharesAmount = p.isBuying ? p.takerAmountFilled : -p.makerAmountFilled;

  // 3. Lookup the outcome index
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

  // 4. Update Daily Stats
  const dailyStat = await getDailyProfitStatistic(
    cache,
    agent,
    meta.blockTimestamp,
  );
  dailyStat.totalBets += 1;
  dailyStat.totalTraded += usdcAmount;
  cache.set(DailyProfitStatistic, dailyStat);

  // 5. Create Bet
  const question = await cache.get(Question, tokenRegistry.conditionId);
  const participantId = `${agent.id}_${tokenRegistry.conditionId}`;
  const bet = new Bet({
      id: `${meta.transactionHash}_${meta.logIndex}`,
      bettor: agent,
      outcomeIndex: tokenRegistry.outcomeIndex,
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
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    });
  cache.set(Bet, bet);

  // 6. Process Agent, Participant, and Global atomically
  await processTradeActivity(
    cache,
    agent,
    tokenRegistry.conditionId,
    question,
    usdcAmount,
    tokenRegistry.outcomeIndex,
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
