import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  CreateMech,
  OwnerUpdated,
  Pause,
  Unpause
} from "../generated/AgentFactory/AgentFactory"

export function createCreateMechEvent(
  mech: Address,
  agentId: BigInt,
  price: BigInt
): CreateMech {
  let createMechEvent = changetype<CreateMech>(newMockEvent())

  createMechEvent.parameters = new Array()

  createMechEvent.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  createMechEvent.parameters.push(
    new ethereum.EventParam(
      "agentId",
      ethereum.Value.fromUnsignedBigInt(agentId)
    )
  )
  createMechEvent.parameters.push(
    new ethereum.EventParam("price", ethereum.Value.fromUnsignedBigInt(price))
  )

  return createMechEvent
}
