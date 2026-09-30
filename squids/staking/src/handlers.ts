import type { IEntityCache, EventMeta } from "@olas/squid-shared";
import {
  ActiveServiceEpoch,
  Checkpoint,
  CumulativeDailyStakingGlobal,
  Global,
  RewardClaimed,
  RewardUpdate,
  Service,
  ServiceForceUnstaked,
  ServiceRewardsHistory,
  ServiceStaked,
  ServiceUnstaked,
  StakingContract,
} from "./model";
import type * as stakingEvents from "./abi/StakingProxy/events";
import type { EventParams } from "./abi/abi.support";

export interface Ctx {
  cache: IEntityCache;
  // Fresh per batch: combines persisted services with in-batch writes for median/count.
  services: Map<string, Service>;
  lockedOlas(
    contract: StakingContract,
    serviceId: bigint,
    block: bigint,
  ): Promise<bigint>;
}
export function eventId(meta: EventMeta): string {
  // graph-ts Bytes.concatI32 appends the four-byte little-endian log index.
  const suffix = Buffer.alloc(4);
  suffix.writeInt32LE(meta.logIndex);
  return meta.txHash + suffix.toString("hex");
}
export interface EventFields {
  id: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export function eventFields(meta: EventMeta): EventFields {
  return {
    id: eventId(meta),
    blockNumber: meta.blockNumber,
    blockTimestamp: meta.blockTimestamp,
    transactionHash: meta.txHash,
  };
}
export async function getOrCreateGlobal(ctx: Ctx): Promise<Global> {
  let global = await ctx.cache.get(Global, "");
  if (!global) {
    global = new Global({
      id: "",
      cumulativeOlasStaked: 0n,
      cumulativeOlasUnstaked: 0n,
      currentOlasStaked: 0n,
      totalRewards: 0n,
      totalRewardsClaimed: 0n,
      lastActiveDayTimestamp: 0n,
    });
    ctx.cache.set(Global, global);
  }
  return global;
}
function saveService(ctx: Ctx, service: Service): void {
  ctx.services.set(service.id, service);
  ctx.cache.set(Service, service);
}
async function getOrCreateServiceRewardsHistory(
  ctx: Ctx,
  meta: EventMeta,
  serviceId: bigint,
  epoch: bigint,
): Promise<ServiceRewardsHistory> {
  const id = `${serviceId}-${meta.address}-${epoch}`;
  let history = await ctx.cache.get(ServiceRewardsHistory, id);
  if (!history) {
    const service = ctx.services.get(String(serviceId));
    // Full-history indexing must have observed the stake. Do not persist dangling FKs.
    if (!service)
      throw new Error(
        `Missing staked service ${serviceId} at ${meta.blockNumber}`,
      );
    history = new ServiceRewardsHistory({
      ...eventFields(meta),
      id,
      service,
      epoch,
      contractAddress: meta.address,
      checkpoint: null,
      rewardAmount: 0n,
      checkpointedAt: null,
    });
    service.totalEpochsParticipated++;
    saveService(ctx, service);
  }
  return history;
}
export function median(values: bigint[]): bigint {
  values.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(values.length / 2);
  return values.length === 0
    ? 0n
    : values.length % 2
      ? values[mid]
      : (values[mid - 1] + values[mid]) / 2n;
}
async function getOrCreateDailySnapshot(
  ctx: Ctx,
  meta: EventMeta,
): Promise<CumulativeDailyStakingGlobal> {
  const timestamp = (meta.blockTimestamp / 86400n) * 86400n;
  const id = "0x" + Buffer.from(String(timestamp)).toString("hex");
  let snapshot = await ctx.cache.get(CumulativeDailyStakingGlobal, id);
  if (!snapshot) {
    const global = await getOrCreateGlobal(ctx);
    const prev =
      global.lastActiveDayTimestamp === 0n
        ? undefined
        : await ctx.cache.get(
            CumulativeDailyStakingGlobal,
            "0x" +
              Buffer.from(String(global.lastActiveDayTimestamp)).toString(
                "hex",
              ),
          );
    snapshot = new CumulativeDailyStakingGlobal({
      id,
      timestamp,
      totalRewards: global.totalRewards,
      totalRewardsClaimed: global.totalRewardsClaimed,
      numServices: prev?.numServices ?? 0,
      medianCumulativeRewards: prev?.medianCumulativeRewards ?? 0n,
    });
  }
  snapshot.block = meta.blockNumber;
  return snapshot;
}
function createRewardUpdate(
  ctx: Ctx,
  meta: EventMeta,
  type: "Claimable" | "Claimed",
  amount: bigint,
): void {
  ctx.cache.set(
    RewardUpdate,
    new RewardUpdate({
      ...eventFields(meta),
      id: `${meta.txHash}-${meta.logIndex}`,
      type,
      amount,
    }),
  );
}
async function recordRewardsClaimed(
  ctx: Ctx,
  meta: EventMeta,
  amount: bigint,
): Promise<void> {
  const global = await getOrCreateGlobal(ctx);
  global.totalRewardsClaimed += amount;
  ctx.cache.set(Global, global);
  const snapshot = await getOrCreateDailySnapshot(ctx, meta);
  snapshot.totalRewardsClaimed = global.totalRewardsClaimed;
  ctx.cache.set(CumulativeDailyStakingGlobal, snapshot);
}
export async function handleServiceStaked(
  ctx: Ctx,
  meta: EventMeta,
  contract: StakingContract,
  params: EventParams<typeof stakingEvents.ServiceStaked>,
): Promise<void> {
  ctx.cache.set(
    ServiceStaked,
    new ServiceStaked({
      ...eventFields(meta),
      ...params,
      nonces: params.nonces.map(String),
    }),
  );
  const global = await getOrCreateGlobal(ctx);
  let service = ctx.services.get(String(params.serviceId));
  if (!service)
    service = new Service({
      id: String(params.serviceId),
      global,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      currentOlasStaked: 0n,
      currentStakeAmount: 0n,
      hasOlasStake: false,
      olasRewardsEarned: 0n,
      olasRewardsClaimed: 0n,
      totalEpochsParticipated: 0,
      latestStakingContract: null,
    });
  const amount = contract.isOlasStaking
    ? await ctx.lockedOlas(contract, params.serviceId, meta.blockNumber)
    : 0n;
  service.currentOlasStaked += amount;
  service.currentStakeAmount = amount;
  service.hasOlasStake ||= contract.isOlasStaking;
  service.latestStakingContract = meta.address;
  saveService(ctx, service);
  const id = `${meta.address}-${params.epoch}`;
  let tracker = await ctx.cache.get(ActiveServiceEpoch, id);
  if (!tracker)
    tracker = new ActiveServiceEpoch({
      id,
      contractAddress: meta.address,
      epoch: params.epoch,
      activeServiceIds: [],
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
    });
  if (!tracker.activeServiceIds.includes(String(params.serviceId)))
    tracker.activeServiceIds.push(String(params.serviceId));
  ctx.cache.set(ActiveServiceEpoch, tracker);
  ctx.cache.set(
    ServiceRewardsHistory,
    await getOrCreateServiceRewardsHistory(
      ctx,
      meta,
      params.serviceId,
      params.epoch,
    ),
  );
  global.cumulativeOlasStaked += amount;
  global.currentOlasStaked += amount;
  ctx.cache.set(Global, global);
}
export async function handleCheckpoint(
  ctx: Ctx,
  meta: EventMeta,
  contract: StakingContract,
  params: EventParams<typeof stakingEvents.Checkpoint>,
): Promise<void> {
  if (params.serviceIds.length !== params.rewards.length)
    throw new Error("Checkpoint reward array length mismatch");
  const row = new Checkpoint({
    ...eventFields(meta),
    ...params,
    contractAddress: meta.address,
    serviceIds: params.serviceIds.map(String),
    rewards: params.rewards.map(String),
  });
  ctx.cache.set(Checkpoint, row);
  const handled = new Set<string>();
  let total = 0n;
  for (let i = 0; i < params.serviceIds.length; i++) {
    const id = String(params.serviceIds[i]);
    const reward = params.rewards[i];
    total += reward;
    handled.add(id);
    const service = ctx.services.get(id);
    if (service && contract.isOlasStaking) {
      service.olasRewardsEarned += reward;
      saveService(ctx, service);
    }
    const history = await getOrCreateServiceRewardsHistory(
      ctx,
      meta,
      params.serviceIds[i],
      params.epoch,
    );
    history.rewardAmount = reward;
    history.checkpoint = row;
    history.checkpointedAt = meta.blockTimestamp;
    ctx.cache.set(ServiceRewardsHistory, history);
  }
  const tracker = await ctx.cache.get(
    ActiveServiceEpoch,
    `${meta.address}-${params.epoch}`,
  );
  if (tracker) {
    for (const id of tracker.activeServiceIds) {
      if (handled.has(id)) continue;
      const service = ctx.services.get(id);
      // Pearl needs a continuous epoch timeline, including zero-reward epochs
      // after unstaking. A null contract intentionally continues this history;
      // stop only once the service stakes in a different contract.
      if (
        service?.latestStakingContract &&
        service.latestStakingContract !== meta.address
      )
        continue;
      const history = await getOrCreateServiceRewardsHistory(
        ctx,
        meta,
        BigInt(id),
        params.epoch,
      );
      history.rewardAmount = 0n;
      history.checkpoint = row;
      history.checkpointedAt = meta.blockTimestamp;
      ctx.cache.set(ServiceRewardsHistory, history);
    }
    const epoch = params.epoch + 1n;
    const id = `${meta.address}-${epoch}`;
    let next = await ctx.cache.get(ActiveServiceEpoch, id);
    if (!next)
      next = new ActiveServiceEpoch({
        id,
        contractAddress: meta.address,
        epoch,
        activeServiceIds: [],
      });
    next.activeServiceIds = [
      ...new Set([...next.activeServiceIds, ...tracker.activeServiceIds]),
    ];
    next.blockNumber = meta.blockNumber;
    next.blockTimestamp = meta.blockTimestamp;
    ctx.cache.set(ActiveServiceEpoch, next);
  }
  if (!contract.isOlasStaking) return;
  const global = await getOrCreateGlobal(ctx);
  global.totalRewards += total;
  const snapshot = await getOrCreateDailySnapshot(ctx, meta);
  const services = [...ctx.services.values()].filter(
    (service) => service.hasOlasStake,
  );
  snapshot.totalRewards = global.totalRewards;
  snapshot.totalRewardsClaimed = global.totalRewardsClaimed;
  snapshot.numServices = services.length;
  snapshot.medianCumulativeRewards = median(
    services.map((service) => service.olasRewardsEarned),
  );
  global.lastActiveDayTimestamp = snapshot.timestamp;
  ctx.cache.set(Global, global);
  ctx.cache.set(CumulativeDailyStakingGlobal, snapshot);
  createRewardUpdate(ctx, meta, "Claimable", total);
}
export async function handleRewardClaimed(
  ctx: Ctx,
  meta: EventMeta,
  contract: StakingContract,
  params: EventParams<typeof stakingEvents.RewardClaimed>,
): Promise<void> {
  ctx.cache.set(
    RewardClaimed,
    new RewardClaimed({
      ...eventFields(meta),
      ...params,
      nonces: params.nonces.map(String),
    }),
  );
  if (!contract.isOlasStaking) return;
  const service = ctx.services.get(String(params.serviceId));
  if (service) {
    service.olasRewardsClaimed += params.reward;
    saveService(ctx, service);
  }
  createRewardUpdate(ctx, meta, "Claimed", params.reward);
  await recordRewardsClaimed(ctx, meta, params.reward);
}
export async function handleServiceUnstaked(
  ctx: Ctx,
  meta: EventMeta,
  contract: StakingContract,
  params: EventParams<typeof stakingEvents.ServiceUnstaked>,
  forced: boolean,
): Promise<void> {
  const fields = {
    ...eventFields(meta),
    ...params,
    nonces: params.nonces.map(String),
  };
  if (forced)
    ctx.cache.set(ServiceForceUnstaked, new ServiceForceUnstaked(fields));
  else ctx.cache.set(ServiceUnstaked, new ServiceUnstaked(fields));
  const paid = !forced && contract.isOlasStaking;
  const service = ctx.services.get(String(params.serviceId));
  const amount = service?.currentStakeAmount ?? 0n;
  if (service) {
    service.latestStakingContract = null;
    if (paid) service.olasRewardsClaimed += params.reward;
    service.currentOlasStaked -= amount;
    service.currentStakeAmount = 0n;
    saveService(ctx, service);
  }
  const history = await getOrCreateServiceRewardsHistory(
    ctx,
    meta,
    params.serviceId,
    params.epoch,
  );
  history.rewardAmount = params.reward;
  ctx.cache.set(ServiceRewardsHistory, history);
  const global = await getOrCreateGlobal(ctx);
  global.cumulativeOlasUnstaked += amount;
  global.currentOlasStaked -= amount;
  ctx.cache.set(Global, global);
  if (paid) {
    createRewardUpdate(ctx, meta, "Claimed", params.reward);
    await recordRewardsClaimed(ctx, meta, params.reward);
  }
}
