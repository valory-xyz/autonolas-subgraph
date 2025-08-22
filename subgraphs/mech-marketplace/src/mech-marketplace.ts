import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  CreateMech as CreateMechEvent,
  Deliver as DeliverWithSignaturesEvent,
  ImplementationUpdated as ImplementationUpdatedEvent,
  MarketplaceDelivery as MarketplaceDeliveryEvent,
  MarketplaceDeliveryWithSignatures as MarketplaceDeliveryWithSignaturesEvent,
  MarketplaceParamsUpdated as MarketplaceParamsUpdatedEvent,
  MarketplaceRequest as MarketplaceRequestEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  SetMechFactoryStatuses as SetMechFactoryStatusesEvent,
  SetPaymentTypeBalanceTrackers as SetPaymentTypeBalanceTrackersEvent,
} from '../generated/MechMarketplaceV2/MechMarketplaceV2';
import { Deliver as DeliverWithSignaturesEventV1 } from '../generated/MechMarketplaceV1/MechMarketplaceV1';
import {
  CreateMech,
  ImplementationUpdated,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceParamsUpdated,
  MarketplaceRequest,
  Mech,
  OwnerUpdated,
  Service,
  SetMechFactoryStatuses,
  SetPaymentTypeBalanceTrackers,
} from '../generated/schema';
import {
  getOrCreateSender,
  getGlobal,
  createDataSourceForMechContract,
  getOrCreateDeliver,
  getOrCreateRequest,
  getServiceIdFromMultisig,
  isServiceMultisig,
} from './utils';

export function handleCreateMech(event: CreateMechEvent): void {
  let entity = new CreateMech(event.params.mech.toHexString());
  entity.mech = event.params.mech;
  entity.serviceId = event.params.serviceId;
  entity.mechFactory = event.params.mechFactory;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Create Mech entity
  let mechAgent = new Mech(event.params.serviceId.toString());

  mechAgent.address = event.params.mech;
  mechAgent.mechFactory = event.params.mechFactory;
  mechAgent.owner = event.transaction.from;
  mechAgent.service = event.params.serviceId.toString();

  // Get service configHash from Service entity and write it to Mech
  let service = Service.load(event.params.serviceId.toString());
  if (service !== null) {
    mechAgent.configHash = service.configHash;
  }

  mechAgent.save();

  createDataSourceForMechContract(event.params.mech, event.params.mechFactory);

  let global = getGlobal();
  global.totalMechs = global.totalMechs.plus(BigInt.fromI32(1));
  global.save();
}

