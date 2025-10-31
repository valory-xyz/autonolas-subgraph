import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
} from '../../generated/templates/MechFixedPriceNative/MechFixedPriceNative';
import { Deliver, Request, Service, RequestToMarketplace, DeliverForMarketplace, AtaTransaction } from '../../generated/schema';
import { getOrCreateRequest, getServiceIdFromMech, getOrCreateSender, getOrCreateMarketplaceIndividualDeliver, getGlobal, getServiceIdFromMultisig } from './utils';
import { BigInt, Bytes } from '@graphprotocol/graph-ts';

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
  }

  // Link to service
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    deliver.service = serviceId;
    let service = Service.load(serviceId);
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
  request.mech = event.params.mech;
  request.blockNumber = event.block.number;
  request.blockTimestamp = event.block.timestamp;
  request.transactionHash = event.transaction.hash;

  // Get or create sender from transaction origin
  let sender = getOrCreateSender(event.transaction.from);
  request.sender = sender.id;

  // Link to service
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    request.service = serviceId;
    let service = Service.load(serviceId);
    if (service !== null) {
      service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
      service.save();
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
