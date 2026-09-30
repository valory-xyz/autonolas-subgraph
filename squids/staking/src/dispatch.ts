import * as stakingFactory from "./abi/StakingFactory/events";
import * as stakingProxy from "./abi/StakingProxy/events";
import {
  Deposit,
  InstanceCreated,
  InstanceRemoved,
  InstanceStatusChanged,
  OwnerUpdated,
  ServiceInactivityWarning,
  ServicesEvicted,
  StakingContract,
  VerifierUpdated,
  Withdraw,
} from "./model";
import * as handlers from "./handlers";
import type { Ctx } from "./handlers";
import type { EventMeta } from "@olas/squid-shared";
import type { StakingReader } from "./rpc";
import { CHAIN } from "./constants";

type Log = { topics: string[]; data: string };
export async function dispatch(
  ctx: Ctx,
  meta: EventMeta,
  log: Log,
  reader: Pick<StakingReader, "config">,
): Promise<void> {
  const topic = log.topics[0];
  const fields = handlers.eventFields(meta);
  if (meta.address === CHAIN.stakingFactory) {
    switch (topic) {
      case stakingFactory.InstanceCreated.topic: {
        const params = stakingFactory.InstanceCreated.decode(log);
        ctx.cache.set(
          InstanceCreated,
          new InstanceCreated({ ...fields, ...params }),
        );
        const instance = params.instance.toLowerCase();
        ctx.cache.set(
          StakingContract,
          new StakingContract({
            id: instance,
            ...params,
            ...(await reader.config(instance, meta.blockNumber)),
          }),
        );
        break;
      }
      case stakingFactory.InstanceRemoved.topic:
        ctx.cache.set(
          InstanceRemoved,
          new InstanceRemoved({
            ...fields,
            ...stakingFactory.InstanceRemoved.decode(log),
          }),
        );
        break;
      case stakingFactory.InstanceStatusChanged.topic:
        ctx.cache.set(
          InstanceStatusChanged,
          new InstanceStatusChanged({
            ...fields,
            ...stakingFactory.InstanceStatusChanged.decode(log),
          }),
        );
        break;
      case stakingFactory.OwnerUpdated.topic:
        ctx.cache.set(
          OwnerUpdated,
          new OwnerUpdated({
            ...fields,
            ...stakingFactory.OwnerUpdated.decode(log),
          }),
        );
        break;
      case stakingFactory.VerifierUpdated.topic:
        ctx.cache.set(
          VerifierUpdated,
          new VerifierUpdated({
            ...fields,
            ...stakingFactory.VerifierUpdated.decode(log),
          }),
        );
        break;
    }
    return;
  }
  // Unrelated emitters can share a topic with a different indexed layout.
  // Known emitters must decode successfully; a corrupt known log fails the batch.
  const contract = await ctx.cache.get(StakingContract, meta.address);
  if (!contract?.eventsIndexed) return;
  switch (topic) {
    case stakingProxy.ServiceStaked.topic:
      await handlers.handleServiceStaked(
        ctx,
        meta,
        contract,
        stakingProxy.ServiceStaked.decode(log),
      );
      break;
    case stakingProxy.Checkpoint.topic:
      await handlers.handleCheckpoint(
        ctx,
        meta,
        contract,
        stakingProxy.Checkpoint.decode(log),
      );
      break;
    case stakingProxy.RewardClaimed.topic:
      await handlers.handleRewardClaimed(
        ctx,
        meta,
        contract,
        stakingProxy.RewardClaimed.decode(log),
      );
      break;
    case stakingProxy.ServiceUnstaked.topic:
      await handlers.handleServiceUnstaked(
        ctx,
        meta,
        contract,
        stakingProxy.ServiceUnstaked.decode(log),
        false,
      );
      break;
    case stakingProxy.ServiceForceUnstaked.topic:
      await handlers.handleServiceUnstaked(
        ctx,
        meta,
        contract,
        stakingProxy.ServiceForceUnstaked.decode(log),
        true,
      );
      break;
    case stakingProxy.Deposit.topic:
      ctx.cache.set(
        Deposit,
        new Deposit({ ...fields, ...stakingProxy.Deposit.decode(log) }),
      );
      break;
    case stakingProxy.Withdraw.topic:
      ctx.cache.set(
        Withdraw,
        new Withdraw({ ...fields, ...stakingProxy.Withdraw.decode(log) }),
      );
      break;
    case stakingProxy.ServiceInactivityWarning.topic:
      ctx.cache.set(
        ServiceInactivityWarning,
        new ServiceInactivityWarning({
          ...fields,
          ...stakingProxy.ServiceInactivityWarning.decode(log),
        }),
      );
      break;
    case stakingProxy.ServicesEvicted.topic: {
      const params = stakingProxy.ServicesEvicted.decode(log);
      ctx.cache.set(
        ServicesEvicted,
        new ServicesEvicted({
          ...fields,
          ...params,
          serviceIds: params.serviceIds.map(String),
          serviceInactivity: params.serviceInactivity.map(String),
        }),
      );
      break;
    }
  }
}