export function handleImplementationUpdated(
  event: ImplementationUpdatedEvent
): void {
  let entity = new ImplementationUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.implementation = event.params.implementation;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleMarketplaceDelivery(
  event: MarketplaceDeliveryEvent
): void {
  let entity = new MarketplaceDelivery(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.deliveryMech = event.params.deliveryMech;
  entity.numDeliveries = event.params.numDeliveries;
  entity.requestIds = event.params.requestIds;
  entity.deliveredRequests = event.params.deliveredRequests;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  let global = getGlobal();
  global.totalDeliveries = global.totalDeliveries.plus(
    event.params.numDeliveries
  );
  global.totalMarketplaceDeliveries = global.totalMarketplaceDeliveries.plus(
    BigInt.fromI32(1)
  );
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // On-chain delivery ATA counting: deliveryMech is always a service multisig
  global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  global.save();

  // Also update sender-level ATA count for the deliveryMech
  let sender = getOrCreateSender(event.params.deliveryMech);
  sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
  sender.save();
}

export function handleMarketplaceDeliveryWithSignatures(
  event: MarketplaceDeliveryWithSignaturesEvent
): void {
  let entity = new MarketplaceDeliveryWithSignatures(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.deliveryMech = event.params.deliveryMech;
  entity.requester = event.params.requester;
  entity.numDeliveries = event.params.numDeliveries;
  entity.requestIds = event.params.requestIds;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  for (let i = 0; i < event.params.requestIds.length; i++) {
    let deliver = getOrCreateDeliver(event.params.requestIds[i]);
    deliver.sender = event.params.requester;
    deliver.isOffChain = true;
    // Intentionally setting to empty string as request was off-chain
    deliver.request = '';
    deliver.blockNumber = event.block.number;
    deliver.blockTimestamp = event.block.timestamp;
    deliver.transactionHash = event.transaction.hash;
    deliver.save();

    // Transaction-level ATA counting will be handled below
  }

  let sender = getOrCreateSender(event.params.requester);
  /* As these requests are made off-chain we assume that the number of requests 
  is the same as number of deliveries, and add the same to `totalRequests` */
  sender.totalOffChainRequests = sender.totalOffChainRequests.plus(
    event.params.numDeliveries
  );
  sender.totalRequests = sender.totalRequests.plus(event.params.numDeliveries);
  sender.totalTransactions = sender.totalTransactions.plus(BigInt.fromI32(1));
  sender.save();

  let global = getGlobal();

  // For this event, total number of deliveries is the same as total number of requests
  global.totalRequests = global.totalRequests.plus(event.params.numDeliveries);

  global.totalDeliveries = global.totalDeliveries.plus(
    event.params.numDeliveries
  );
  global.totalMarketplaceDeliveriesWithSignatures =
    global.totalMarketplaceDeliveriesWithSignatures.plus(BigInt.fromI32(1));

  // 1 for each request and delivery (request is off-chain)
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(2));

  // Off-chain request ATA counting: deliveryMech is always a service multisig
  // So we always count +1 for deliveryMech, and +1 additional if requester is also a service multisig
  let ataIncrement = BigInt.fromI32(1); // deliveryMech is always a service multisig

  // Always update deliveryMech-level ATA count (since it's always a service multisig)
  let deliverySender = getOrCreateSender(event.params.deliveryMech);
  deliverySender.totalAtaTransactions = deliverySender.totalAtaTransactions.plus(BigInt.fromI32(1));
  deliverySender.save();

  // Check if requester (sender of the request) is a service multisig (additional +1)
  if (isServiceMultisig(event.params.requester)) {
    ataIncrement = ataIncrement.plus(BigInt.fromI32(1));

    // Update requester-level ATA count (using existing sender variable)
    sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
  }

  // Update global ATA count
  global.totalAtaTransactions = global.totalAtaTransactions.plus(ataIncrement);
  global.save();

  // Save sender if it was updated with ATA count
  if (isServiceMultisig(event.params.requester)) {
    sender.save();
  }
}

export function handleDeliverWithSignaturesV1(
  event: DeliverWithSignaturesEventV1
): void {
  let entity = getOrCreateDeliver(event.params.requestId);
  entity.requestId = event.params.requestId;
  entity.deliveryRate = event.params.deliveryRate;
  entity.ipfsHash = event.params.data;
  entity.mech = event.params.mech;
  entity.mechServiceMultisig = event.params.mechServiceMultisig;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  // Update global ATA count for delivery (mechServiceMultisig is always a service multisig)
  let global = getGlobal();
  global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  global.save();

  // Update sender-level ATA count for the mechServiceMultisig
  let sender = getOrCreateSender(event.params.mechServiceMultisig);
  sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
  sender.save();
}

export function handleDeliverWithSignaturesV2(
  event: DeliverWithSignaturesEvent
): void {
  let entity = getOrCreateDeliver(event.params.requestId);
  entity.requestId = event.params.requestId;
  entity.deliveryRate = event.params.deliveryRate;
  entity.ipfsHash = event.params.deliveryData;
  entity.mech = event.params.mech;
  entity.mechServiceMultisig = event.params.mechServiceMultisig;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  // Update global ATA count for delivery (mechServiceMultisig is always a service multisig)
  let global = getGlobal();
  global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  global.save();

  // Update sender-level ATA count for the mechServiceMultisig
  let sender = getOrCreateSender(event.params.mechServiceMultisig);
  sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
  sender.save();
}

export function handleMarketplaceParamsUpdated(
  event: MarketplaceParamsUpdatedEvent
): void {
  let entity = new MarketplaceParamsUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.fee = event.params.fee;
  entity.minResponseTimeout = event.params.minResponseTimeout;
  entity.maxResponseTimeout = event.params.maxResponseTimeout;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleMarketplaceRequest(event: MarketplaceRequestEvent): void {
  let entity = new MarketplaceRequest(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.priorityMech = event.params.priorityMech;
  entity.requester = event.params.requester;
  entity.numRequests = event.params.numRequests;
  entity.requestIds = event.params.requestIds;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  let sender = getOrCreateSender(event.params.requester);
  sender.totalTransactions = sender.totalTransactions.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(
    BigInt.fromI32(1)
  );
  sender.totalRequests = sender.totalRequests.plus(event.params.numRequests);
  sender.save();

  // Get service ID from requester's multisig address
  let serviceId = getServiceIdFromMultisig(event.params.requester);

  // Request entities for each request
  for (let i = 0; i < event.params.numRequests.toI32(); i++) {
    let request = getOrCreateRequest(event.params.requestIds[i]);
    request.sender = sender.id;

    if (serviceId !== null) {
      request.service = serviceId;

      // Update service totalRequests counter
      let service = Service.load(serviceId);
      if (service !== null) {
        service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
        service.save();
      }
    }

    request.save();
  }

  let global = getGlobal();
  global.totalMarketplaceRequests = global.totalMarketplaceRequests.plus(
    BigInt.fromI32(1)
  );
  global.totalRequests = global.totalRequests.plus(event.params.numRequests);
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // Simple transaction-level ATA counting: +1 for the entire transaction
  if (serviceId !== null) {
    global.totalAtaTransactions = global.totalAtaTransactions.plus(
      BigInt.fromI32(1)
    );
    // Also update sender-level ATA count
    sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
    sender.save();
  }
  global.save();
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

export function handleSetMechFactoryStatuses(
  event: SetMechFactoryStatusesEvent
): void {
  let entity = new SetMechFactoryStatuses(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  // Convert Address[] to Bytes[]
  let mechFactories: Bytes[] = event.params.mechFactories.map<Bytes>(
    (address: Address): Bytes => {
      return address as Bytes;
    }
  );
  entity.mechFactories = mechFactories;

  entity.statuses = event.params.statuses;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleSetPaymentTypeBalanceTrackers(
  event: SetPaymentTypeBalanceTrackersEvent
): void {
  let entity = new SetPaymentTypeBalanceTrackers(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.paymentTypes = event.params.paymentTypes;

  // Convert Address[] to Bytes[]
  let balanceTrackers: Bytes[] = event.params.balanceTrackers.map<Bytes>(
    (address: Address): Bytes => {
      return address as Bytes;
    }
  );
  entity.balanceTrackers = balanceTrackers;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
