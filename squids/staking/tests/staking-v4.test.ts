import {expect, it} from 'vitest';
import {InMemoryCache, type EventMeta} from '@olas/squid-shared';
import {dispatch} from '../src/dispatch';
import * as v4 from '../src/abi/StakingTokenV4/events';
import * as legacy from '../src/abi/StakingProxy/events';
import {StakingContract, RewardClaimed, RewardUpdate, ServiceUnstakedV4, ServiceStaked, Checkpoint, ServiceBaselineState, ServicesRebaselined, ServiceRewardsHistory, Deposit, Withdraw, ServicesEvicted, ServiceInactivityWarning} from '../src/model';
import {getOrCreateGlobal, type Ctx} from '../src/handlers';
const address = '0x' + '11'.repeat(20), owner = '0x' + '22'.repeat(20), safe = '0x' + '33'.repeat(20);
const p = {epoch: 1n, serviceId: 1n, owner, multisig: safe, nonces: [1n]};
function setup(olas = true) {
  const cache = new InMemoryCache();
  const ctx: Ctx = {cache, services: new Map(), lockedOlas: async () => 300n};
  cache.set(StakingContract, new StakingContract({id: address, version: '0.4.0', eventsIndexed: true, isOlasStaking: olas}));
  let index = 0;
  let txHash = '0x' + 'aa'.repeat(32);
  let blockNumber = 100n, blockTimestamp = 86401n;
  async function emit(log: {topics: string[]; data: string}, emitter = address) {
    const meta: EventMeta = {address: emitter, blockNumber, blockTimestamp, txHash, logIndex: index++, txFrom: null, txTo: null};
    await dispatch(ctx, meta, log, {config: async () => { throw new Error('unexpected config read'); }});
  }
  const stake = (epoch = 1n, serviceId = 1n) => emit(v4.ServiceStaked.encode({...p, epoch, serviceId, rewardDistributionInfo: 2n}));
  const checkpoint = (epoch: bigint, ids: bigint[] = [], rewards: bigint[] = []) => emit(v4.Checkpoint.encode({epoch, availableRewards: 1000n, serviceIds: ids, rewards, epochLength: 100n}));
  function nextTransaction() { txHash = '0x' + 'bb'.repeat(32); blockNumber++; blockTimestamp += 100n; }
  return {ctx, cache, emit, stake, checkpoint, nextTransaction};
}
it('decodes multiple recipients and counts the payout once across claim and normal unstake', async () => {
  const {ctx, cache, emit, stake, checkpoint} = setup();
  await stake(); await checkpoint(1n, [1n], [100n]);
  await emit(v4.RewardClaimed.encode({...p, epoch: 2n, receivers: [owner, safe], rewardAmounts: [40n, 60n]}));
  await emit(v4.ServiceUnstaked.encode({...p, epoch: 2n, availableRewards: 0n, enforced: false}));
  expect(await getOrCreateGlobal(ctx)).toMatchObject({totalRewards: 100n, totalRewardsClaimed: 100n, currentOlasStaked: 0n, cumulativeOlasUnstaked: 300n});
  expect(cache.all(RewardClaimed)[0]).toMatchObject({reward: 100n, receivers: [owner, safe], rewardAmounts: ['40', '60']});
  expect(cache.all(RewardUpdate).map(e => e.amount)).toEqual([100n, 100n]);
  expect(cache.all(ServiceUnstakedV4)[0].enforced).toBe(false);
  expect(cache.all(ServiceStaked)[0].rewardDistributionInfo).toBe(2n);
  expect(cache.all(ServiceRewardsHistory)[0].rewardAmount).toBe(100n);
});
it('forced unstake releases stake without creating a payout or erasing earnings', async () => {
  const {ctx, cache, emit, stake, checkpoint} = setup();
  await stake(); await checkpoint(1n, [1n], [100n]);
  await emit(v4.ServiceUnstaked.encode({...p, epoch: 2n, availableRewards: 100n, enforced: true}));
  expect(await getOrCreateGlobal(ctx)).toMatchObject({totalRewardsClaimed: 0n, currentOlasStaked: 0n});
  expect(cache.all(RewardClaimed)).toHaveLength(0);
  expect(cache.all(ServiceRewardsHistory)[0].rewardAmount).toBe(100n);
});
it('correlates rebaseline with empty checkpoint, rolls the epoch, and gives no back-pay', async () => {
  const {ctx, cache, emit, stake, checkpoint} = setup();
  await stake();
  await emit(v4.ServicesRebaselined.encode({epoch: 1n})); await checkpoint(1n);
  expect(cache.all(Checkpoint)[0].isRebaseline).toBe(true);
  expect(cache.all(RewardUpdate)).toHaveLength(0);
  expect(cache.all(ServiceRewardsHistory)[0]).toMatchObject({rewardAmount: 0n, isRebaseline: true});
  await checkpoint(2n, [1n], [20n]);
  expect(await getOrCreateGlobal(ctx)).toMatchObject({totalRewards: 20n});
  expect(cache.all(ServiceRewardsHistory).find(e => e.epoch === 2n)?.rewardAmount).toBe(20n);
});
it('first stake after an empty-instance refill uses its emitted next epoch; ordinary empty checkpoints remain ordinary', async () => {
  const {cache, emit, stake, checkpoint} = setup();
  await emit(v4.ServicesRebaselined.encode({epoch: 4n})); await checkpoint(4n);
  await stake(5n); await checkpoint(5n);
  expect(cache.all(ServiceStaked)[0].epoch).toBe(5n);
  expect(cache.all(ServiceRewardsHistory).map(e => e.epoch)).toEqual([5n]);
  expect(cache.all(Checkpoint).map(e => e.isRebaseline)).toEqual([true, false]);
  expect(cache.all(ServicesRebaselined)).toHaveLength(1);
});
it('missing and recovered baselines change status without rewarding the unmeasured interval', async () => {
  const {ctx, cache, emit, stake, checkpoint} = setup(); await stake();
  await emit(v4.ServiceBaselineMissing.encode({epoch: 1n, serviceId: 1n}));
  expect(cache.all(ServiceBaselineState)[0].baselineMissing).toBe(true); await checkpoint(1n);
  await emit(v4.ServiceBaselineRecovered.encode({epoch: 2n, serviceId: 1n})); await checkpoint(2n);
  expect(cache.all(ServiceBaselineState)[0].baselineMissing).toBe(false);
  expect((await getOrCreateGlobal(ctx)).totalRewards).toBe(0n);
  await checkpoint(3n, [1n], [10n]); expect((await getOrCreateGlobal(ctx)).totalRewards).toBe(10n);
});
it('rejects misaligned recipient arrays, excludes foreign logs and keeps non-OLAS payouts out of OLAS totals', async () => {
  const s = setup(false); await s.stake();
  await expect(s.emit(v4.RewardClaimed.encode({...p, receivers: [owner], rewardAmounts: []}))).rejects.toThrow('length mismatch');
  await s.emit(v4.RewardClaimed.encode({...p, receivers: [owner], rewardAmounts: [50n]}));
  expect((await getOrCreateGlobal(s.ctx)).totalRewardsClaimed).toBe(0n);
  await s.emit(v4.RewardClaimed.encode({...p, receivers: [owner], rewardAmounts: [50n]}), '0x' + 'ff'.repeat(20));
  expect(s.cache.all(RewardClaimed)).toHaveLength(1);
  // A legacy topic on a v0.4 instance must not be decoded as a v0.4 stake.
  await s.emit(legacy.ServiceStaked.encode(p)); expect(s.cache.all(ServiceStaked)).toHaveLength(1);
});

