import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
  AgentMultisigAssociation,
  CreateMech,
  CreateMultisigWithAgents,
  LegacyGlobal as Global,
  MechAgent,
  RequestsPerAgentOnchain,
  Sender,
  Service,
} from '../generated/schema';
import { Transfer as TransferEvent } from '../generated/AgentRegistry/AgentRegistry';
import { CreateMech as CreateMechEvent } from '../generated/AgentFactory/AgentFactory';

export function getOddBigIntBytes(bigInt: BigInt): Bytes {
  return Bytes.fromHexString(Bytes.fromBigInt(bigInt).toHexString());
}

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    global.totalRequests = BigInt.fromI32(0);
    global.totalDeliveries = BigInt.fromI32(0);
    global.totalTransactions = BigInt.fromI32(0);
    global.totalAtaTransactions = BigInt.fromI32(0);
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

export function updateServiceMultisig(
  serviceId: BigInt,
  multisig: Bytes
): void {
  let service = Service.load(serviceId.toString());
  if (service === null) {
    return;
  }

  service.latestMultisig = multisig;

  let historicalMultisigs = service.historicalMultisigs;
  if (!historicalMultisigs.includes(multisig)) {
    historicalMultisigs.push(multisig);
    service.historicalMultisigs = historicalMultisigs;
  }

  service.save();
}

export function getOrCreateAgentMultisigAssociation(
  event: TransferEvent
): AgentMultisigAssociation {
  let entity = AgentMultisigAssociation.load(event.params.id.toString());
  if (entity === null) {
    entity = new AgentMultisigAssociation(event.params.id.toString());
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

export function getServiceIdFromAgentId(agentId: BigInt): Bytes | null {
  log.info("Getting service ID from agent ID: {}", [agentId.toString()]);
  let agentMultisigAssociation = AgentMultisigAssociation.load(
    agentId.toString()
  );
  if (agentMultisigAssociation !== null) {
    log.info("Agent multisig association found for agent ID: {}", [agentId.toString()]);
    log.info("Multisig: {}", [agentMultisigAssociation.multisig.toHexString()]);
    return getServiceIdFromMultisig(agentMultisigAssociation.multisig);
  }

  log.info("No agent multisig association found for agent ID: {}", [agentId.toString()]);
  return null;
}

export function getServiceIdFromMultisig(multisig: Bytes): Bytes | null {
  let entity = CreateMultisigWithAgents.load(multisig);
  if (entity !== null) {
    return getOddBigIntBytes(entity.serviceId);
  }
  return null;
}

export function getServiceIdFromMech(mech: Bytes): Bytes | null {
  let createMechEntity = CreateMech.load(mech);
  // if null then it's new mech marketplace
  if (createMechEntity !== null && createMechEntity.agentId !== null) {
    let mechAgent = MechAgent.load(createMechEntity.agentId!.toString());
    if (mechAgent !== null) {
      if (mechAgent.service !== null && mechAgent.service.toString().length > 0) {
        let serviceId = BigInt.fromString(mechAgent.service.toString());
        return getOddBigIntBytes(serviceId);
      }
      // Fallback: try to get service ID from agent ID
      return getServiceIdFromAgentId(createMechEntity.agentId!);
    }
  }
  return null;
}

export function getOrCreateSender(address: Bytes): Sender {
  let sender = Sender.load(address);
  if (sender === null) {
    sender = new Sender(address);
    sender.totalRequests = BigInt.fromI32(0);
    sender.totalTransactions = BigInt.fromI32(0);
    sender.totalAtaTransactions = BigInt.fromI32(0);

    // Marketplace-only counters
    sender.totalMarketplaceRequests = BigInt.fromI32(0);
    sender.totalOffChainRequests = BigInt.fromI32(0);
  }
  return sender as Sender;
}

export function getOrCreateRequestsPerAgentOnchain(
  agentId: BigInt
): RequestsPerAgentOnchain {
  let id = agentId.toString();
  let requestPerAgent = RequestsPerAgentOnchain.load(id);
  if (requestPerAgent == null) {
    requestPerAgent = new RequestsPerAgentOnchain(id);
    requestPerAgent.requestsCount = BigInt.fromI32(0);
  }
  return requestPerAgent as RequestsPerAgentOnchain;
}
