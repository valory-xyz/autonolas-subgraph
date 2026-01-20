import { newMockEvent } from "matchstick-as"
import {
  CreateMech,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceParamsUpdated,
  MarketplaceRequest,
  OwnerUpdated,
  Deliver as DeliverWithSignaturesV2,
} from "../../generated/MechMarketplaceV2/MechMarketplaceV2"
import { Deliver as DeliverWithSignaturesV1 } from "../../generated/MechMarketplaceV1/MechMarketplaceV1"
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  mockMarketplaceDeliverIpfs,
  mockMarketplaceRequestIpfs,
} from "./ipfs-mock-helpers"

export function createCreateMechEvent(
  mech: Address,
  serviceId: BigInt,
  mechFactory: Address
): CreateMech {
  let event = changetype<CreateMech>(newMockEvent())

  event.transaction.hash = mech
  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  event.parameters.push(
    new ethereum.EventParam("serviceId", ethereum.Value.fromUnsignedBigInt(serviceId))
  )
  event.parameters.push(
    new ethereum.EventParam("mechFactory", ethereum.Value.fromAddress(mechFactory))
  )

  return event
}

export function createMarketplaceDeliveryEvent(
  deliveryMech: Address,
  requesters: Address[],
  numDeliveries: BigInt,
  requestIds: Bytes[],
  deliveredRequests: boolean[]
): MarketplaceDelivery {
  let event = changetype<MarketplaceDelivery>(newMockEvent())

  event.transaction.hash = requestIds[0]
  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("deliveryMech", ethereum.Value.fromAddress(deliveryMech))
  )
  event.parameters.push(
    new ethereum.EventParam("requesters", ethereum.Value.fromAddressArray(requesters))
  )
  event.parameters.push(
    new ethereum.EventParam("numDeliveries", ethereum.Value.fromUnsignedBigInt(numDeliveries))
  )
  event.parameters.push(
    new ethereum.EventParam("requestIds", ethereum.Value.fromBytesArray(requestIds))
  )
  event.parameters.push(
    new ethereum.EventParam("deliveredRequests", ethereum.Value.fromBooleanArray(deliveredRequests))
  )

  return event
}

export function createMarketplaceDeliveryWithSignaturesEvent(
  deliveryMech: Address,
  requester: Address,
  numDeliveries: BigInt,
  requestIds: Bytes[]
): MarketplaceDeliveryWithSignatures {
  let event = changetype<MarketplaceDeliveryWithSignatures>(newMockEvent())

  event.transaction.hash = requestIds[0]
  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("deliveryMech", ethereum.Value.fromAddress(deliveryMech))
  )
  event.parameters.push(
    new ethereum.EventParam("requester", ethereum.Value.fromAddress(requester))
  )
  event.parameters.push(
    new ethereum.EventParam("numDeliveries", ethereum.Value.fromUnsignedBigInt(numDeliveries))
  )
  event.parameters.push(
    new ethereum.EventParam("requestIds", ethereum.Value.fromBytesArray(requestIds))
  )

  return event
}

export function createDeliverWithSignaturesV1Event(
  mech: Address,
  mechServiceMultisig: Address,
  requestId: Bytes,
  deliveryRate: BigInt,
  data: Bytes
): DeliverWithSignaturesV1 {
  let event = changetype<DeliverWithSignaturesV1>(newMockEvent())

  event.transaction.hash = requestId
  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  event.parameters.push(
    new ethereum.EventParam("mechServiceMultisig", ethereum.Value.fromAddress(mechServiceMultisig))
  )
  event.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromBytes(requestId))
  )
  event.parameters.push(
    new ethereum.EventParam("deliveryRate", ethereum.Value.fromUnsignedBigInt(deliveryRate))
  )
  event.parameters.push(
    new ethereum.EventParam("data", ethereum.Value.fromBytes(data))
  )

  mockMarketplaceDeliverIpfs(data, requestId)

  return event
}

export function createDeliverWithSignaturesV2Event(
  mech: Address,
  mechServiceMultisig: Address,
  requestId: Bytes,
  deliveryRate: BigInt,
  requestData: Bytes,
  deliveryData: Bytes
): DeliverWithSignaturesV2 {
  let event = changetype<DeliverWithSignaturesV2>(newMockEvent())

  event.transaction.hash = requestId
  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  event.parameters.push(
    new ethereum.EventParam("mechServiceMultisig", ethereum.Value.fromAddress(mechServiceMultisig))
  )
  event.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromBytes(requestId))
  )
  event.parameters.push(
    new ethereum.EventParam("deliveryRate", ethereum.Value.fromUnsignedBigInt(deliveryRate))
  )
  event.parameters.push(
    new ethereum.EventParam("requestData", ethereum.Value.fromBytes(requestData))
  )
  event.parameters.push(
    new ethereum.EventParam("deliveryData", ethereum.Value.fromBytes(deliveryData))
  )

  mockMarketplaceRequestIpfs(requestData, requestId)
  mockMarketplaceDeliverIpfs(deliveryData, requestId)

  return event
}

export function createMarketplaceRequestEvent(
  priorityMech: Address,
  requester: Address,
  requestIds: Bytes[],
  requestDatas: Bytes[]
): MarketplaceRequest {
  let event = changetype<MarketplaceRequest>(newMockEvent())

  event.transaction.hash = requestIds[0]
  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("priorityMech", ethereum.Value.fromAddress(priorityMech))
  )
  event.parameters.push(
    new ethereum.EventParam("requester", ethereum.Value.fromAddress(requester))
  )
  event.parameters.push(
    new ethereum.EventParam(
      "numRequests",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(requestIds.length))
    )
  )
  event.parameters.push(
    new ethereum.EventParam("requestIds", ethereum.Value.fromBytesArray(requestIds))
  )
  event.parameters.push(
    new ethereum.EventParam("requestDatas", ethereum.Value.fromBytesArray(requestDatas))
  )

  for (let i = 0; i < requestDatas.length; i++) {
    mockMarketplaceRequestIpfs(requestDatas[i], requestIds[i])
  }

  return event
}

export function createMarketplaceParamsUpdatedEvent(
  fee: BigInt,
  minTimeout: BigInt,
  maxTimeout: BigInt
): MarketplaceParamsUpdated {
  let event = changetype<MarketplaceParamsUpdated>(newMockEvent())

  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(fee))
  )
  event.parameters.push(
    new ethereum.EventParam(
      "minResponseTimeout",
      ethereum.Value.fromUnsignedBigInt(minTimeout)
    )
  )
  event.parameters.push(
    new ethereum.EventParam(
      "maxResponseTimeout",
      ethereum.Value.fromUnsignedBigInt(maxTimeout)
    )
  )

  return event
}

export function createOwnerUpdatedEvent(owner: Address): OwnerUpdated {
  let event = changetype<OwnerUpdated>(newMockEvent())

  event.parameters = new Array()
  event.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner))
  )

  return event
}
