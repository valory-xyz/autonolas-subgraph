import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import { CreateMechFixedPriceNative } from "../generated/MechFactoryFixedPriceNative/MechFactoryFixedPriceNative"

export function createMechFactoryCreateEvent(
  mech: Address,
  serviceId: BigInt,
  maxDeliveryRate: BigInt
): CreateMechFixedPriceNative {
  let event = changetype<CreateMechFixedPriceNative>(newMockEvent())

  event.parameters = new Array()

  event.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  event.parameters.push(
    new ethereum.EventParam(
      "serviceId",
      ethereum.Value.fromUnsignedBigInt(serviceId)
    )
  )
  event.parameters.push(
    new ethereum.EventParam(
      "maxDeliveryRate",
      ethereum.Value.fromUnsignedBigInt(maxDeliveryRate)
    )
  )

  return event
}
