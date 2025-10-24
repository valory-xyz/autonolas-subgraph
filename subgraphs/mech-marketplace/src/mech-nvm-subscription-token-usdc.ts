import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
  RevokeRequest as RevokeRequestEvent,
} from '../generated/templates/MechNvmSubscriptionTokenUSDC/MechNvmSubscriptionTokenUSDC';
import { Deliver, Request, Service } from '../generated/schema';
import {
  applyDeliveryCounters,
  getOrCreateRequest,
  getServiceIdFromMech,
  incrementReceivedCounters,
  loadMechByAddress,
  revertDeliveryCounters,
} from './utils';
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

  const request = Request.load(event.params.requestId.toHexString());
  if (request !== null) {
    if (request.isDelivered && request.latestOpenDelivery === null) {
      return;
    }
    request.deliveredByMech = event.params.mech;
    request.save();
    applyDeliveryCounters(request, event.params.mech);
    entity.sender = request.sender;
  }

  const serviceId = getServiceIdFromMech(event.params.mech);
  if (serviceId !== null) {
    entity.service = serviceId;

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
  entity.isDelivered = false;
  entity.deliveredByMech = null;

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

    let mech = loadMechByAddress(event.params.mech);
    if (mech !== null) {
      incrementReceivedCounters(mech);
    }
  }

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleRevokeRequest(event: RevokeRequestEvent): void {
  let request = Request.load(event.params.requestId.toHexString());
  if (request === null) {
    return;
  }

  revertDeliveryCounters(request, event.address);
  request.deliveredByMech = request.isDelivered ? request.deliveredByMech : null;
  request.save();
}
