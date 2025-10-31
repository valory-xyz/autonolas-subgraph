import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  CreateMech,
  Deliver,
  ImplementationUpdated,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceParamsUpdated,
  MarketplaceRequest,
  OwnerUpdated,
  SetMechFactoryStatuses,
  SetPaymentTypeBalanceTrackers
} from "../generated/MechMarketplaceV2/MechMarketplaceV2"

export function createCreateMechEvent(
  mech: Address,
  serviceId: BigInt,
  mechFactory: Address
): CreateMech {
  let createMechEvent = changetype<CreateMech>(newMockEvent())

  createMechEvent.parameters = new Array()

  createMechEvent.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  createMechEvent.parameters.push(
    new ethereum.EventParam(
      "serviceId",
      ethereum.Value.fromUnsignedBigInt(serviceId)
    )
  )
  createMechEvent.parameters.push(
    new ethereum.EventParam(
      "mechFactory",
      ethereum.Value.fromAddress(mechFactory)
    )
  )

  return createMechEvent
}

export function createDeliverEvent(
  mech: Address,
  mechServiceMultisig: Address,
  requestId: Bytes,
  deliveryRate: BigInt,
  data: Bytes
): Deliver {
  let deliverEvent = changetype<Deliver>(newMockEvent())

  deliverEvent.parameters = new Array()

  deliverEvent.parameters.push(
    new ethereum.EventParam("mech", ethereum.Value.fromAddress(mech))
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam(
      "mechServiceMultisig",
      ethereum.Value.fromAddress(mechServiceMultisig)
    )
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam(
      "requestId",
      ethereum.Value.fromFixedBytes(requestId)
    )
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam(
      "deliveryRate",
      ethereum.Value.fromUnsignedBigInt(deliveryRate)
    )
  )
  deliverEvent.parameters.push(
    new ethereum.EventParam("data", ethereum.Value.fromBytes(data))
  )

  return deliverEvent
}

export function createImplementationUpdatedEvent(
  implementation: Address
): ImplementationUpdated {
  let implementationUpdatedEvent = changetype<ImplementationUpdated>(
    newMockEvent()
  )

  implementationUpdatedEvent.parameters = new Array()

  implementationUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "implementation",
      ethereum.Value.fromAddress(implementation)
    )
  )

  return implementationUpdatedEvent
}

export function createMarketplaceDeliveryEvent(
  deliveryMech: Address,
  requesters: Array<Address>,
  numDeliveries: BigInt,
  requestIds: Array<Bytes>,
  deliveredRequests: Array<boolean>
): MarketplaceDelivery {
  let marketplaceDeliveryEvent = changetype<MarketplaceDelivery>(newMockEvent())

  marketplaceDeliveryEvent.parameters = new Array()

  marketplaceDeliveryEvent.parameters.push(
    new ethereum.EventParam(
      "deliveryMech",
      ethereum.Value.fromAddress(deliveryMech)
    )
  )
  marketplaceDeliveryEvent.parameters.push(
    new ethereum.EventParam(
      "requesters",
      ethereum.Value.fromAddressArray(requesters)
    )
  )
  marketplaceDeliveryEvent.parameters.push(
    new ethereum.EventParam(
      "numDeliveries",
      ethereum.Value.fromUnsignedBigInt(numDeliveries)
    )
  )
  marketplaceDeliveryEvent.parameters.push(
    new ethereum.EventParam(
      "requestIds",
      ethereum.Value.fromFixedBytesArray(requestIds)
    )
  )
  marketplaceDeliveryEvent.parameters.push(
    new ethereum.EventParam(
      "deliveredRequests",
      ethereum.Value.fromBooleanArray(deliveredRequests)
    )
  )

  return marketplaceDeliveryEvent
}

export function createMarketplaceDeliveryWithSignaturesEvent(
  deliveryMech: Address,
  requester: Address,
  numDeliveries: BigInt,
  requestIds: Array<Bytes>
): MarketplaceDeliveryWithSignatures {
  let marketplaceDeliveryWithSignaturesEvent =
    changetype<MarketplaceDeliveryWithSignatures>(newMockEvent())

  marketplaceDeliveryWithSignaturesEvent.parameters = new Array()

  marketplaceDeliveryWithSignaturesEvent.parameters.push(
    new ethereum.EventParam(
      "deliveryMech",
      ethereum.Value.fromAddress(deliveryMech)
    )
  )
  marketplaceDeliveryWithSignaturesEvent.parameters.push(
    new ethereum.EventParam("requester", ethereum.Value.fromAddress(requester))
  )
  marketplaceDeliveryWithSignaturesEvent.parameters.push(
    new ethereum.EventParam(
      "numDeliveries",
      ethereum.Value.fromUnsignedBigInt(numDeliveries)
    )
  )
  marketplaceDeliveryWithSignaturesEvent.parameters.push(
    new ethereum.EventParam(
      "requestIds",
      ethereum.Value.fromFixedBytesArray(requestIds)
    )
  )

  return marketplaceDeliveryWithSignaturesEvent
}

