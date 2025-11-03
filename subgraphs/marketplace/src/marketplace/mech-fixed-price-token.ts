import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
  RevokeRequest as RevokeRequestEvent,
} from '../../generated/templates/MechFixedPriceToken/MechFixedPriceToken';
import { Deliver, Request, Service, RequestToMarketplace, DeliverForMarketplace, AtaTransaction, Mech } from '../../generated/schema';
import { getOrCreateRequest, getServiceIdFromMech, getOrCreateSender, getOrCreateMarketplaceIndividualDeliver, getGlobal, getServiceIdFromMultisig } from './utils';
import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';

export function handleDeliver(event: DeliverEvent): void {
  let deliverId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let deliver = getOrCreateMarketplaceIndividualDeliver(deliverId);
  
  // Common fields only
  deliver.mech = event.params.mech;
  deliver.blockNumber = event.block.number;
  deliver.blockTimestamp = event.block.timestamp;
  deliver.transactionHash = event.transaction.hash;

  // Set sender
  let request = Request.load(Bytes.fromHexString(event.params.requestId.toHexString()));
  if (request !== null) {
    deliver.request = request.id;
    // request.sender stores the Sender ID (Bytes) directly in relations
    deliver.sender = request.sender as Bytes;
    
    // Mark request as delivered (only if not already delivered)
    if (!request.isDelivered) {
      request.isDelivered = true;
      request.deliveredByMech = event.params.mech;
      request.save();
      
      // Update counters for the priority mech (the one that received the request)
      if (request.priorityMech !== null) {
        const priorityServiceId = getServiceIdFromMech(request.priorityMech as Bytes);
        if (priorityServiceId !== null) {
          let priorityMechEntity = Mech.load(priorityServiceId.toString());
          if (priorityMechEntity !== null) {
            // Check if priority mech delivered its own request or another mech delivered it
            if (request.priorityMech!.equals(event.params.mech)) {
              // Self-delivery: decrement undelivered and increment self-delivered counter
              if (priorityMechEntity.undeliveredRequests.gt(BigInt.fromI32(0))) {
                priorityMechEntity.undeliveredRequests = priorityMechEntity.undeliveredRequests.minus(BigInt.fromI32(1));
              }
              priorityMechEntity.selfDeliveredFromReceived = priorityMechEntity.selfDeliveredFromReceived.plus(BigInt.fromI32(1));
            } else {
              // Other-mech delivery: only increment delivered-by-others counter (undelivered stays same)
              priorityMechEntity.deliveredByOthersFromReceived = priorityMechEntity.deliveredByOthersFromReceived.plus(BigInt.fromI32(1));
            }
            
            priorityMechEntity.save();
          }
        }
      }
    }
  }

  // Link to service
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    deliver.service = serviceId.toString();
    let service = Service.load(serviceId.toString());
    if (service !== null) {
      service.totalDeliveries = service.totalDeliveries.plus(BigInt.fromI32(1));
      service.save();
    }
  }

  deliver.save();

  // Deliveries are always ATA (marketplace mech is always a service multisig)
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  let global = getGlobal();
  global.totalDeliveries = global.totalDeliveries.plus(BigInt.fromI32(1));
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  let txHash = event.transaction.hash;
  let transaction = AtaTransaction.load(txHash);
  if (transaction === null) {
    transaction = new AtaTransaction(txHash);
    transaction.blockNumber = event.block.number;
    transaction.blockTimestamp = event.block.timestamp;
    transaction.save();
    global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  }
  global.save();

  // Create marketplace-specific delivery entity (avoids null fields)
  let marketplaceDeliver = DeliverForMarketplace.load(event.params.requestId);
  if (marketplaceDeliver == null) {
    marketplaceDeliver = new DeliverForMarketplace(event.params.requestId);
  }
  marketplaceDeliver.requestId = event.params.requestId;
  marketplaceDeliver.ipfsHashBytes = event.params.data;
  marketplaceDeliver.mechServiceMultisig = event.params.mechServiceMultisig;
  marketplaceDeliver.deliveryRate = event.params.deliveryRate;
  marketplaceDeliver.isMarketplace = true;
  marketplaceDeliver.isOffChain = false;
  marketplaceDeliver.deliver = deliver.id;
  marketplaceDeliver.save();
}

