import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  CreateMech,
  OwnerUpdated,
  Pause,
  Unpause
} from "../generated/AgentFactory/AgentFactory"
import { Transfer, Transfer as TransferEvent } from "../generated/AgentRegistry/AgentRegistry"
import { Service } from "../generated/schema"

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

export function createTransferEvent(
  from: Address,
  to: Address,
  id: BigInt
): TransferEvent {
  let transferEvent = changetype<TransferEvent>(newMockEvent())

  transferEvent.parameters = new Array()

  transferEvent.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  )

  return transferEvent
}

export function createService(
  serviceId: BigInt,
  agentIds: BigInt[]
): void {
  let service = new Service(serviceId.toString())
  service.serviceId = serviceId
  service.historicalMultisigs = []
  service.totalRequests = BigInt.fromI32(0)
  service.totalDeliveries = BigInt.fromI32(0)
  service.agentIds = agentIds
  service.save()
}