import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
} from '../generated/templates/MechFixedPriceToken/MechFixedPriceToken';
import { MarketplaceDeliveryIndividual, MarketplaceRequestIndividual, MarketplaceService } from '../generated/schema';
import { getOrCreateRequest, getServiceIdFromMech, getOrCreateSender, getOrCreateMarketplaceIndividualDeliver } from './utils';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleDeliver(event: DeliverEvent): void {
  let entity = getOrCreateMarketplaceIndividualDeliver(event.params.requestId);
  entity.mech = event.params.mech;
  entity.mechServiceMultisig = event.params.mechServiceMultisig;
  entity.requestId = event.params.requestId;
  entity.deliveryRate = event.params.deliveryRate;
  entity.ipfsHash = event.params.data;
  entity.request = event.params.requestId.toHexString();
  entity.isOffChain = false;

  const request = MarketplaceRequestIndividual.load(event.params.requestId.toHexString());
  if (request !== null) {
    entity.sender = request.sender.id;
  }

  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    entity.service = serviceId;

    // Update service totalDeliveries counter
    let service = MarketplaceService.load(serviceId);
    if (service !== null) {
      service.totalDeliveries = service.totalDeliveries.plus(BigInt.fromI32(1));
      service.save();
    }
  }

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleRequest(event: RequestEvent): void {
  let entity = getOrCreateRequest(event.params.requestId);
  entity.requestId = event.params.requestId;
  entity.mech = event.params.mech;
  entity.ipfsHash = event.params.data;

  // Get or create sender from transaction origin
  let sender = getOrCreateSender(event.transaction.from);
  entity.sender = sender.id;

  // Get serviceId from mech if available
  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    entity.service = serviceId;

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

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
