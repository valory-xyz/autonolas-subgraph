import { Address, BigInt } from '@graphprotocol/graph-ts';
import {
  Approval as ApprovalEvent,
  ApprovalForAll as ApprovalForAllEvent,
  BaseURIChanged as BaseURIChangedEvent,
  CreateAgent as CreateAgentEvent,
  ManagerUpdated as ManagerUpdatedEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  Transfer as TransferEvent,
  UpdateAgentHash as UpdateAgentHashEvent,
} from '../generated/AgentRegistry/AgentRegistry';
import {
  AgentMultisigAssociation,
  Approval,
  ApprovalForAll,
  BaseURIChanged,
  CreateAgent,
  ManagerUpdated,
  MechAgent,
  OwnerUpdated,
  Transfer,
  UpdateAgentHash,
} from '../generated/schema';
import {
  getOrCreateAgentMultisigAssociation,
  getServiceIdFromMultisig,
} from './utils';

export function handleApproval(event: ApprovalEvent): void {
  let entity = new Approval(
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
  let entity = new ApprovalForAll(
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
  let entity = new BaseURIChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.baseURI = event.params.baseURI;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleCreateAgent(event: CreateAgentEvent): void {
  let entity = new CreateAgent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.agentId = event.params.agentId;
  entity.agentHash = event.params.agentHash;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let mechAgent = MechAgent.load(event.params.agentId.toHexString());

  if (mechAgent !== null) {
    mechAgent.agentHash = event.params.agentHash;
    mechAgent.save();
  } else {
    mechAgent = new MechAgent(event.params.agentId.toHexString());
    mechAgent.agentHash = event.params.agentHash;
    mechAgent.totalTransactions = BigInt.fromI32(0);
    mechAgent.save();
  }
}

export function handleManagerUpdated(event: ManagerUpdatedEvent): void {
  let entity = new ManagerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.manager = event.params.manager;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleOwnerUpdated(event: OwnerUpdatedEvent): void {
  let entity = new OwnerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.AgentRegistry_id = event.params.id;

  // If the agent is minted, to address is the operator -> multisig
  if (event.params.from.equals(Address.zero())) {
    let agentMultisigAssociation = getOrCreateAgentMultisigAssociation(event);
    agentMultisigAssociation.agentId = event.params.id;
    agentMultisigAssociation.multisig = event.params.to;
    agentMultisigAssociation.save();

    // Update MechAgent service field if it exists and service is not already set
    let mechAgent = MechAgent.load(event.params.id.toHexString());
    if (mechAgent !== null && mechAgent.service === null) {
      let serviceId = getServiceIdFromMultisig(event.params.to);
      if (serviceId !== null) {
        mechAgent.service = serviceId;
        mechAgent.save();
      }
    }
  }

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleUpdateAgentHash(event: UpdateAgentHashEvent): void {
  let entity = new UpdateAgentHash(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.agentId = event.params.agentId;
  entity.agentHash = event.params.agentHash;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let mechAgent = MechAgent.load(event.params.agentId.toHexString());

  if (mechAgent !== null) {
    mechAgent.agentHash = event.params.agentHash;
    mechAgent.save();
  }
}
