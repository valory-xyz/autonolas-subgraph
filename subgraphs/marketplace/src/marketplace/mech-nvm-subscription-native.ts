import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
  RevokeRequest as RevokeRequestEvent,
} from '../../generated/templates/MechNvmSubscriptionNative/MechNvmSubscriptionNative';
import { Deliver, Request, Service, RequestToMarketplace, DeliverForMarketplace, AtaTransaction, Mech } from '../../generated/schema';
import { getOrCreateRequest, getServiceIdFromMech, getOrCreateSender, getOrCreateMarketplaceIndividualDeliver, getGlobal, getServiceIdFromMultisig, updateMechCountersOnDelivery, updateMechCountersOnRequest, getOrCreateAtaTransaction, getOrCreateRequestToMarketplace, getOrCreateDeliverForMarketplace, ataTransactionExists } from './utils';
import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';

export function handleDeliver(event: DeliverEvent): void {
  let deliverId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let deliver = getOrCreateMarketplaceIndividualDeliver(deliverId);
  
  // Common fields only
  deliver.mech = event.params.mech;
  deliver.blockNumber = event.block.number;
  deliver.blockTimestamp = event.block.timestamp;
  deliver.transactionHash = event.transaction.hash;

  // Sender is the one who sent the delivery transaction (the mech service)
  deliver.sender = event.transaction.from;

  // Link to request if it exists
  let request = Request.load(Bytes.fromHexString(event.params.requestId.toHexString()));
  if (request !== null) {
    deliver.request = request.id;
    
    // Mark request as delivered (only if not already delivered)
    if (!request.isDelivered) {
      request.isDelivered = true;
      request.deliveredByMech = event.params.mech;
      request.save();
      
      // Update counters for the priority mech
      updateMechCountersOnDelivery(request, event.params.mech);
    }
  } else {
    log.warning('Deliver: Request {} not found for delivery transaction', [
      event.params.requestId.toHexString()
    ]);
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
  if (!ataTransactionExists(txHash)) {
    getOrCreateAtaTransaction(txHash, event.block.number, event.block.timestamp);
    global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  }
  global.save();

  // Create marketplace-specific delivery entity (avoids null fields)
  let marketplaceDeliver = getOrCreateDeliverForMarketplace(event.params.requestId);
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
  
  // Get or create sender from transaction origin
  let sender = getOrCreateSender(event.transaction.from);
  request.sender = sender.id;

  // Link to service and update counters
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    request.mech = serviceId.toString(); // Mech entity ID (serviceId), not address
    request.service = serviceId.toString();
    let service = Service.load(serviceId.toString());
    if (service !== null) {
      service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
      service.save();
    }
  } else {
    // Fallback: if serviceId not found, use address as string (shouldn't happen in normal flow)
    request.mech = event.params.mech.toHexString();
    log.warning('Request: Could not find serviceId for mech {}, using address as fallback', [event.params.mech.toHexString()]);
  }
  
  // Common fields
  request.blockNumber = event.block.number;
  request.blockTimestamp = event.block.timestamp;
  request.transactionHash = event.transaction.hash;
  request.isDelivered = false;
  request.priorityMech = event.params.mech;

  // Update per-mech counters
  updateMechCountersOnRequest(event.params.mech);

  // Update global counters
  let global = getGlobal();
  global.totalRequests = global.totalRequests.plus(BigInt.fromI32(1));
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // Update sender counters
  sender.totalRequests = sender.totalRequests.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(BigInt.fromI32(1));
  sender.save();

  // Identify service multisig (counts toward ATA requests)
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  let serviceIdForRequest = getServiceIdFromMultisig(event.transaction.from);
  if (serviceIdForRequest !== null) {
    let txHash = event.transaction.hash;
    if (!ataTransactionExists(txHash)) {
      getOrCreateAtaTransaction(txHash, event.block.number, event.block.timestamp);
      global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
      sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
    }
  }
  global.save();

  request.save();

  // Create marketplace-specific request entity (avoids null fields)
  let marketplaceRequest = getOrCreateRequestToMarketplace(event.params.requestId);
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
