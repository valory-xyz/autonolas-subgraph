import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
  CreateMech as CreateMechEvent,
  Deliver as DeliverWithSignaturesEvent,
  MarketplaceDelivery as MarketplaceDeliveryEvent,
  MarketplaceDeliveryWithSignatures as MarketplaceDeliveryWithSignaturesEvent,
  MarketplaceParamsUpdated as MarketplaceParamsUpdatedEvent,
  MarketplaceRequest as MarketplaceRequestEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  SetMechFactoryStatuses as SetMechFactoryStatusesEvent,
  SetPaymentTypeBalanceTrackers as SetPaymentTypeBalanceTrackersEvent,
} from '../../generated/MechMarketplaceV2/MechMarketplaceV2';
import { Deliver as DeliverWithSignaturesEventV1 } from '../../generated/MechMarketplaceV1/MechMarketplaceV1';
import {
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceParamsUpdated,
  MarketplaceRequest,
  Mech,
  OwnerUpdated,
  Service,
  SetMechFactoryStatuses,
  SetPaymentTypeBalanceTrackers,
  Request,
  Deliver,
  RequestToMarketplace,
  DeliverForMarketplace,
  AtaTransaction,
  CreateMech,
} from '../../generated/schema';
import {
  getOrCreateSender,
  getGlobal,
  createDataSourceForMechContract,
  getOrCreateMarketplaceIndividualDeliver,
  getOrCreateRequest,
  getMech,
  getServiceIdFromMultisig,
  getServiceIdFromMech,
  isServiceMultisig,
  getOrCreateRequestsPerAgent,
} from './utils';

export function handleCreateMech(event: CreateMechEvent): void {
  // Create CreateMech entity (used by getServiceIdFromMech)
  let createMechEntity = CreateMech.load(event.params.mech);
  if (createMechEntity === null) {
    createMechEntity = new CreateMech(event.params.mech);
  }
  createMechEntity.mech = event.params.mech;
  createMechEntity.serviceId = event.params.serviceId;
  createMechEntity.mechFactory = event.params.mechFactory;
  createMechEntity.source = 'MARKETPLACE';
  createMechEntity.blockNumber = event.block.number;
  createMechEntity.blockTimestamp = event.block.timestamp;
  createMechEntity.transactionHash = event.transaction.hash;
  createMechEntity.save();

  // Create Mech entity
  let mechAgent = new Mech(event.params.serviceId.toString());

  mechAgent.address = event.params.mech;
  mechAgent.mechFactory = event.params.mechFactory;
  mechAgent.owner = event.transaction.from;
  mechAgent.service = event.params.serviceId.toString();
  mechAgent.totalDeliveriesTransactions = BigInt.fromI32(0);
  mechAgent.receivedRequests = BigInt.fromI32(0);
  mechAgent.selfDeliveredFromReceived = BigInt.fromI32(0);
  mechAgent.deliveredByOthersFromReceived = BigInt.fromI32(0);
  mechAgent.undeliveredRequests = BigInt.fromI32(0);

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

  // Mark delivered requests as completed and track who delivered
  for (let i = 0; i < event.params.requestIds.length; i++) {
    if (!event.params.deliveredRequests[i]) continue;
    let request = Request.load(event.params.requestIds[i]);
    if (request !== null && !request.isDelivered) {
      request.isDelivered = true;
      request.deliveredByMech = event.params.deliveryMech;
      request.save();
      
      // Update priority mech counters
      if (request.priorityMech !== null) {
        const priorityServiceId = getServiceIdFromMech(request.priorityMech!);
        if (priorityServiceId !== null) {
          let priorityMechEntity = Mech.load(priorityServiceId.toString());
          if (priorityMechEntity !== null) {
            // Track self vs other delivery
            if (request.priorityMech!.equals(event.params.deliveryMech)) {
              // Self-delivery: decrement undelivered and increment self-delivered counter
              if (priorityMechEntity.undeliveredRequests.gt(BigInt.fromI32(0))) {
                priorityMechEntity.undeliveredRequests = priorityMechEntity.undeliveredRequests.minus(BigInt.fromI32(1));
              }
              priorityMechEntity.selfDeliveredFromReceived = priorityMechEntity.selfDeliveredFromReceived.plus(BigInt.fromI32(1));
            } else {
              priorityMechEntity.deliveredByOthersFromReceived = priorityMechEntity.deliveredByOthersFromReceived.plus(BigInt.fromI32(1));
            }
            
            priorityMechEntity.save();
          }
        }
      }
    }
  }

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

  // Also update mech-level ATA count for the deliveryMech (if it exists)
  let deliveryMech = getMech(event.params.deliveryMech, event.transaction.hash, 'handleMarketplaceDelivery');
  if (deliveryMech != null) {
    deliveryMech.totalDeliveriesTransactions = deliveryMech.totalDeliveriesTransactions.plus(BigInt.fromI32(1));
    deliveryMech.save();
  }
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
    let deliver = getOrCreateMarketplaceIndividualDeliver(event.params.requestIds[i]);
    
    // Common fields only
    deliver.mech = event.params.deliveryMech;
    deliver.sender = event.params.requester;
    deliver.blockNumber = event.block.number;
    deliver.blockTimestamp = event.block.timestamp;
    deliver.transactionHash = event.transaction.hash;
    deliver.request = null; // Off-chain, no request

    deliver.save();

    // Create marketplace-specific delivery entity (avoids null fields)
    let marketplaceDeliver = DeliverForMarketplace.load(event.params.requestIds[i]);
    if (marketplaceDeliver == null) {
      marketplaceDeliver = new DeliverForMarketplace(event.params.requestIds[i]);
    }
    marketplaceDeliver.requestId = event.params.requestIds[i];
    marketplaceDeliver.isMarketplace = true;
    marketplaceDeliver.isOffChain = true;
    marketplaceDeliver.deliver = deliver.id;
    marketplaceDeliver.save();
  }

  let sender = getOrCreateSender(event.params.requester);
  // As these requests are made off-chain we assume that the number of requests 
  // is the same as number of deliveries, and add the same to `totalRequests`
  sender.totalOffChainRequests = sender.totalOffChainRequests.plus(event.params.numDeliveries);
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
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  let txHash = event.transaction.hash;
  let transaction = AtaTransaction.load(txHash);
  
  if (transaction === null) {
    // Create AtaTransaction entity to track this transaction
    transaction = new AtaTransaction(txHash);
    transaction.blockNumber = event.block.number;
    transaction.blockTimestamp = event.block.timestamp;
    transaction.save();

    let ataIncrement = BigInt.fromI32(1); // deliveryMech is always a service multisig

    // Update deliveryMech-level ATA count (mech is the service provider) - only if mech exists
    let deliveryMech = getMech(event.params.deliveryMech, event.transaction.hash, 'handleMarketplaceDeliveryWithSignatures');
    if (deliveryMech != null) {
      deliveryMech.totalDeliveriesTransactions = deliveryMech.totalDeliveriesTransactions.plus(BigInt.fromI32(1));
      deliveryMech.save();
    }

    // Check if requester (sender of the request) is a service multisig (additional +1)
    if (isServiceMultisig(event.params.requester)) {
      ataIncrement = ataIncrement.plus(BigInt.fromI32(1));

      // Update requester-level ATA count (using existing sender variable)
      sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
      sender.save();
    }

    // Update global ATA count
    global.totalAtaTransactions = global.totalAtaTransactions.plus(ataIncrement);
    global.save();
  }

  // Increment per-agent counters for service derived from requester multisig (off-chain requests)
  let serviceIDForOffChain = getServiceIdFromMultisig(event.params.requester);
  if (serviceIDForOffChain !== null) {
    let serviceEntity = Service.load(serviceIDForOffChain.toString());
    if (serviceEntity !== null) {
      let agentIds = serviceEntity.agentIds;
      for (let i = 0; i < agentIds.length; i++) {
        let requestPerAgent = getOrCreateRequestsPerAgent(agentIds[i]);
        requestPerAgent.requestsCount = requestPerAgent.requestsCount.plus(event.params.numDeliveries);
        requestPerAgent.save();
      }
    }
  }
}

