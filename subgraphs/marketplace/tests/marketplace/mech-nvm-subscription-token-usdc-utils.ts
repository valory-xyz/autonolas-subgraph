import { newMockEvent } from "matchstick-as"
import {
  Deliver,
  Request
} from "../../generated/templates/MechNvmSubscriptionTokenUSDC/MechNvmSubscriptionTokenUSDC"
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"

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