it.each([true, false])('same-transaction baseline transition (missing=%s), refill and new stake preserve history counts', async (missing) => {
  const {ctx, cache, emit, stake, checkpoint, nextTransaction} = setup();
  await stake();
  if (!missing) await emit(v4.ServiceBaselineMissing.encode({epoch: 1n, serviceId: 1n}));
  await checkpoint(1n);
  expect(ctx.services.get('1')!.totalEpochsParticipated).toBe(1);
  nextTransaction();
  await emit((missing ? v4.ServiceBaselineMissing : v4.ServiceBaselineRecovered).encode({epoch: 2n, serviceId: 1n}));
  await emit(v4.ServicesRebaselined.encode({epoch: 2n}));
  await checkpoint(2n);
  const row = cache.all(Checkpoint).find(e => e.epoch === 2n)!;
  const history = await cache.get(ServiceRewardsHistory, `1-${address}-2`);
  expect(row.isRebaseline).toBe(true);
  expect(history).toMatchObject({epoch: 2n, contractAddress: address, rewardAmount: 0n, isRebaseline: true, blockTimestamp: 86501n});
  expect(history!.checkpoint!.id).toBe(row.id);
  expect(cache.all(RewardUpdate).filter(e => e.transactionHash === row.transactionHash)).toHaveLength(0);
  expect(cache.all(RewardUpdate)).toHaveLength(1); // only the earlier ordinary checkpoint
  expect((await cache.get(ServiceBaselineState, `${address}-1`))!.baselineMissing).toBe(missing);
  expect(ctx.services.get('1')!.totalEpochsParticipated).toBe(2);
  await stake(3n, 2n);
  expect(cache.all(ServiceStaked).find(e => e.serviceId === 2n)!.epoch).toBe(3n);
  expect(ctx.services.get('1')!.totalEpochsParticipated).toBe(2);
  expect(ctx.services.get('2')!.totalEpochsParticipated).toBe(1);
  expect(cache.all(ServiceRewardsHistory)).toHaveLength(3);
  expect(cache.all(RewardUpdate).filter(e => e.transactionHash === row.transactionHash)).toHaveLength(0);
  expect(await cache.get(ServiceRewardsHistory, `1-${address}-1`)).toMatchObject({isRebaseline: false, epoch: 1n, blockTimestamp: 86401n, rewardAmount: 0n});
  expect((await getOrCreateGlobal(ctx)).totalRewards).toBe(0n);
});
it.each([false, true])('unstake (enforced=%s) and restake reset a missing baseline', async (enforced) => {
  const {cache, emit, stake, checkpoint} = setup();
  await stake();
  expect((await cache.get(ServiceBaselineState, `${address}-1`))!.baselineMissing).toBe(false);
  await checkpoint(1n);
  await emit(v4.ServiceBaselineMissing.encode({epoch: 2n, serviceId: 1n}));
  expect((await cache.get(ServiceBaselineState, `${address}-1`))!.baselineMissing).toBe(true);
  await emit(v4.ServiceUnstaked.encode({...p, epoch: 2n, availableRewards: 0n, enforced}));
  expect((await cache.get(ServiceBaselineState, `${address}-1`))!.baselineMissing).toBe(false);
  await stake(2n);
  expect((await cache.get(ServiceBaselineState, `${address}-1`))!.baselineMissing).toBe(false);
});
it('dispatches v0.4 deposit and withdraw and stores the actual receiver as to', async () => {
  const {cache, emit} = setup();
  await emit(v4.Deposit.encode({sender: owner, amount: 7n, balance: 20n, availableRewards: 13n}));
  await emit(v4.Withdraw.encode({receiver: safe, amount: 9n}));
  expect(cache.all(Deposit)[0]).toMatchObject({sender: owner, amount: 7n, balance: 20n, availableRewards: 13n});
  expect(cache.all(Withdraw)[0]).toMatchObject({to: safe, amount: 9n});
});
it('dispatches v0.4 inactivity and eviction arrays without changing their values', async () => {
  const {cache, emit} = setup();
  await emit(v4.ServiceInactivityWarning.encode({epoch: 2n, serviceId: 1n, serviceInactivity: 4n}));
  await emit(v4.ServicesEvicted.encode({epoch: 2n, serviceIds: [1n, 2n], owners: [owner, safe], multisigs: [safe, owner], serviceInactivity: [4n, 5n]}));
  expect(cache.all(ServiceInactivityWarning)[0]).toMatchObject({epoch: 2n, serviceId: 1n, serviceInactivity: 4n});
  expect(cache.all(ServicesEvicted)[0]).toMatchObject({epoch: 2n, serviceIds: ['1', '2'], owners: [owner, safe], multisigs: [safe, owner], serviceInactivity: ['4', '5']});
});
