import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor, Block, Log } from "./processor";
import { EntityCache } from "./entityCache";
import * as serviceRegistryEvents from "./abi/ServiceRegistryL2/events";
import * as conditionalTokensEvents from "./abi/ConditionalTokens/events";
import * as ooEvents from "./abi/OptimisticOracleV3/events";
import * as umaEvents from "./abi/UmaCtfAdapter/events";
import * as negRiskEvents from "./abi/NegRiskAdapter/events";
import * as ctfExchangeEvents from "./abi/CTFExchange/events";
import * as ctfExchangeV2Events from "./abi/CTFExchangeV2/events";
import * as adapterEvents from "./abi/CtfCollateralAdapter/events";
import * as factoryEvents from "./abi/DepositWalletFactory/events";
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
import {
  PREDICT_AGENT_ID,
  SERVICE_REGISTRY_L2,
  CONDITIONAL_TOKENS,
  OPTIMISTIC_ORACLE_V3,
  UMA_CTF_ADAPTER,
  NEG_RISK_ADAPTER,
  CTF_EXCHANGE_V1,
  NEG_RISK_CTF_EXCHANGE_V1,
  CTF_EXCHANGE_V2,
  NEG_RISK_CTF_EXCHANGE_V2,
  CTF_COLLATERAL_ADAPTERS,
  DEPOSIT_WALLET_FACTORY,
  USDC_E_ADDRESS,
} from "./constants";

// SQD block header timestamps are Unix MILLISECONDS; entity fields keep the
// subgraph convention of seconds.
function eventMeta(block: Block, log: Log): EventMeta {
  return {
    blockNumber: BigInt(block.height),
    blockTimestamp: BigInt(Math.floor(block.timestamp / 1000)),
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  };
}

const lc = (s: string) => s.toLowerCase();

