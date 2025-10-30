import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
} from '../generated/templates/MechNvmSubscriptionTokenUSDC/MechNvmSubscriptionTokenUSDC';
import { MarketplaceDeliveryIndividual, MarketplaceRequestIndividual, MarketplaceService } from '../generated/schema';
import { getOrCreateRequest, getServiceIdFromMech } from './utils';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleDeliver(event: DeliverEvent): void {
  let entity = new MarketplaceDeliveryIndividual(event.params.requestId.toHexString());
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

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
