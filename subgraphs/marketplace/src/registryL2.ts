import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  CreateService as CreateServiceEvent,
  UpdateService as UpdateServiceEvent,
  CreateMultisigWithAgents as CreateMultisigWithAgentsEvent,
  RegisterInstance as RegisterInstanceEvent,
  TerminateService as TerminateServiceEvent,
  Transfer as TransferEvent,
} from '../generated/ServiceRegistryL2/ServiceRegistryL2';
import { CreateService, UpdateService, Service, MechAgent, Mech, Transfer, RegisterInstance, TerminateService } from '../generated/schema';
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
  let service = new Service(Bytes.fromHexString(event.params.serviceId.toHexString()));
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
  let service = Service.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
  if (service !== null) {
    service.configHash = event.params.configHash;
    service.save();
  }

  // Update Mech entity with hash
  let mech = Mech.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
  if (mech !== null) {
    mech.configHash = event.params.configHash;
    mech.save();
  }
}

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.internal_id = event.params.id;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Update Mech entity with owner
  let mechAgent = Mech.load(Bytes.fromHexString(event.params.id.toHexString()));
  if (mechAgent !== null) {
    mechAgent.owner = event.params.to;
    mechAgent.save();
  }
}

export function handleRegisterInstance(event: RegisterInstanceEvent): void {
  let entity = new RegisterInstance(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.operator = event.params.operator;
  entity.serviceId = event.params.serviceId;
  entity.agentInstance = event.params.agentInstance;
  entity.agentId = event.params.agentId;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let service = Service.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
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
      mechAgent.service = Bytes.fromHexString(event.params.serviceId.toHexString());
      mechAgent.save();
    }
  }
}

export function handleTerminateService(event: TerminateServiceEvent): void {
  let entity = new TerminateService(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.serviceId = event.params.serviceId;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let service = Service.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
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


  // Update Service entity
  let service = Service.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
  if (service !== null) {
    service.latestMultisig = event.params.multisig;

    let historicalMultisigs = service.historicalMultisigs;
    if (!historicalMultisigs.includes(event.params.multisig)) {
      historicalMultisigs.push(event.params.multisig);
      service.historicalMultisigs = historicalMultisigs;
    }

    service.save();
  }

  entity.save();
}
