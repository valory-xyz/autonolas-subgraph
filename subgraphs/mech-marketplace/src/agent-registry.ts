import {
  Approval as ApprovalEvent,
  ApprovalForAll as ApprovalForAllEvent,
  BaseURIChanged as BaseURIChangedEvent,
  CreateAgent as CreateAgentEvent,
  ManagerUpdated as ManagerUpdatedEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  Transfer as TransferEvent,
  UpdateAgentHash as UpdateAgentHashEvent,
} from '../../mech/generated/AgentRegistry/AgentRegistry';
import {
  LegacyApproval,
  LegacyApprovalForAll,
  LegacyBaseURIChanged,
  LegacyCreateAgent,
  LegacyManagerUpdated,
  LegacyMechAgent,
  LegacyOwnerUpdated,
  LegacyTransfer,
  LegacyUpdateAgentHash,
} from '../generated/schema';

export function handleApproval(event: ApprovalEvent): void {
  let entity = new LegacyApproval(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;
  entity.spender = event.params.spender;
  entity.AgentRegistry_id = event.params.id;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleApprovalForAll(event: ApprovalForAllEvent): void {
  let entity = new LegacyApprovalForAll(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;
  entity.operator = event.params.operator;
  entity.approved = event.params.approved;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleBaseURIChanged(event: BaseURIChangedEvent): void {
  let entity = new LegacyBaseURIChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.baseURI = event.params.baseURI;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleCreateAgent(event: CreateAgentEvent): void {
  let entity = new LegacyCreateAgent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.agentId = event.params.agentId;
  entity.agentHash = event.params.agentHash;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let mechAgent = LegacyMechAgent.load(event.params.agentId.toHexString());

  if (mechAgent !== null) {
    mechAgent.agentHash = event.params.agentHash;
    mechAgent.save();
  } else {
    mechAgent = new LegacyMechAgent(event.params.agentId.toHexString());
    mechAgent.agentHash = event.params.agentHash;
    mechAgent.save();
  }
}

export function handleManagerUpdated(event: ManagerUpdatedEvent): void {
  let entity = new LegacyManagerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.manager = event.params.manager;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
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

export function handleTransfer(event: TransferEvent): void {
  let entity = new LegacyTransfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.AgentRegistry_id = event.params.id;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleUpdateAgentHash(event: UpdateAgentHashEvent): void {
  let entity = new LegacyUpdateAgentHash(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.agentId = event.params.agentId;
  entity.agentHash = event.params.agentHash;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let mechAgent = LegacyMechAgent.load(event.params.agentId.toHexString());

  if (mechAgent !== null) {
    mechAgent.agentHash = event.params.agentHash;
    mechAgent.save();
  }
}
