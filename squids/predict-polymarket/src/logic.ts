// Ported business logic (same behavior as the Envio port / original subgraph),
// operating on the EntityCache. Entities are mutable TypeORM class instances,
// so updates mutate in place and re-set to mark dirty.
import {
  Bet,
  DailyProfitStatistic,
  Global,
  MarketParticipant,
  MarketParticipated,
  PayoutRedemptionEntity,
  Question,
  QuestionResolution,
  TraderAgent,
} from "./model";
import { EntityCache } from "./entityCache";
import { ONE_DAY } from "./constants";

export type EventMeta = {
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
  logIndex: number;
};

export async function getGlobal(cache: EntityCache): Promise<Global> {
  const global = await cache.get(Global, "");
  return (
    global ??
    new Global({
      id: "",
      totalTraderAgents: 0,
      totalActiveTraderAgents: 0,
      totalBets: 0,
      totalTraded: 0n,
      totalTradedSettled: 0n,
      totalPayout: 0n,
      totalExpectedPayout: 0n,
      totalMarketsParticipated: 0,
    })
  );
}

export function getDayTimestamp(timestamp: bigint): bigint {
  return (timestamp / ONE_DAY) * ONE_DAY;
}

export async function getDailyProfitStatistic(
  cache: EntityCache,
  agent: TraderAgent,
  timestamp: bigint,
): Promise<DailyProfitStatistic> {
  const dayTimestamp = getDayTimestamp(timestamp);
  const id = `${agent.id}_${dayTimestamp}`;
  const statistic = await cache.get(DailyProfitStatistic, id);
  return (
    statistic ??
    new DailyProfitStatistic({
      id,
      traderAgent: agent,
      date: dayTimestamp,
      totalBets: 0,
      totalTraded: 0n,
      totalPayout: 0n,
      dailyTradedSettled: 0n,
      dailyProfit: 0n,
      profitParticipants: [],
    })
  );
}

export function addProfitParticipant(
  statistic: DailyProfitStatistic,
  conditionId: string,
): void {
  if (statistic.profitParticipants.indexOf(conditionId) === -1) {
    statistic.profitParticipants = [
      ...statistic.profitParticipants,
      conditionId,
    ];
  }
}

/**
 * Consolidates all activity and volume updates into a single pass.
 * Tracks outcome share positions on MarketParticipant.
 */
export async function processTradeActivity(
  cache: EntityCache,
  agent: TraderAgent,
  conditionId: string,
  question: Question | undefined,
  amount: bigint,
  outcomeIndex: bigint,
  sharesAmount: bigint,
  meta: EventMeta,
): Promise<void> {
  const global = await getGlobal(cache);

  // 1. Update Global
  global.totalBets += 1;
  global.totalTraded += amount;

  // 2. Update TraderAgent
  if (agent.firstParticipation == null) {
    agent.firstParticipation = meta.blockTimestamp;
    global.totalActiveTraderAgents += 1;
  }
  agent.totalBets += 1;
  agent.lastActive = meta.blockTimestamp;
  agent.totalTraded += amount;

  // 3. Update or Create MarketParticipant
  const participantId = `${agent.id}_${conditionId}`;
  let participant = await cache.get(MarketParticipant, participantId);

  if (participant == null) {
    participant = new MarketParticipant({
      id: participantId,
      traderAgent: agent,
      // FK-constrained (unlike graph-node/Envio): only link when the
      // Question row exists. Participants of unknown questions never settle
      // either way — settlement iterates by question and requires it.
      question: question ?? null,
      totalBets: 0,
      totalTraded: 0n,
      totalTradedSettled: 0n,
      totalPayout: 0n,
      outcomeShares0: 0n,
      outcomeShares1: 0n,
      expectedPayout: 0n,
      settled: false,
      createdAt: meta.blockTimestamp,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    });

    // 3a. Track unique market participation
    const marketActivity = await cache.get(MarketParticipated, conditionId);
    if (marketActivity == null) {
      cache.set(MarketParticipated, new MarketParticipated({ id: conditionId }));
      global.totalMarketsParticipated += 1;
    }
  }

  participant.totalBets += 1;
  participant.totalTraded += amount;
  // Track outcome share positions (buys add, sells subtract via negative sharesAmount)
  if (outcomeIndex === 0n) {
    participant.outcomeShares0 += sharesAmount;
  } else {
    participant.outcomeShares1 += sharesAmount;
  }
  participant.blockTimestamp = meta.blockTimestamp;
  participant.blockNumber = meta.blockNumber;
  participant.transactionHash = meta.transactionHash;

  // 4. Save all
  cache.set(Global, global);
  cache.set(TraderAgent, agent);
  cache.set(MarketParticipant, participant);
}

/**
 * Handles market resolution — calculates expectedPayout and profit for ALL
 * participants. All profit/loss is attributed to the resolution day.
 *
 * Deviation from the subgraph/Envio ports: the Question existence check runs
 * BEFORE QuestionResolution creation — TypeORM enforces the FK, and
 * resolutions of untracked questions were dead rows anyway.
 */
