import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  CreateService as CreateServiceEvent,
  UpdateService as UpdateServiceEvent,
  CreateMultisigWithAgents as CreateMultisigWithAgentsEvent,
  RegisterInstance as RegisterInstanceEvent,
  TerminateService as TerminateServiceEvent,
} from '../generated/ServiceRegistryL2/ServiceRegistryL2';
import { CreateService, UpdateService, Service, MechAgent } from '../generated/schema';
import { getOrCreateMultisigWithAgents } from './utils';

export function handleCreateService(event: CreateServiceEvent): void {
  let entity = new CreateService(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.serviceId = event.params.serviceId;
  entity.configHash = event.params.configHash;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Create  Service entity
  let service = new Service(event.params.serviceId.toString());
  service.serviceId = event.params.serviceId;
  service.historicalMultisigs = [];
  service.configHash = event.params.configHash;
  service.totalRequests = BigInt.fromI32(0);
  service.totalDeliveries = BigInt.fromI32(0);
  service.agentIds = [];
  service.save();
}

export function handleUpdateService(event: UpdateServiceEvent): void {
  let entity = new UpdateService(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.serviceId = event.params.serviceId;
  entity.configHash = event.params.configHash;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Update Service entity
  let service = Service.load(event.params.serviceId.toString());
  if (service !== null) {
    service.configHash = event.params.configHash;
    service.save();
  }
}

export function handleRegisterInstance(event: RegisterInstanceEvent): void {
  let service = Service.load(event.params.serviceId.toString());
  if (service !== null) {
    let ids = service.agentIds;
    let agentIdFound = false;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i].equals(event.params.agentId)) {
        agentIdFound = true;
        break;
      }
    }
    if (!agentIdFound) {
      ids.push(event.params.agentId);
      service.agentIds = ids;
      service.save();
    }

    // Update MechAgent.service to link the agent to its registered service
    let mechAgent = MechAgent.load(event.params.agentId.toHexString());
    if (mechAgent !== null) {
      mechAgent.service = event.params.serviceId.toString();
      mechAgent.save();
    }
  }
}

export function handleTerminateService(event: TerminateServiceEvent): void {
  let service = Service.load(event.params.serviceId.toString());
  if (service !== null) {
    service.agentIds = [];
    service.save();
  }
}

export function handleCreateMultisigWithAgents(
  event: CreateMultisigWithAgentsEvent
): void {
  let entity = getOrCreateMultisigWithAgents(event.params.multisig);
  entity.serviceId = event.params.serviceId;
  entity.multisig = event.params.multisig;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Update Service entity
  let service = Service.load(event.params.serviceId.toString());
  if (service !== null) {
    service.latestMultisig = event.params.multisig;

    let historicalMultisigs = service.historicalMultisigs;
    if (!historicalMultisigs.includes(event.params.multisig)) {
      historicalMultisigs.push(event.params.multisig);
      service.historicalMultisigs = historicalMultisigs;
    }

    service.save();
  }
}
