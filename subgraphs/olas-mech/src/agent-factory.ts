import {
  CreateMech as CreateMechEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  Pause as PauseEvent,
  Unpause as UnpauseEvent,
} from '../../mech/generated/AgentFactory/AgentFactory';
import { AgentMech } from '../../mech/generated/templates';
import {
  LegacyCreateMech,
  LegacyMechAgent,
  LegacyOwnerUpdated,
  LegacyPause,
  LegacyUnpause,
} from '../generated/schema';

export function handleCreateMech(event: CreateMechEvent): void {
  let entity = new LegacyCreateMech(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.mech = event.params.mech;
  entity.agentId = event.params.agentId;
  entity.price = event.params.price;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let mechAgent = LegacyMechAgent.load(event.params.agentId.toHexString());

  // Mech is created after agent, which already handles mechAgent creation
  // add this check just in case
  if (mechAgent !== null) {
    mechAgent.mech = event.params.mech;
    mechAgent.save();
  } else {
    mechAgent = new LegacyMechAgent(event.params.agentId.toHexString());
    mechAgent.mech = event.params.mech;
    mechAgent.save();
  }

  AgentMech.create(event.params.mech);
}

export function handleOwnerUpdated(event: OwnerUpdatedEvent): void {
  let entity = new LegacyOwnerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handlePause(event: PauseEvent): void {
  let entity = new LegacyPause(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleUnpause(event: UnpauseEvent): void {
  let entity = new LegacyUnpause(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