async function handleRegisterInstance(cache: EntityCache, block: Block, log: Log) {
  const e = serviceRegistryEvents.RegisterInstance.decode(log);
  if (e.agentId !== PREDICT_AGENT_ID) return;

  const meta = eventMeta(block, log);
  // agent instance EOA -> serviceId link used by the WalletDeployed handler.
  cache.set(
    AgentInstance,
    new AgentInstance({
      id: lc(e.agentInstance),
      serviceId: e.serviceId,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );

  const serviceId = e.serviceId.toString();
  const existing = await cache.get(TraderService, serviceId);
  if (existing != null) return;
  cache.set(TraderService, new TraderService({ id: serviceId, multisig: null }));
}

async function handleCreateMultisigWithAgents(
  cache: EntityCache,
  block: Block,
  log: Log,
) {
  const e = serviceRegistryEvents.CreateMultisigWithAgents.decode(log);
  const traderService = await cache.get(TraderService, e.serviceId.toString());
  if (traderService == null) return; // non-trader service

  const multisig = lc(e.multisig);
  traderService.multisig = multisig;
  cache.set(TraderService, traderService);

  const existing = await cache.get(TraderAgent, multisig);
  if (existing == null) {
    const meta = eventMeta(block, log);
    cache.set(
      TraderAgent,
      new TraderAgent({
        id: multisig,
        serviceId: e.serviceId,
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

async function handleWalletDeployed(cache: EntityCache, block: Block, log: Log) {
  const e = factoryEvents.WalletDeployed.decode(log);
  const owner = lc(e.owner);

  const instance = await cache.get(AgentInstance, owner);
  if (instance == null) return; // not one of our agents (the common case)

  const traderService = await cache.get(
    TraderService,
    instance.serviceId.toString(),
  );
  if (traderService?.multisig == null) return;

  const agent = await cache.get(TraderAgent, traderService.multisig);
  if (agent == null) return;

  const wallet = lc(e.wallet);
  const existing = await cache.get(DepositWallet, wallet);
  if (existing != null) return; // write-once per DW

  const meta = eventMeta(block, log);
  cache.set(
    DepositWallet,
    new DepositWallet({
      id: wallet,
      traderAgent: agent,
      agentInstance: owner,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );
}

async function handleConditionPreparation(
  cache: EntityCache,
  block: Block,
  log: Log,
) {
  const e = conditionalTokensEvents.ConditionPreparation.decode(log);
  // we don't handle conditions with more than 2 outcomes
  if (e.outcomeSlotCount !== 2n) return;

  const bridge = await cache.get(QuestionIdToConditionId, e.questionId);
  if (bridge != null) return; // REPETITIVE_QUESTION_ID — same guard as ports

  cache.set(
    QuestionIdToConditionId,
    new QuestionIdToConditionId({
      id: e.questionId,
      conditionId: e.conditionId,
      oracle: lc(e.oracle),
      transactionHash: log.transactionHash,
    }),
  );

  // v2 exchanges do not emit TokenRegistered — derive outcome tokenIds here.
  const isNegRisk = lc(e.oracle) === NEG_RISK_ADAPTER;
  const collateral = isNegRisk ? NEG_RISK_ADAPTER : USDC_E_ADDRESS;

  for (const [indexSet, outcomeIndex] of [
    [1, 0],
    [2, 1],
  ] as const) {
    const tokenId = await getOutcomeTokenId(e.conditionId, collateral, indexSet);
    if (tokenId == null) continue;

    const existing = await cache.get(TokenRegistry, tokenId);
    if (existing != null) continue;

    cache.set(
      TokenRegistry,
      new TokenRegistry({
        id: tokenId,
        tokenId: BigInt(tokenId),
        conditionId: e.conditionId,
        outcomeIndex: BigInt(outcomeIndex),
        transactionHash: log.transactionHash,
      }),
    );
  }
}

async function handleQuestionInitialization(
  cache: EntityCache,
  block: Block,
  log: Log,
  questionID: string,
  ancillaryData: string,
) {
  const rawData = bytesToUtf8(ancillaryData);
  const outcomes = extractBinaryOutcomes(rawData);
  if (outcomes.length === 0) return; // not a binary market

  const bridge = await cache.get(QuestionIdToConditionId, questionID);
  if (bridge == null) return;

  const metadata = new MarketMetadata({
    id: questionID,
    title: extractTitle(rawData),
    outcomes,
    rawAncillaryData: rawData,
  });
  cache.set(MarketMetadata, metadata);

  const meta = eventMeta(block, log);
  cache.set(
    Question,
    new Question({
      id: bridge.conditionId,
      questionId: questionID,
      metadata,
      isNegRisk: false,
      marketId: null,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );
}

async function handleQuestionResolution(
  cache: EntityCache,
  block: Block,
  log: Log,
  questionID: string,
  settledPrice: bigint,
  payouts: bigint[],
) {
  const bridge = await cache.get(QuestionIdToConditionId, questionID);
  if (bridge == null) return;

  let winningOutcome = -1n;
  if (payouts.length >= 2) {
    if (payouts[1]! > payouts[0]!) winningOutcome = 1n;
    else if (payouts[0]! > payouts[1]!) winningOutcome = 0n;
  }

  await processMarketResolution(
    cache,
    bridge.conditionId,
    winningOutcome,
    settledPrice,
    payouts,
    eventMeta(block, log),
  );
}

async function handleQuestionPrepared(cache: EntityCache, block: Block, log: Log) {
  const e = negRiskEvents.QuestionPrepared.decode(log);
  const rawData = bytesToUtf8(e.data);

  const bridge = await cache.get(QuestionIdToConditionId, e.questionId);
  if (bridge == null) return;

  // For Neg Risk, Outcome 0 = Yes, Outcome 1 = No
  const metadata = new MarketMetadata({
    id: e.questionId,
    title: extractTitle(rawData),
    outcomes: ["Yes", "No"],
    rawAncillaryData: rawData,
  });
  cache.set(MarketMetadata, metadata);

  const meta = eventMeta(block, log);
  cache.set(
    Question,
    new Question({
      id: bridge.conditionId,
      questionId: e.questionId,
      marketId: e.marketId,
      isNegRisk: true,
      metadata,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );
}

async function handleOutcomeReported(cache: EntityCache, block: Block, log: Log) {
  const e = negRiskEvents.OutcomeReported.decode(log);
  const bridge = await cache.get(QuestionIdToConditionId, e.questionId);
  if (bridge == null) return;

  // NegRisk Logic: true = YES (outcome 0), false = NO (outcome 1)
  const isYes = e.outcome;
  await processMarketResolution(
    cache,
    bridge.conditionId,
    isYes ? 0n : 1n,
    isYes ? 1n : 0n,
    isYes ? [1n, 0n] : [0n, 1n],
    eventMeta(block, log),
  );
}

async function handleOrderFill(
  cache: EntityCache,
  block: Block,
  log: Log,
  maker: string,
  isBuying: boolean,
  outcomeTokenId: bigint,
  makerAmountFilled: bigint,
  takerAmountFilled: bigint,
  builder: string | null,
  betMetadata: string | null,
) {
  // 1. Resolve the TraderAgent behind the maker (v2 may route via a DW)
  let agent = await cache.get(TraderAgent, maker);
  if (agent == null) {
    const dw = await cache.getDepositWallet(maker);
    if (dw == null) return; // unknown maker
    agent = await cache.get(TraderAgent, dw.traderAgent.id);
  }
  if (agent == null) return;

  // 2. Sells use NEGATIVE amounts/shares (omen convention)
  const usdcAmount = isBuying ? makerAmountFilled : -takerAmountFilled;
  const sharesAmount = isBuying ? takerAmountFilled : -makerAmountFilled;

  // 3. Lookup the outcome index
  const tokenRegistry = await cache.get(
    TokenRegistry,
    outcomeTokenId.toString(),
  );
  if (tokenRegistry == null) return;

  const meta = eventMeta(block, log);

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
  cache.set(
    Bet,
    new Bet({
      id: `${meta.transactionHash}_${meta.logIndex}`,
      bettor: agent,
      outcomeIndex: tokenRegistry.outcomeIndex,
      amount: usdcAmount,
      shares: sharesAmount,
      isBuy: isBuying,
      countedInTotal: false,
      countedInProfit: false,
      question: question ?? null,
      dailyStatistic: dailyStat,
      builder,
      metadata: betMetadata,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );

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
  // participant row exists (FK); re-set with the relation attached.
  const bet = await cache.get(Bet, `${meta.transactionHash}_${meta.logIndex}`);
  const participant = await cache.get(MarketParticipant, participantId);
  if (bet != null && participant != null) {
    bet.marketParticipant = participant;
    cache.set(Bet, bet);
  }
}

async function handleTokenRegistered(cache: EntityCache, block: Block, log: Log) {
  const e = ctfExchangeEvents.TokenRegistered.decode(log);
  const token0Id = e.token0.toString();

  // Polymarket registers the swapped pair too; store only the first pair.
  const existing = await cache.get(TokenRegistry, token0Id);
  if (existing != null) return;

  cache.set(
    TokenRegistry,
    new TokenRegistry({
      id: token0Id,
      tokenId: e.token0,
      conditionId: e.conditionId,
      outcomeIndex: 0n,
      transactionHash: log.transactionHash,
    }),
  );
  cache.set(
    TokenRegistry,
    new TokenRegistry({
      id: e.token1.toString(),
      tokenId: e.token1,
      conditionId: e.conditionId,
      outcomeIndex: 1n,
      transactionHash: log.transactionHash,
    }),
  );
}

processor.run(
  new TypeormDatabase({ supportHotBlocks: true }),
  async (ctx) => {
    const cache = new EntityCache(ctx.store);

    for (const block of ctx.blocks) {
      for (const log of block.logs) {
        const address = log.address; // SQD normalizes to lowercase
        const topic0 = log.topics[0];

        if (address === SERVICE_REGISTRY_L2) {
          if (topic0 === serviceRegistryEvents.RegisterInstance.topic) {
            await handleRegisterInstance(cache, block.header, log);
          } else if (
            topic0 === serviceRegistryEvents.CreateMultisigWithAgents.topic
          ) {
            await handleCreateMultisigWithAgents(cache, block.header, log);
          }
        } else if (address === CONDITIONAL_TOKENS) {
          if (topic0 === conditionalTokensEvents.ConditionPreparation.topic) {
            await handleConditionPreparation(cache, block.header, log);
          } else if (
            topic0 === conditionalTokensEvents.PayoutRedemption.topic
          ) {
            const e = conditionalTokensEvents.PayoutRedemption.decode(log);
            await processRedemption(
              cache,
              lc(e.redeemer),
              e.conditionId,
              e.payout,
              eventMeta(block.header, log),
            );
          }
        } else if (
          address === OPTIMISTIC_ORACLE_V3 ||
          address === UMA_CTF_ADAPTER
        ) {
          if (topic0 === ooEvents.QuestionInitialized.topic) {
            const e = ooEvents.QuestionInitialized.decode(log);
            await handleQuestionInitialization(
              cache,
              block.header,
              log,
              e.questionID,
              e.ancillaryData,
            );
          } else if (topic0 === ooEvents.QuestionResolved.topic) {
            const e = ooEvents.QuestionResolved.decode(log);
            await handleQuestionResolution(
              cache,
              block.header,
              log,
              e.questionID,
              e.settledPrice,
              [...e.payouts],
            );
          }
        } else if (address === NEG_RISK_ADAPTER) {
          if (topic0 === negRiskEvents.QuestionPrepared.topic) {
            await handleQuestionPrepared(cache, block.header, log);
          } else if (topic0 === negRiskEvents.OutcomeReported.topic) {
            await handleOutcomeReported(cache, block.header, log);
          } else if (topic0 === negRiskEvents.PayoutRedemption.topic) {
            const e = negRiskEvents.PayoutRedemption.decode(log);
            await processRedemption(
              cache,
              lc(e.redeemer),
              e.conditionId,
              e.payout,
              eventMeta(block.header, log),
            );
          }
        } else if (
          address === CTF_EXCHANGE_V1 ||
          address === NEG_RISK_CTF_EXCHANGE_V1
        ) {
          if (topic0 === ctfExchangeEvents.OrderFilled.topic) {
            const e = ctfExchangeEvents.OrderFilled.decode(log);
            // makerAssetId == 0 -> maker gave USDC -> BUY
            const isBuying = e.makerAssetId === 0n;
            await handleOrderFill(
              cache,
              block.header,
              log,
              lc(e.maker),
              isBuying,
              isBuying ? e.takerAssetId : e.makerAssetId,
              e.makerAmountFilled,
              e.takerAmountFilled,
              null,
              null,
            );
          } else if (topic0 === ctfExchangeEvents.TokenRegistered.topic) {
            await handleTokenRegistered(cache, block.header, log);
          }
        } else if (
          address === CTF_EXCHANGE_V2 ||
          address === NEG_RISK_CTF_EXCHANGE_V2
        ) {
          if (topic0 === ctfExchangeV2Events.OrderFilled.topic) {
            const e = ctfExchangeV2Events.OrderFilled.decode(log);
            await handleOrderFill(
              cache,
              block.header,
              log,
              lc(e.maker),
              Number(e.side) === 0, // side 0 = BUY, 1 = SELL
              e.tokenId,
              e.makerAmountFilled,
              e.takerAmountFilled,
              e.builder,
              e.metadata,
            );
          }
        } else if (CTF_COLLATERAL_ADAPTERS.includes(address)) {
          if (topic0 === adapterEvents.PositionsRedeemed.topic) {
            const e = adapterEvents.PositionsRedeemed.decode(log);
            await processRedemption(
              cache,
              lc(e.initiator),
              e.conditionId,
              e.payout,
              eventMeta(block.header, log),
            );
          }
        } else if (address === DEPOSIT_WALLET_FACTORY) {
          if (topic0 === factoryEvents.WalletDeployed.topic) {
            await handleWalletDeployed(cache, block.header, log);
          }
        }
      }
    }

    await cache.flush();
  },
);