export function handleDeliverWithSignaturesV1(
  event: DeliverWithSignaturesEventV1
): void {
  let deliver = getOrCreateMarketplaceIndividualDeliver(event.params.requestId);
  
  // Common fields only
  deliver.mech = event.params.mech;
  deliver.blockNumber = event.block.number;
  deliver.blockTimestamp = event.block.timestamp;
  deliver.transactionHash = event.transaction.hash;
  deliver.request = null; // Off-chain signed requests have no Request event
  // sender will be set by handleMarketplaceDeliveryWithSignatures (which always runs for these events)
  // We must set something because sender is required, but handleMarketplaceDeliveryWithSignatures will overwrite it
  if (deliver.sender === null) {
    deliver.sender = event.transaction.from;
  }

  // Link service
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    deliver.service = serviceId.toString();
  }

  deliver.save();

  // Create marketplace-specific delivery entity (avoids null fields)
  let marketplaceDeliver = DeliverForMarketplace.load(event.params.requestId);
  if (marketplaceDeliver == null) {
    marketplaceDeliver = new DeliverForMarketplace(event.params.requestId);
  }
  marketplaceDeliver.requestId = event.params.requestId;
  marketplaceDeliver.ipfsHashBytes = event.params.data;
  marketplaceDeliver.deliveryRate = event.params.deliveryRate;
  marketplaceDeliver.mechServiceMultisig = event.params.mechServiceMultisig;
  marketplaceDeliver.isMarketplace = true;
  marketplaceDeliver.isOffChain = true;
  marketplaceDeliver.deliver = deliver.id;
  marketplaceDeliver.save();
}

