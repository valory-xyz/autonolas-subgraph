import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import { CreateMech } from "../generated/MechFactoryFixedPriceNative/MechFactory"

export function createMechFactoryCreateEvent(
  mech: Address,
  serviceId: BigInt,
  maxDeliveryRate: BigInt
): CreateMech {
  let event = changetype<CreateMech>(newMockEvent())

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
