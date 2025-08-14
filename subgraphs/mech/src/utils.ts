import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  AgentMultisigAssociation,
  CreateMech,
  CreateMultisigWithAgents,
  Global,
  MechAgent,
} from '../generated/schema';
import { Transfer as TransferEvent } from '../generated/AgentRegistry/AgentRegistry';
import { CreateMech as CreateMechEvent } from '../generated/AgentFactory/AgentFactory';

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    global.totalRequests = 0;
    global.totalDeliveries = 0;
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

export const ZERO_ADDRESS = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);

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
  let entity = CreateMech.load(event.params.mech.toHexString());
  if (entity === null) {
    entity = new CreateMech(event.params.mech.toHexString());
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
  let createMechEntity = CreateMech.load(mech.toHexString());
  if (createMechEntity !== null) {
    let mechAgent = MechAgent.load(createMechEntity.agentId.toHexString());
    if (mechAgent !== null) {
      return mechAgent.service;
    }
  }
  return null;
}