export function createMarketplaceParamsUpdatedEvent(
  fee: BigInt,
  minResponseTimeout: BigInt,
  maxResponseTimeout: BigInt
): MarketplaceParamsUpdated {
  let marketplaceParamsUpdatedEvent = changetype<MarketplaceParamsUpdated>(
    newMockEvent()
  )

  marketplaceParamsUpdatedEvent.parameters = new Array()

  marketplaceParamsUpdatedEvent.parameters.push(
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(fee))
  )
  marketplaceParamsUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "minResponseTimeout",
      ethereum.Value.fromUnsignedBigInt(minResponseTimeout)
    )
  )
  marketplaceParamsUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "maxResponseTimeout",
      ethereum.Value.fromUnsignedBigInt(maxResponseTimeout)
    )
  )

  return marketplaceParamsUpdatedEvent
}

export function createMarketplaceRequestEvent(
  priorityMech: Address,
  requester: Address,
  numRequests: BigInt,
  requestIds: Array<Bytes>
): MarketplaceRequest {
  let marketplaceRequestEvent = changetype<MarketplaceRequest>(newMockEvent())

  marketplaceRequestEvent.parameters = new Array()

  marketplaceRequestEvent.parameters.push(
    new ethereum.EventParam(
      "priorityMech",
      ethereum.Value.fromAddress(priorityMech)
    )
  )
  marketplaceRequestEvent.parameters.push(
    new ethereum.EventParam("requester", ethereum.Value.fromAddress(requester))
  )
  marketplaceRequestEvent.parameters.push(
    new ethereum.EventParam(
      "numRequests",
      ethereum.Value.fromUnsignedBigInt(numRequests)
    )
  )
  marketplaceRequestEvent.parameters.push(
    new ethereum.EventParam(
      "requestIds",
      ethereum.Value.fromFixedBytesArray(requestIds)
    )
  )

  return marketplaceRequestEvent
}

export function createOwnerUpdatedEvent(owner: Address): OwnerUpdated {
  let ownerUpdatedEvent = changetype<OwnerUpdated>(newMockEvent())

  ownerUpdatedEvent.parameters = new Array()

  ownerUpdatedEvent.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner))
  )

  return ownerUpdatedEvent
}

export function createSetMechFactoryStatusesEvent(
  mechFactories: Array<Address>,
  statuses: Array<boolean>
): SetMechFactoryStatuses {
  let setMechFactoryStatusesEvent = changetype<SetMechFactoryStatuses>(
    newMockEvent()
  )

  setMechFactoryStatusesEvent.parameters = new Array()

  setMechFactoryStatusesEvent.parameters.push(
    new ethereum.EventParam(
      "mechFactories",
      ethereum.Value.fromAddressArray(mechFactories)
    )
  )
  setMechFactoryStatusesEvent.parameters.push(
    new ethereum.EventParam(
      "statuses",
      ethereum.Value.fromBooleanArray(statuses)
    )
  )

  return setMechFactoryStatusesEvent
}

export function createSetPaymentTypeBalanceTrackersEvent(
  paymentTypes: Array<Bytes>,
  balanceTrackers: Array<Address>
): SetPaymentTypeBalanceTrackers {
  let setPaymentTypeBalanceTrackersEvent =
    changetype<SetPaymentTypeBalanceTrackers>(newMockEvent())

  setPaymentTypeBalanceTrackersEvent.parameters = new Array()

  setPaymentTypeBalanceTrackersEvent.parameters.push(
    new ethereum.EventParam(
      "paymentTypes",
      ethereum.Value.fromFixedBytesArray(paymentTypes)
    )
  )
  setPaymentTypeBalanceTrackersEvent.parameters.push(
    new ethereum.EventParam(
      "balanceTrackers",
      ethereum.Value.fromAddressArray(balanceTrackers)
    )
  )

  return setPaymentTypeBalanceTrackersEvent
}
