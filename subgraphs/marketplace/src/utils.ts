import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
  AgentMultisigAssociation,
  CreateMech,
  CreateMultisigWithAgents,
  Global,
  MechAgent,
  RequestsPerAgentOnchain,
  Sender,
  Service,
} from '../generated/schema';

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    
    // Marketplace-specific counters
    global.totalMechs = BigInt.fromI32(0);
    global.totalMarketplaceRequests = BigInt.fromI32(0);
    global.totalMarketplaceDeliveries = BigInt.fromI32(0);
    global.totalMarketplaceDeliveriesWithSignatures = BigInt.fromI32(0);
    
    // Legacy AgentMech-specific counters
    global.totalLegacyRequests = BigInt.fromI32(0);
    global.totalLegacyDeliveries = BigInt.fromI32(0);
    global.totalLegacyTransactions = BigInt.fromI32(0);
    global.totalLegacyAtaTransactions = BigInt.fromI32(0);
    
    // Combined/aggregate counters
    global.totalRequests = BigInt.fromI32(0);
    global.totalDeliveries = BigInt.fromI32(0);
    global.totalTransactions = BigInt.fromI32(0);
    global.totalAtaTransactions = BigInt.fromI32(0);
  }
  return global as Global;
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

export function getServiceIdFromAgentId(agentId: BigInt): string | null {
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

export function getServiceIdFromMultisig(multisig: Bytes): string | null {
  let entity = CreateMultisigWithAgents.load(multisig);
  if (entity !== null) {
    return entity.serviceId.toString();
  }
  return null;
}

export function getServiceIdFromMech(mech: Bytes): string | null {
  let createMechEntity = CreateMech.load(mech);
  // if null then it's new mech marketplace
  if (createMechEntity !== null && createMechEntity.agentId !== null) {
    let mechAgent = MechAgent.load(createMechEntity.agentId!.toHexString());
    if (mechAgent !== null) {
      if (mechAgent.service !== null) {
        return mechAgent.service;
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
    sender.totalLegacyRequests = BigInt.fromI32(0);
    sender.totalLegacyTransactions = BigInt.fromI32(0);
    sender.totalLegacyAtaTransactions = BigInt.fromI32(0);

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
