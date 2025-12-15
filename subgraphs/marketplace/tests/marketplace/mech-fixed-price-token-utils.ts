import {
  Deliver,
  Request,
  RevokeRequest,
  MaxDeliveryRateUpdated,
} from '../../generated/templates/MechFixedPriceToken/MechFixedPriceToken';
import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  createBaseDeliverEvent,
  createBaseMaxDeliveryRateUpdatedEvent,
  createBaseRequestEvent,
  createBaseRevokeRequestEvent,
} from './shared-mech-event-helpers';

export function createDeliverEvent(
  mech: Address,
  requestId: Bytes,
  mechServiceMultisig: Address,
  deliveryRate: BigInt,
  data: Bytes
): Deliver {
  return changetype<Deliver>(
    createBaseDeliverEvent(
      mech,
      requestId,
      mechServiceMultisig,
      deliveryRate,
      data
    )
  );
}

export function createRequestEvent(
  mech: Address,
  requestId: Bytes,
  data: Bytes
): Request {
  return changetype<Request>(createBaseRequestEvent(mech, requestId, data));
}

export function createRevokeEvent(
  mech: Address,
  requestId: Bytes
): RevokeRequest {
  return changetype<RevokeRequest>(
    createBaseRevokeRequestEvent(mech, requestId)
  );
}

export function createMaxDeliveryRateUpdatedEvent(
  mech: Address,
  maxDeliveryRate: BigInt
): MaxDeliveryRateUpdated {
  return changetype<MaxDeliveryRateUpdated>(
    createBaseMaxDeliveryRateUpdatedEvent(mech, maxDeliveryRate)
  );
}

