import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
  RevokeRequest as RevokeRequestEvent,
} from '../../generated/templates/MechFixedPriceToken/MechFixedPriceToken';
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
  if (serviceId === null) {
    throw new Error(`Deliver: Could not find serviceId for mech ${event.params.mech.toHexString()}. CreateMech mapping missing.`);
  }
  
  deliver.service = serviceId.toString();
  let service = Service.load(serviceId.toString());
  if (service !== null) {
    service.totalDeliveries = service.totalDeliveries.plus(BigInt.fromI32(1));
    service.save();
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
  
  // Check if this is a marketplace request (already counted in handleMarketplaceRequest)
  let existingMarketplaceRequest = RequestToMarketplace.load(event.params.requestId);
  let isMarketplaceRequest = (existingMarketplaceRequest !== null);
  
  // Get or create sender from transaction origin
  let sender = getOrCreateSender(event.transaction.from);
  request.sender = sender.id;

  // Link to service and update counters
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId === null) {
    throw new Error(`Request: Could not find serviceId for mech ${event.params.mech.toHexString()}. CreateMech mapping missing.`);
  }
  
  request.mech = serviceId.toString(); // Mech entity ID (serviceId), not address
  request.service = serviceId.toString();
  
  // Common fields
  request.blockNumber = event.block.number;
  request.blockTimestamp = event.block.timestamp;
  request.transactionHash = event.transaction.hash;
  request.isDelivered = false;
  request.priorityMech = event.params.mech;

  // Update per-mech counters
  updateMechCountersOnRequest(event.params.mech);

  // Only increment global/sender/service counters if NOT a marketplace request (to avoid double-counting)
  if (!isMarketplaceRequest) {
    // Update service counters
    let service = Service.load(serviceId.toString());
    if (service !== null) {
      service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
      service.save();
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
      if (!ataTransactionExists(txHash)) {
        getOrCreateAtaTransaction(txHash, event.block.number, event.block.timestamp);
        global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
        sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
      }
    }
    global.save();
    
    // Create RequestToMarketplace for standalone mech direct request
    let marketplaceRequest = getOrCreateRequestToMarketplace(event.params.requestId);
    marketplaceRequest.requestId = event.params.requestId;
    marketplaceRequest.ipfsHashBytes = event.params.data;
    marketplaceRequest.isMarketplace = false; // Mark as direct mech request (not from marketplace)
    marketplaceRequest.isOffChain = false;
    marketplaceRequest.request = request.id;
    marketplaceRequest.save();
  }

  request.save();
}

export function handleRevokeRequest(event: RevokeRequestEvent): void {
  // RevokeRequest is emitted when marketplace rejects the delivery (e.g., already delivered by another mech).
  // This is mutually exclusive with Deliver event - if RevokeRequest is emitted, Deliver was NOT emitted.
  // Therefore, no counters were incremented and nothing needs to be rolled back.
  // This is purely informational logging.
  log.info('RevokeRequest: Mech {} failed to deliver request {} (rejected by marketplace)', [
    event.address.toHexString(),
    event.params.requestId.toHexString()
  ]);
}