export function handleRequest(event: RequestEvent): void {
  let request = getOrCreateRequest(event.params.requestId);
  
  // Common fields only
  request.mech = event.params.mech.toHexString();
  request.blockNumber = event.block.number;
  request.blockTimestamp = event.block.timestamp;
  request.transactionHash = event.transaction.hash;
  request.isDelivered = false;
  request.priorityMech = event.params.mech;

  // Get or create sender from transaction origin
  let sender = getOrCreateSender(event.transaction.from);
  request.sender = sender.id;

  // Link to service
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    request.service = serviceId.toString();
    let service = Service.load(serviceId.toString());
    if (service !== null) {
      service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
      service.save();
    }

    // Update per-mech counters
    let mechEntity = Mech.load(serviceId.toString());
    if (mechEntity !== null) {
      mechEntity.receivedRequests = mechEntity.receivedRequests.plus(BigInt.fromI32(1));
      mechEntity.undeliveredRequests = mechEntity.undeliveredRequests.plus(BigInt.fromI32(1));
      mechEntity.save();
    }
  }

  // Update global counters
  let global = getGlobal();
  global.totalRequests = global.totalRequests.plus(BigInt.fromI32(1));
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // Update sender counters - use Int operations
  sender.totalRequests = sender.totalRequests.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(BigInt.fromI32(1));
  sender.save();

  // Identify service multisig (counts toward ATA requests)
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  let serviceIdForRequest = getServiceIdFromMultisig(event.transaction.from);
  if (serviceIdForRequest !== null) {
    let txHash = event.transaction.hash;
    let transaction = AtaTransaction.load(txHash);
    if (transaction === null) {
      transaction = new AtaTransaction(txHash);
      transaction.blockNumber = event.block.number;
      transaction.blockTimestamp = event.block.timestamp;
      transaction.save();

      global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
      sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
    }
  }
  global.save();

  request.save();

  // Create marketplace-specific request entity (avoids null fields)
  let marketplaceRequest = RequestToMarketplace.load(event.params.requestId);
  if (marketplaceRequest == null) {
    marketplaceRequest = new RequestToMarketplace(event.params.requestId);
  }
  marketplaceRequest.requestId = event.params.requestId;
  marketplaceRequest.ipfsHashBytes = event.params.data;
  marketplaceRequest.isMarketplace = true;
  marketplaceRequest.isOffChain = false;
  marketplaceRequest.request = request.id;
  marketplaceRequest.save();
}

export function handleRevokeRequest(event: RevokeRequestEvent): void {
  const serviceId = getServiceIdFromMech(event.address);
  if (serviceId === null) {
    log.warning('RevokeRequest: Could not find serviceId for mech {}', [event.address.toHexString()]);
    return;
  }

  let req = Request.load(event.params.requestId);
  if (req !== null && req.isDelivered) {
    log.info('RevokeRequest: Request {} already delivered, ignoring revoke', [event.params.requestId.toHexString()]);
    return;
  }

  let mechEntity = Mech.load(serviceId.toString());
  if (mechEntity === null) {
    log.warning('RevokeRequest: Could not find Mech entity for serviceId {}', [serviceId.toString()]);
    return;
  }

  if (mechEntity.undeliveredRequests.gt(BigInt.fromI32(0))) {
    mechEntity.undeliveredRequests = mechEntity.undeliveredRequests.minus(BigInt.fromI32(1));
    mechEntity.save();
    log.info('RevokeRequest: Decremented undeliveredRequests for mech {} (serviceId: {}), new value: {}', [
      event.address.toHexString(),
      serviceId.toString(),
      mechEntity.undeliveredRequests.toString()
    ]);
  }
}
