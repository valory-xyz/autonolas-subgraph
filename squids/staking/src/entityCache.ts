import * as models from "./model";
import type { Store } from "@subsquid/typeorm-store";
import {
  EntityCache as SharedEntityCache,
  assertFlushOrderExhaustive,
  type EntityClass,
} from "@olas/squid-shared";
import {
  ActiveServiceEpoch,
  Checkpoint,
  CumulativeDailyStakingGlobal,
  Deposit,
  Global,
  InstanceCreated,
  InstanceRemoved,
  InstanceStatusChanged,
  OwnerUpdated,
  RewardClaimed,
  RewardUpdate,
  Service,
  ServiceForceUnstaked,
  ServiceInactivityWarning,
  ServiceRewardsHistory,
  ServiceStaked,
  ServiceUnstaked,
  ServicesEvicted,
  StakingContract,
  VerifierUpdated,
  Withdraw,
} from "./model";
export const FLUSH_ORDER: EntityClass<{ id: string }>[] = [
  Global,
  Service,
  Checkpoint,
  StakingContract,
  InstanceCreated,
  InstanceRemoved,
  InstanceStatusChanged,
  OwnerUpdated,
  VerifierUpdated,
  Deposit,
  RewardClaimed,
  ServiceForceUnstaked,
  ServiceInactivityWarning,
  ServiceStaked,
  ServiceUnstaked,
  ServicesEvicted,
  Withdraw,
  RewardUpdate,
  ServiceRewardsHistory,
  ActiveServiceEpoch,
  CumulativeDailyStakingGlobal,
];
assertFlushOrderExhaustive(models, FLUSH_ORDER);
export class EntityCache extends SharedEntityCache {
  constructor(store: Store) {
    super(store, FLUSH_ORDER);
  }
}
