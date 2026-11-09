import * as events from './abi/StakingTokenV4/events';
import { ServiceUnstakedV4, ServicesRebaselined, ServiceBaselineEvent, ServiceBaselineState, StakingContract, Deposit, Withdraw, ServiceInactivityWarning, ServicesEvicted } from './model';
import * as h from './handlers';
import type { Ctx } from './handlers';
import type { EventMeta } from '@olas/squid-shared';

const baselineId = (meta: EventMeta, serviceId: bigint) => `${meta.address}-${serviceId}`;
function baseline(ctx: Ctx, meta: EventMeta, serviceId: bigint, epoch: bigint, missing: boolean) {
  ctx.cache.set(ServiceBaselineState, new ServiceBaselineState({id: baselineId(meta, serviceId), contractAddress: meta.address, serviceId, epoch, baselineMissing: missing}));
}
export async function dispatchV4(ctx: Ctx, meta: EventMeta, contract: StakingContract, log: {topics: string[]; data: string}): Promise<void> {
  const fields = {...h.eventFields(meta), contractAddress: meta.address};
  switch (log.topics[0]) {
    case events.ServiceStaked.topic: {
      const p = events.ServiceStaked.decode(log);
      await h.handleServiceStaked(ctx, meta, contract, p);
      baseline(ctx, meta, p.serviceId, p.epoch, false);
      return;
    }
    case events.RewardClaimed.topic: {
      const p = events.RewardClaimed.decode(log);
      if (p.receivers.length !== p.rewardAmounts.length) throw new Error('Reward recipient/amount length mismatch');
      await h.handleRewardClaimed(ctx, meta, contract, {...p, reward: p.rewardAmounts.reduce((a, b) => a + b, 0n)});
      return;
    }
    case events.ServiceUnstaked.topic: {
      const p = events.ServiceUnstaked.decode(log);
      ctx.cache.set(ServiceUnstakedV4, new ServiceUnstakedV4({...fields, ...p, nonces: p.nonces.map(String)}));
      // Any payout was already recorded by RewardClaimed. The unstake event
      // contains no returned/paid reward amount; retain checkpoint earnings.
      await h.handleServiceUnstaked(ctx, meta, contract, {...p, reward: 0n}, p.enforced, true);
      // Keep an explicit false status rather than a stale missing marker.
      baseline(ctx, meta, p.serviceId, p.epoch, false);
      return;
    }
    case events.ServicesRebaselined.topic: {
      const p = events.ServicesRebaselined.decode(log);
      ctx.cache.set(ServicesRebaselined, new ServicesRebaselined({...fields, ...p, id: `${meta.address}-${p.epoch}`}));
      return;
    }
    case events.Checkpoint.topic: {
      const p = events.Checkpoint.decode(log);
      const marker = await ctx.cache.get(ServicesRebaselined, `${meta.address}-${p.epoch}`);
      if (marker && (p.serviceIds.length || p.rewards.length)) throw new Error('Rebaseline cannot allocate rewards');
      await h.handleCheckpoint(ctx, meta, contract, p, !!marker);
      return;
    }
    case events.ServiceBaselineMissing.topic:
    case events.ServiceBaselineRecovered.topic: {
      const missing = log.topics[0] === events.ServiceBaselineMissing.topic;
      const p = (missing ? events.ServiceBaselineMissing : events.ServiceBaselineRecovered).decode(log);
      ctx.cache.set(ServiceBaselineEvent, new ServiceBaselineEvent({...fields, ...p, kind: missing ? 'Missing' : 'Recovered'}));
      baseline(ctx, meta, p.serviceId, p.epoch, missing);
      return;
    }
    case events.Deposit.topic:
      ctx.cache.set(Deposit, new Deposit({...fields, ...events.Deposit.decode(log)})); return;
    case events.Withdraw.topic: {
      const p = events.Withdraw.decode(log);
      ctx.cache.set(Withdraw, new Withdraw({...fields, to: p.receiver, amount: p.amount})); return;
    }
    case events.ServiceInactivityWarning.topic:
      ctx.cache.set(ServiceInactivityWarning, new ServiceInactivityWarning({...fields, ...events.ServiceInactivityWarning.decode(log)})); return;
    case events.ServicesEvicted.topic: {
      const p = events.ServicesEvicted.decode(log);
      ctx.cache.set(ServicesEvicted, new ServicesEvicted({...fields, ...p, serviceIds: p.serviceIds.map(String), serviceInactivity: p.serviceInactivity.map(String)})); return;
    }
  }
}
