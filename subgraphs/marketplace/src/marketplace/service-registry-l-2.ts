import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  ActivateRegistration as ActivateRegistrationEvent,
  CreateMultisigWithAgents as CreateMultisigWithAgentsEvent,
  CreateService as CreateServiceEvent,
  DeployService as DeployServiceEvent,
  Deposit as DepositEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  RegisterInstance as RegisterInstanceEvent,
  TerminateService as TerminateServiceEvent,
  Transfer as TransferEvent,
  UpdateService as UpdateServiceEvent,
} from '../../generated/ServiceRegistryL2/ServiceRegistryL2';
import {
  ActivateRegistration,
  CreateService,
  DeployService,
  Deposit,
  Mech,
  OwnerUpdated,
  RegisterInstance,
  TerminateService,
  Service,
  Transfer,
  UpdateService,
} from '../../generated/schema';
import { getOrCreateMultisigWithAgents } from './utils';

export function handleActivateRegistration(
  event: ActivateRegistrationEvent
): void {
  let entity = new ActivateRegistration(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.serviceId = event.params.serviceId;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
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

  // Update MarketplaceService entity
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

  // Create MarketplaceService entity
  let service = new Service(Bytes.fromHexString(event.params.serviceId.toHexString()));
  service.serviceId = event.params.serviceId;
  service.configHash = event.params.configHash;
  service.historicalMultisigs = [];
  service.totalRequests = BigInt.fromI32(0);
  service.totalDeliveries = BigInt.fromI32(0);
  service.agentIds = [];
  service.save();
}

export function handleDeployService(event: DeployServiceEvent): void {
  let entity = new DeployService(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.serviceId = event.params.serviceId;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleDeposit(event: DepositEvent): void {
  let entity = new Deposit(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.sender = event.params.sender;
  entity.amount = event.params.amount;

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

  // Maintain the current canonical agent set for the service
  let service = Service.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
  if (service !== null) {
    let agentIds = service.agentIds;
    let agentIdFound = false;
    for (let i = 0; i < agentIds.length; i++) {
      if (agentIds[i].equals(event.params.agentId)) {
        agentIdFound = true;
        break;
      }
    }
    if (!agentIdFound) {
      agentIds.push(event.params.agentId);
      service.agentIds = agentIds;
      service.save();
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

  // Clear current canonical agent set on termination
  let service = Service.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
  if (service !== null) {
    service.agentIds = [];
    service.save();
  }
}

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.from = event.params.from;
  entity.to = event.params.to;
  // entity.ServiceRegistryL2_id = event.params.id;

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

  // Update MarketplaceService entity
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
