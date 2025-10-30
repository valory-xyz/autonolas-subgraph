import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
} from '../generated/templates/MechFixedPriceToken/MechFixedPriceToken';
import { Deliver, Request, MarketplaceService, DeliverForMarketplace, RequestToMarketplace } from '../generated/schema';
import { getOrCreateRequest, getServiceIdFromMech, getOrCreateSender, getOrCreateMarketplaceIndividualDeliver } from './utils';
import { BigInt, Bytes } from '@graphprotocol/graph-ts';

export function handleDeliver(event: DeliverEvent): void {
  let deliver = getOrCreateMarketplaceIndividualDeliver(event.params.requestId);
  deliver.mech = event.params.mech;
  deliver.requestId = event.params.requestId;
  deliver.blockNumber = event.block.number;
  deliver.blockTimestamp = event.block.timestamp;
  deliver.transactionHash = event.transaction.hash;

  let request = Request.load(event.params.requestId.toHexString());
  if (request !== null) {
    deliver.request = request.id;
    deliver.sender = request.sender.id;
  }

  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    deliver.service = serviceId;

    // Update service totalDeliveries counter
    let service = MarketplaceService.load(serviceId);
    if (service !== null) {
      service.totalDeliveries = service.totalDeliveries.plus(BigInt.fromI32(1));
      service.save();
    }
  }

  deliver.save();

  // Create marketplace-specific delivery entity
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
  request.requestId = event.params.requestId;
  request.mech = event.params.mech;
  request.ipfsHash = event.params.data;

  // Get or create sender from transaction origin
  let sender = getOrCreateSender(event.transaction.from);
  request.sender = sender.id;

  // Get serviceId from mech if available
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    request.service = serviceId;

    // Update service totalRequests counter
    let service = MarketplaceService.load(serviceId);
    if (service !== null) {
      service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
      service.save();
    }
  }

  // Update sender counters
  sender.totalRequests = sender.totalRequests.plus(BigInt.fromI32(1));
  sender.save();

  request.blockNumber = event.block.number;
  request.blockTimestamp = event.block.timestamp;
  request.transactionHash = event.transaction.hash;

  request.save();

  // Create marketplace-specific request entity
  let marketplaceRequest = RequestToMarketplace.load(event.params.requestId);
  if (marketplaceRequest == null) {
    marketplaceRequest = new RequestToMarketplace(event.params.requestId);
  }
  marketplaceRequest.ipfsHashBytes = event.params.data;
  marketplaceRequest.isMarketplace = true;
  marketplaceRequest.isOffChain = false;
  marketplaceRequest.request = request.id;
  marketplaceRequest.save();
}