export async function processMarketResolution(
  cache: EntityCache,
  conditionId: string,
  winningOutcome: bigint,
  settledPrice: bigint,
  payouts: bigint[],
  meta: EventMeta,
): Promise<void> {
  const question = await cache.get(Question, conditionId);
  if (question == null) return;

  // 1. Create the Resolution entity (skip if already resolved)
  const existingResolution = await cache.get(QuestionResolution, conditionId);
  if (existingResolution != null) return;

  cache.set(
    QuestionResolution,
    new QuestionResolution({
      id: conditionId,
      question,
      winningIndex: winningOutcome,
      settledPrice,
      payouts: payouts.map((p) => p.toString()),
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );

  // 2. Load all participants of this market (flushes pending writes first)
  const participants = await cache.participantsByQuestion(conditionId);
  if (participants.length === 0) return;

  // 3. Global delta accumulators
  let globalTradedSettledDelta = 0n;
  let globalExpectedPayoutDelta = 0n;

  const isAnswer0 = winningOutcome === 0n;
  const isAnswer1 = winningOutcome === 1n;

  // 4. Iterate ALL participants
  for (const participant of participants) {
    // Skip already settled (idempotency)
    if (participant.settled) continue;

    const agent = await cache.get(TraderAgent, participant.traderAgent.id);
    if (agent == null) continue;

    // 4a. Calculate expectedPayout from outcome share balances
    let expectedPayout = 0n;
    if (isAnswer0) {
      expectedPayout =
        participant.outcomeShares0 > 0n ? participant.outcomeShares0 : 0n;
    } else if (isAnswer1) {
      expectedPayout =
        participant.outcomeShares1 > 0n ? participant.outcomeShares1 : 0n;
    } else {
      // Invalid answer — each share worth 1/2 collateral
      const payout0 =
        participant.outcomeShares0 > 0n ? participant.outcomeShares0 / 2n : 0n;
      const payout1 =
        participant.outcomeShares1 > 0n ? participant.outcomeShares1 / 2n : 0n;
      expectedPayout = payout0 + payout1;
    }

    // 4b. Calculate settlement amounts and profit
    const amountToSettle =
      participant.totalTraded - participant.totalTradedSettled;
    const profit = expectedPayout - amountToSettle;

    // 4c. Update participant
    participant.expectedPayout = expectedPayout;
    participant.totalTradedSettled = participant.totalTraded;
    participant.settled = true;
    cache.set(MarketParticipant, participant);

    // 4d. Update agent
    agent.totalTradedSettled += amountToSettle;
    agent.totalExpectedPayout += expectedPayout;
    cache.set(TraderAgent, agent);

    // 4e. Update daily stat
    const dailyStat = await getDailyProfitStatistic(
      cache,
      agent,
      meta.blockTimestamp,
    );
    dailyStat.dailyProfit += profit;
    dailyStat.dailyTradedSettled += amountToSettle;
    addProfitParticipant(dailyStat, conditionId);
    cache.set(DailyProfitStatistic, dailyStat);

    // 4f. Accumulate global deltas
    globalTradedSettledDelta += amountToSettle;
    globalExpectedPayoutDelta += expectedPayout;

    // 4g. Mark individual bets as counted
    const bets = await cache.betsByParticipant(participant.id);
    for (const bet of bets) {
      if (!bet.countedInProfit) {
        bet.countedInProfit = true;
        bet.countedInTotal = true;
        cache.set(Bet, bet);
      }
    }
  }

  // 5. Apply global deltas (only save if at least one participant was processed)
  if (globalTradedSettledDelta !== 0n || globalExpectedPayoutDelta !== 0n) {
    const global = await getGlobal(cache);
    global.totalTradedSettled += globalTradedSettledDelta;
    global.totalExpectedPayout += globalExpectedPayoutDelta;
    cache.set(Global, global);
  }
}

/**
 * Handles payout redemption — only tracks actual payouts claimed.
 * No profit calculation (that's done at resolution time).
 */
export async function processRedemption(
  cache: EntityCache,
  redeemer: string,
  conditionId: string,
  payoutAmount: bigint,
  meta: EventMeta,
): Promise<void> {
  // 1. Validation: Only process if it's one of our agents
  const agent = await cache.get(TraderAgent, redeemer);
  if (agent == null) return;

  // 2. Validation: Only process if it's a market we track
  const question = await cache.get(Question, conditionId);
  if (question == null) return;

  const participantId = `${redeemer}_${conditionId}`;
  const participant = await cache.get(MarketParticipant, participantId);
  if (participant == null) return;

  const global = await getGlobal(cache);

  // 3. Create immutable PayoutRedemptionEntity (audit trail)
  cache.set(
    PayoutRedemptionEntity,
    new PayoutRedemptionEntity({
      id: `${meta.transactionHash}_${meta.logIndex}`,
      redeemer: agent,
      conditionId,
      question,
      payoutAmount,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.transactionHash,
    }),
  );

  // 4. Update Payout Totals (NO profit calculation)
  agent.totalPayout += payoutAmount;
  participant.totalPayout += payoutAmount;
  global.totalPayout += payoutAmount;
  cache.set(TraderAgent, agent);
  cache.set(MarketParticipant, participant);
  cache.set(Global, global);

  // 5. Update Daily Statistics (only payout, NO dailyProfit change)
  const dailyStat = await getDailyProfitStatistic(
    cache,
    agent,
    meta.blockTimestamp,
  );
  dailyStat.totalPayout += payoutAmount;
  cache.set(DailyProfitStatistic, dailyStat);
}
