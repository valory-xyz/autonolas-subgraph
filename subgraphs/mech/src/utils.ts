import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  AgentMultisigAssociation,
  CreateMech,
  CreateMultisigWithAgents,
  Global,
  Sender,
  MechAgent,
  RequestsPerAgentOnchain,
} from '../generated/schema';
import { Transfer as TransferEvent } from '../generated/AgentRegistry/AgentRegistry';
import { CreateMech as CreateMechEvent } from '../generated/AgentFactory/AgentFactory';

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    global.totalRequests = 0;
    global.totalDeliveries = 0;
    global.totalTransactions = 0;
    global.totalAtaTransactions = 0;
  }
  return global as Global;
}

export function getOrCreateMultisigWithAgents(
  multisig: Bytes
): CreateMultisigWithAgents {
  let entity = CreateMultisigWithAgents.load(multisig);
  if (entity === null) {
    entity = new CreateMultisigWithAgents(multisig);
  }
  return entity;
}

export function getOrCreateAgentMultisigAssociation(
  event: TransferEvent
): AgentMultisigAssociation {
  let entity = AgentMultisigAssociation.load(event.params.id.toHexString());
  if (entity === null) {
    entity = new AgentMultisigAssociation(event.params.id.toHexString());
  }
  return entity;
}

export function getOrCreateCreateMechEntity(
  event: CreateMechEvent
): CreateMech {
  let entity = CreateMech.load(event.params.mech);
  if (entity === null) {
    entity = new CreateMech(event.params.mech);
  }
  return entity;
}

export function getServiceIdFromAgentId(agentId: BigInt): string | null {
  let agentMultisigAssociation = AgentMultisigAssociation.load(
    agentId.toHexString()
  );
  if (agentMultisigAssociation !== null) {
    return getServiceIdFromMultisig(agentMultisigAssociation.multisig);
  }
  return null;
}

export function getServiceIdFromMultisig(multisig: Bytes): string | null {
  let entity = CreateMultisigWithAgents.load(multisig);
  if (entity !== null) {
    return entity.serviceId.toString();
  }
  return null;
}

export function getServiceIdFromMech(mech: Bytes): string | null {
  let createMechEntity = CreateMech.load(mech);
  if (createMechEntity !== null) {
    let mechAgent = MechAgent.load(createMechEntity.agentId.toHexString());
    if (mechAgent !== null) {
      if (mechAgent.service !== null) {
        return mechAgent.service;
      }
      // Fallback: try to get service ID from agent ID
      return getServiceIdFromAgentId(createMechEntity.agentId);
    }
  }
  return null;
}

export function getOrCreateSender(address: Bytes): Sender {
  let sender = Sender.load(address);
  if (sender === null) {
    sender = new Sender(address);
    sender.totalRequests = 0;
    sender.totalTransactions = 0;
    sender.totalAtaTransactions = 0;
  }
  return sender as Sender;
}

export function getOrCreateRequestsPerAgentOnchain(
  agentId: BigInt
): RequestsPerAgentOnchain {
  let id = agentId.toString();
  let entity = RequestsPerAgentOnchain.load(id);
  if (entity == null) {
    entity = new RequestsPerAgentOnchain(id);
    entity.RequestsCount = BigInt.fromI32(0);
  }
  return entity as RequestsPerAgentOnchain;
}
