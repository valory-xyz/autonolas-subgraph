import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
} from '../generated/templates/MechFixedPriceNative/MechFixedPriceNative';
import { Deliver, Request, Service } from '../generated/schema';
import { getOrCreateRequest, getServiceIdFromMech } from './utils';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleDeliver(event: DeliverEvent): void {
  let entity = new Deliver(event.params.requestId.toHexString());
  entity.mech = event.params.mech;
  entity.mechServiceMultisig = event.params.mechServiceMultisig;
  entity.requestId = event.params.requestId;
  entity.deliveryRate = event.params.deliveryRate;
  entity.ipfsHash = event.params.data;
  entity.request = event.params.requestId.toHexString();
  entity.isOffChain = false;

  let request = Request.load(event.params.requestId.toHexString());
  if (request !== null) {
    entity.sender = request.sender;
  }

  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    entity.service = serviceId;

    // Update service totalDeliveries counter
    let service = Service.load(serviceId);
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

  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    entity.service = serviceId;

    let service = Service.load(serviceId);
    if (service !== null) {
      service.totalRequestsReceived = service.totalRequestsReceived.plus(
        BigInt.fromI32(1)
      );
      service.save();
    }
  }

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