export function handleDeliverWithSignaturesV2(
  event: DeliverWithSignaturesEvent
): void {
  let deliver = getOrCreateMarketplaceIndividualDeliver(event.params.requestId);
  
  // Common fields only
  deliver.mech = event.params.mech;
  deliver.blockNumber = event.block.number;
  deliver.blockTimestamp = event.block.timestamp;
  deliver.transactionHash = event.transaction.hash;
  deliver.request = null; // Off-chain signed requests have no Request event
  // sender will be set by handleMarketplaceDeliveryWithSignatures (which always runs for these events)
  // We must set something because sender is required, but handleMarketplaceDeliveryWithSignatures will overwrite it
  if (deliver.sender === null) {
    deliver.sender = event.transaction.from;
  }

  // Link service
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    deliver.service = serviceId.toString();
  }

  deliver.save();

  // Create marketplace-specific delivery entity (avoids null fields)
  let marketplaceDeliver = DeliverForMarketplace.load(event.params.requestId);
  if (marketplaceDeliver == null) {
    marketplaceDeliver = new DeliverForMarketplace(event.params.requestId);
  }
  marketplaceDeliver.requestId = event.params.requestId;
  marketplaceDeliver.ipfsHashBytes = event.params.deliveryData;
  marketplaceDeliver.deliveryRate = event.params.deliveryRate;
  marketplaceDeliver.mechServiceMultisig = event.params.mechServiceMultisig;
  marketplaceDeliver.isMarketplace = true;
  marketplaceDeliver.isOffChain = true;
  marketplaceDeliver.deliver = deliver.id;
  marketplaceDeliver.save();
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

  // // Use Int operations
  sender.totalTransactions = sender.totalTransactions.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(BigInt.fromI32(1));
  sender.totalRequests = sender.totalRequests.plus(event.params.numRequests);
  sender.save();

  // Get service ID from requester's multisig address
  let serviceId = getServiceIdFromMultisig(event.params.requester);

  // Request entities for each request
  for (let i = 0; i < event.params.numRequests.toI32(); i++) {
    let request = getOrCreateRequest(event.params.requestIds[i]);
    
    // Common fields only
    request.sender = sender.id;
    request.mech = event.params.priorityMech.toHexString();
    request.blockNumber = event.block.number;
    request.blockTimestamp = event.block.timestamp;
    request.transactionHash = event.transaction.hash;
    request.isDelivered = false;
    request.priorityMech = event.params.priorityMech;

    if (serviceId !== null) {
      request.service = serviceId.toString();
      let service = Service.load(serviceId.toString());
      if (service !== null) {
        service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
        service.save();
      }
    }

    // Update per-mech counters for the priority mech
    const priorityServiceId = getServiceIdFromMech(event.params.priorityMech);
    if (priorityServiceId !== null) {
      let priorityMechEntity = Mech.load(priorityServiceId.toString());
      if (priorityMechEntity !== null) {
        priorityMechEntity.receivedRequests = priorityMechEntity.receivedRequests.plus(BigInt.fromI32(1));
        priorityMechEntity.undeliveredRequests = priorityMechEntity.undeliveredRequests.plus(BigInt.fromI32(1));
        priorityMechEntity.save();
      }
    }

    request.save();

    // Create marketplace-specific request entity (avoids null fields)
    let marketplaceRequest = RequestToMarketplace.load(event.params.requestIds[i]);
    if (marketplaceRequest == null) {
      marketplaceRequest = new RequestToMarketplace(event.params.requestIds[i]);
    }
    marketplaceRequest.requestId = event.params.requestIds[i];
    marketplaceRequest.isMarketplace = true;
    marketplaceRequest.isOffChain = false;
    marketplaceRequest.request = request.id;
    marketplaceRequest.save();
  }

  let global = getGlobal();
  global.totalMarketplaceRequests = global.totalMarketplaceRequests.plus(
    BigInt.fromI32(1)
  );
  global.totalRequests = global.totalRequests.plus(event.params.numRequests);
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // Simple transaction-level ATA counting: +1 for the entire transaction
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  if (serviceId !== null) {
    let txHash = event.transaction.hash;
    let transaction = AtaTransaction.load(txHash);
    
    if (transaction === null) {
      // Create AtaTransaction entity to track this transaction
      transaction = new AtaTransaction(txHash);
      transaction.blockNumber = event.block.number;
      transaction.blockTimestamp = event.block.timestamp;
      transaction.save();

      global.totalAtaTransactions = global.totalAtaTransactions.plus(
        BigInt.fromI32(1)
      );
      // Also update sender-level ATA count
      sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
      sender.save();
    }
  }
  global.save();

  // Increment per-agent counters for all canonical agents of this service (on-chain requests)
  if (serviceId !== null) {
    let svc = Service.load(serviceId.toString()); // Changed from MarketplaceService
    if (svc !== null) {
      let ids = svc.agentIds;
      for (let i = 0; i < ids.length; i++) {
        let requestPerAgent = getOrCreateRequestsPerAgent(ids[i]);
        requestPerAgent.requestsCount = requestPerAgent.requestsCount.plus(event.params.numRequests);
        requestPerAgent.save();
      }
    }
  }
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
