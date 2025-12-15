import {
  Deliver,
  Request,
  RevokeRequest,
  MaxDeliveryRateUpdated,
} from '../../generated/templates/MechFixedPriceNative/MechFixedPriceNative';
import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import { CreateMech, Mech } from '../../generated/schema';
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

export function createMechWithMapping(
  mech: Address,
  serviceId: BigInt
): void {
  let mapping = new CreateMech(mech)
  mapping.mech = mech
  mapping.serviceId = serviceId
  mapping.mechFactory = Address.zero()
  mapping.blockNumber = BigInt.fromI32(0)
  mapping.blockTimestamp = BigInt.fromI32(0)
  mapping.transactionHash = Bytes.fromHexString("0x00")
  mapping.save()

  let mechEntity = new Mech(serviceId.toString())
  mechEntity.address = mech
  mechEntity.mechFactory = Address.zero()
  mechEntity.owner = Address.zero()
  mechEntity.service = serviceId.toString()
  mechEntity.totalDeliveriesTransactions = BigInt.fromI32(0)
  mechEntity.receivedRequests = BigInt.fromI32(0)
  mechEntity.selfDeliveredFromReceived = BigInt.fromI32(0)
  mechEntity.deliveredByOthersFromReceived = BigInt.fromI32(0)
  mechEntity.maxDeliveryRate = null
  mechEntity.karma = BigInt.fromI32(0)
  
  mechEntity.paymentType = Bytes.fromHexString("0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1")
  mechEntity.save()
}

export function createMaxDeliveryRateUpdatedEvent(
  mech: Address,
  maxDeliveryRate: BigInt
): MaxDeliveryRateUpdated {
  return changetype<MaxDeliveryRateUpdated>(
    createBaseMaxDeliveryRateUpdatedEvent(mech, maxDeliveryRate)
  );
}
