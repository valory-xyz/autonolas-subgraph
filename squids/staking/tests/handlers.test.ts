import { it, expect } from "vitest";
import {
  InMemoryCache,
  type EventMeta,
  assertFlushOrderIsFkSafe,
  owningRelations,
} from "@olas/squid-shared";
import { getMetadataArgsStorage } from "typeorm";
import {
  ActiveServiceEpoch,
  CumulativeDailyStakingGlobal,
  RewardClaimed,
  RewardUpdate,
  ServiceForceUnstaked,
  ServiceRewardsHistory,
  StakingContract,
} from "../src/model";
import * as handlers from "../src/handlers";
import type { Ctx } from "../src/handlers";
import { StakingReader } from "../src/rpc";
import * as stakingProxy from "../src/abi/StakingProxy/events";
import * as stakingFactory from "../src/abi/StakingFactory/events";
import { FLUSH_ORDER } from "../src/entityCache";
import { dispatch } from "../src/dispatch";
import { CHAIN } from "../src/constants";

const address = "0x" + "11".repeat(20);
const owner = "0x" + "22".repeat(20);
const meta = (index = 0, timestamp = 86401n, emitter = address): EventMeta => ({
  address: emitter,
  blockNumber: 100n + BigInt(index),
  blockTimestamp: timestamp,
  txHash: "0x" + "aa".repeat(32),
  logIndex: index,
  txFrom: null,
  txTo: null,
});
const params = {
  epoch: 1n,
  serviceId: 1n,
  owner,
  multisig: owner,
  nonces: [2n],
};
function setup(olas = true) {
  const cache = new InMemoryCache();
  const ctx: Ctx = {
    cache,
    services: new Map(),
    lockedOlas: async () => 300n,
  };
  const contract = new StakingContract({
    id: address,
    isOlasStaking: olas,
    eventsIndexed: true,
  });
  cache.set(StakingContract, contract);
  return { cache, ctx, contract };
}
async function checkpoint(
  ctx: Ctx,
  contract: StakingContract,
  epoch = 1n,
  ids = [1n],
  rewards = [100n],
  index = 1,
) {
  await handlers.handleCheckpoint(ctx, meta(index), contract, {
    epoch,
    availableRewards: 1000n,
    serviceIds: ids,
    rewards,
    epochLength: 100n,
  });
}
it("keeps graph-ts event IDs and writes dependencies before their foreign keys", () => {
  expect(handlers.eventId(meta(258))).toBe(meta().txHash + "02010000");
  expect(() =>
    assertFlushOrderIsFkSafe(
      FLUSH_ORDER,
      owningRelations(getMetadataArgsStorage()),
    ),
  ).not.toThrow();
});
it("counts earnings, claims, and normal unstake independently, releasing the original stake", async () => {
  const { ctx, cache, contract } = setup();
  await handlers.handleServiceStaked(ctx, meta(), contract, params);
  await checkpoint(ctx, contract);
  await handlers.handleRewardClaimed(ctx, meta(2), contract, {
    ...params,
    reward: 40n,
  });
  ctx.lockedOlas = async () => {
    throw new Error("must not reread deposit on unstake");
  };
  await handlers.handleServiceUnstaked(
    ctx,
    meta(3),
    contract,
    { ...params, reward: 60n, availableRewards: 0n },
    false,
  );
  expect(await handlers.getOrCreateGlobal(ctx)).toMatchObject({
    currentOlasStaked: 0n,
    cumulativeOlasStaked: 300n,
    cumulativeOlasUnstaked: 300n,
    totalRewards: 100n,
    totalRewardsClaimed: 100n,
  });
  expect(ctx.services.get("1")).toMatchObject({
    currentStakeAmount: 0n,
    olasRewardsEarned: 100n,
    olasRewardsClaimed: 100n,
    totalEpochsParticipated: 1,
    latestStakingContract: null,
  });
  expect(cache.all(CumulativeDailyStakingGlobal)[0]).toMatchObject({
    totalRewards: 100n,
    totalRewardsClaimed: 100n,
    numServices: 1,
  });
});
it("forced unstake returns rewards to the contract, not claimed totals", async () => {
  const { ctx, cache, contract } = setup();
  await handlers.handleServiceStaked(ctx, meta(), contract, params);
  await checkpoint(ctx, contract);
  await handlers.handleServiceUnstaked(
    ctx,
    meta(2),
    contract,
    { ...params, reward: 100n, availableRewards: 100n },
    true,
  );
  expect(await handlers.getOrCreateGlobal(ctx)).toMatchObject({
    currentOlasStaked: 0n,
    totalRewards: 100n,
    totalRewardsClaimed: 0n,
  });
  expect(ctx.services.get("1")?.olasRewardsClaimed).toBe(0n);
  expect(cache.all(RewardUpdate).map((x) => x.type)).toEqual(["Claimable"]);
  expect(cache.all(ServiceForceUnstaked)).toHaveLength(1);
});
it("excludes non-OLAS stake, checkpoint, claim and unstake while retaining raw history", async () => {
  const { ctx, cache, contract } = setup(false);
  ctx.lockedOlas = async () => {
    throw new Error("non-OLAS read");
  };
  await handlers.handleServiceStaked(ctx, meta(), contract, params);
  await checkpoint(ctx, contract);
  await handlers.handleRewardClaimed(ctx, meta(2), contract, {
    ...params,
    reward: 40n,
  });
  await handlers.handleServiceUnstaked(
    ctx,
    meta(3),
    contract,
    { ...params, reward: 60n, availableRewards: 0n },
    false,
  );
  expect(await handlers.getOrCreateGlobal(ctx)).toMatchObject({
    currentOlasStaked: 0n,
    cumulativeOlasStaked: 0n,
    totalRewards: 0n,
    totalRewardsClaimed: 0n,
  });
  expect(cache.all(RewardUpdate)).toHaveLength(0);
  expect(cache.all(ServiceRewardsHistory)[0].rewardAmount).toBe(60n);
  expect(cache.all(RewardClaimed)).toHaveLength(1);
});
it("records zero rewards and merges services staked into the next epoch without duplicates", async () => {
  const { ctx, cache, contract } = setup();
  await handlers.handleServiceStaked(ctx, meta(), contract, params);
  await handlers.handleServiceStaked(ctx, meta(1), contract, {
    ...params,
    serviceId: 2n,
    epoch: 2n,
  });
  await checkpoint(ctx, contract, 1n, [], [], 2);
  expect(
    cache.all(ServiceRewardsHistory).find((x) => x.id === `1-${address}-1`),
  ).toMatchObject({ rewardAmount: 0n, checkpointedAt: 86401n });
  expect(
    (
      await cache.get(ActiveServiceEpoch, `${address}-2`)
    )?.activeServiceIds.sort(),
  ).toEqual(["1", "2"]);
  await checkpoint(ctx, contract, 2n, [1n], [10n], 3);
  expect(ctx.services.get("1")?.totalEpochsParticipated).toBe(2);
  expect(ctx.services.get("2")?.totalEpochsParticipated).toBe(1);
});
it("does not create zero-reward history on an old contract after migration", async () => {
  const { ctx, cache, contract } = setup();
  await handlers.handleServiceStaked(ctx, meta(), contract, params);
  await checkpoint(ctx, contract);
  ctx.services.get("1")!.latestStakingContract = owner;
  await checkpoint(ctx, contract, 2n, [], [], 2);
  expect(
    await cache.get(ServiceRewardsHistory, `1-${address}-2`),
  ).toBeUndefined();
});
it("daily snapshots carry earnings forward on a claim-only day; median excludes non-OLAS services", async () => {
  const { ctx, cache, contract } = setup();
  await handlers.handleServiceStaked(ctx, meta(), contract, params);
  await handlers.handleServiceStaked(
    ctx,
    meta(1),
    new StakingContract({ ...contract, isOlasStaking: false }),
    { ...params, serviceId: 2n },
  );
  await checkpoint(ctx, contract, 1n, [1n], [101n], 2);
  await handlers.handleRewardClaimed(ctx, meta(3, 172801n), contract, {
    ...params,
    reward: 50n,
  });
  expect(
    cache
      .all(CumulativeDailyStakingGlobal)
      .find((x) => x.timestamp === 172800n),
  ).toMatchObject({
    totalRewards: 101n,
    totalRewardsClaimed: 50n,
    numServices: 1,
    medianCumulativeRewards: 101n,
  });
  expect(handlers.median([10n, 20n])).toBe(15n);
});
it("rejects malformed checkpoint arrays and missing service history", async () => {
  const { ctx, contract } = setup();
  await expect(checkpoint(ctx, contract, 1n, [1n], [])).rejects.toThrow(
    "array length",
  );
  await expect(checkpoint(ctx, contract)).rejects.toThrow(
    "Missing staked service",
  );
});
it("ignores foreign malformed logs and unsupported versions before decoding", async () => {
  const { ctx, contract } = setup();
  const reader = {
    config: async () => {
      throw new Error("Unexpected config read");
    },
  };
  await expect(
    dispatch(
      ctx,
      meta(0, 86401n, owner),
      { topics: [stakingProxy.ServiceStaked.topic], data: "0x" },
      reader,
    ),
  ).resolves.toBeUndefined();
  contract.eventsIndexed = false;
  await expect(
    dispatch(
      ctx,
      meta(),
      { topics: [stakingProxy.ServiceStaked.topic], data: "0x" },
      reader,
    ),
  ).resolves.toBeUndefined();
  contract.eventsIndexed = true;
  await expect(
    dispatch(
      ctx,
      meta(),
      { topics: [stakingProxy.ServiceStaked.topic], data: "0x" },
      reader,
    ),
  ).rejects.toThrow();
});
it("discovers a proxy then processes its events in the same batch", async () => {
  const { ctx, cache } = setup();
  const instance = owner;
  await dispatch(
    ctx,
    meta(0, 86401n, CHAIN.stakingFactory),
    stakingFactory.InstanceCreated.encode({
      sender: owner,
      instance,
      implementation: address,
    }),
    {
      config: async () => ({
        ...(await new StakingReader(
          async () => "0x",
          () => {},
        ).config(instance, 100n)),
        isOlasStaking: true,
        eventsIndexed: true,
      }),
    },
  );
  await dispatch(
    ctx,
    meta(1, 86401n, instance),
    stakingProxy.ServiceStaked.encode(params),
    {
      config: async () => {
        throw new Error("Unexpected config read");
      },
    },
  );
  expect(await cache.get(StakingContract, instance)).toMatchObject({
    instance,
    isOlasStaking: true,
  });
  expect(ctx.services.get("1")?.currentOlasStaked).toBe(300n);
});

