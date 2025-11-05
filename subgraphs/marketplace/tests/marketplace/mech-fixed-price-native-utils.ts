import { newMockEvent } from "matchstick-as"
import {
  Deliver,
  Request,
  RevokeRequest,
  MaxDeliveryRateUpdated
} from "../../generated/templates/MechFixedPriceNative/MechFixedPriceNative"
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import { CreateMech, Mech } from "../../generated/schema"

export function createDeliverEvent(
  mech: Address,
  requestId: Bytes,
  mechServiceMultisig: Address,
  deliveryRate: BigInt,
  data: Bytes
): Deliver {
  let deliverEvent = changetype<Deliver>(newMockEvent())

  deliverEvent.transaction.hash = requestId
  deliverEvent.parameters = new Array()

  deliverEvent.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam("mechServiceMultisig", ethereum.Value.fromAddress(mechServiceMultisig))
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromBytes(requestId))
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam("deliveryRate", ethereum.Value.fromUnsignedBigInt(deliveryRate))
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam("data", ethereum.Value.fromBytes(data))
  )

  return deliverEvent
}

export function createRequestEvent(
  mech: Address,
  requestId: Bytes,
  data: Bytes
): Request {
  let requestEvent = changetype<Request>(newMockEvent())

  requestEvent.transaction.hash = requestId
  requestEvent.parameters = new Array()

  requestEvent.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  requestEvent.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromBytes(requestId))
  )
  requestEvent.parameters.push(
    new ethereum.EventParam("data", ethereum.Value.fromBytes(data))
  )

  return requestEvent
}

export function createRevokeEvent(
  mech: Address,
  requestId: Bytes
): RevokeRequest {
  let revokeEvent = changetype<RevokeRequest>(newMockEvent())
  revokeEvent.address = mech
  revokeEvent.transaction.hash = requestId
  revokeEvent.parameters = new Array()

  revokeEvent.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromBytes(requestId))
  )

  return revokeEvent
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
  let event = changetype<MaxDeliveryRateUpdated>(newMockEvent())
  event.address = mech
  event.parameters = new Array()

  event.parameters.push(
    new ethereum.EventParam("maxDeliveryRate", ethereum.Value.fromUnsignedBigInt(maxDeliveryRate))
  )

  return event
}