it("continues Pearl's zero-reward epoch timeline after unstaking until migration", async () => {
  const { ctx, cache, contract } = setup();
  await handlers.handleServiceStaked(ctx, meta(), contract, params);
  await handlers.handleServiceStaked(ctx, meta(1), contract, { ...params, serviceId: 2n });
  await checkpoint(ctx, contract, 1n, [1n, 2n], [100n, 100n], 2);
  await handlers.handleServiceUnstaked(
    ctx, meta(3), contract,
    { ...params, epoch: 2n, reward: 100n, availableRewards: 800n }, false,
  );
  await checkpoint(ctx, contract, 2n, [2n], [100n], 4);
  await checkpoint(ctx, contract, 3n, [2n], [100n], 5);
  expect(ctx.services.get("1")?.latestStakingContract).toBeNull();
  expect(await cache.get(ServiceRewardsHistory, `1-${address}-3`)).toMatchObject({
    rewardAmount: 0n, checkpointedAt: 86401n,
  });
  expect(ctx.services.get("1")?.totalEpochsParticipated).toBe(3);

  const nextContract = new StakingContract({ ...contract, id: owner });
  await handlers.handleServiceStaked(ctx, meta(6, 86401n, owner), nextContract, params);
  await checkpoint(ctx, contract, 4n, [2n], [100n], 7);
  expect(await cache.get(ServiceRewardsHistory, `1-${address}-4`)).toBeUndefined();
  expect(ctx.services.get("1")?.totalEpochsParticipated).toBe(4);
});
