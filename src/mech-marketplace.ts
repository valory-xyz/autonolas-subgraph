import { Address, Bytes } from "@graphprotocol/graph-ts"
import {
  CreateMech as CreateMechEvent,
  Deliver as DeliverEvent,
  ImplementationUpdated as ImplementationUpdatedEvent,
  MarketplaceDelivery as MarketplaceDeliveryEvent,
  MarketplaceDeliveryWithSignatures as MarketplaceDeliveryWithSignaturesEvent,
  MarketplaceParamsUpdated as MarketplaceParamsUpdatedEvent,
  MarketplaceRequest as MarketplaceRequestEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  SetMechFactoryStatuses as SetMechFactoryStatusesEvent,
  SetPaymentTypeBalanceTrackers as SetPaymentTypeBalanceTrackersEvent
} from "../generated/MechMarketplace/MechMarketplace"
import {
  CreateMech,
  Deliver,
  ImplementationUpdated,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceParamsUpdated,
  MarketplaceRequest,
  Mech,
  OwnerUpdated,
  Service,
  SetMechFactoryStatuses,
  SetPaymentTypeBalanceTrackers
} from "../generated/schema"
import { createOrGetSender, getGlobal } from "./utils"

export function handleCreateMech(event: CreateMechEvent): void {
  let entity = new CreateMech(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.mech = event.params.mech
  entity.serviceId = event.params.serviceId
  entity.mechFactory = event.params.mechFactory

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Create Mech entity
  let mechAgent = new Mech(event.params.serviceId.toHexString())

  mechAgent.address = event.params.mech
  mechAgent.mechFactory = event.params.mechFactory
  mechAgent.owner = event.transaction.from;

  // Get service configHash from Service entity and write it to Mech
  let service = Service.load(event.params.serviceId.toHexString());
  if (service !== null) {
    mechAgent.configHash = service.configHash
  }

  mechAgent.save()

  let global = getGlobal();
  global.totalMechs += 1;
  global.save()
}

export function handleDeliver(event: DeliverEvent): void {
  let entity = new Deliver(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.mech = event.params.mech
  entity.mechServiceMultisig = event.params.mechServiceMultisig
  entity.requestId = event.params.requestId
  entity.deliveryRate = event.params.deliveryRate
  entity.data = event.params.data

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleImplementationUpdated(
  event: ImplementationUpdatedEvent
): void {
  let entity = new ImplementationUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.implementation = event.params.implementation

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleMarketplaceDelivery(
  event: MarketplaceDeliveryEvent
): void {
  let entity = new MarketplaceDelivery(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.deliveryMech = event.params.deliveryMech
  entity.requesters = event.params.requesters
  entity.numDeliveries = event.params.numDeliveries
  entity.requestIds = event.params.requestIds
  entity.deliveredRequests = event.params.deliveredRequests

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  let global = getGlobal();
  global.totalDeliveries += event.params.numDeliveries.toI32();
  global.totalMarketplaceDeliveries += 1
  global.totalTransactions += 1;
  global.save()
}

export function handleMarketplaceDeliveryWithSignatures(
  event: MarketplaceDeliveryWithSignaturesEvent
): void {
  let entity = new MarketplaceDeliveryWithSignatures(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.deliveryMech = event.params.deliveryMech
  entity.requester = event.params.requester
  entity.numDeliveries = event.params.numDeliveries
  entity.requestIds = event.params.requestIds

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.save();

  let sender = createOrGetSender(event.params.requester);
  /* As these requests are made off-chain we assume that the number of requests 
  is the same as number of deliveries, and add the same to `totalRequests` */
  sender.totalOffChainRequests += event.params.numDeliveries.toI32();
  sender.totalRequests += event.params.numDeliveries.toI32();
  sender.totalTransactions += 1
  sender.save();
  
  let global = getGlobal();

  // For this event, total number of deliveries is the same as total number of requests
  global.totalRequests += event.params.numDeliveries.toI32();

  global.totalDeliveries += event.params.numDeliveries.toI32();
  global.totalMarketplaceDeliveriesWithSignatures += 1;

  // 1 for each request and delivery (request is off-chain)
  global.totalTransactions += 2;
  global.save()
}

export function handleMarketplaceParamsUpdated(
  event: MarketplaceParamsUpdatedEvent
): void {
  let entity = new MarketplaceParamsUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.fee = event.params.fee
  entity.minResponseTimeout = event.params.minResponseTimeout
  entity.maxResponseTimeout = event.params.maxResponseTimeout

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleMarketplaceRequest(event: MarketplaceRequestEvent): void {
  let entity = new MarketplaceRequest(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.priorityMech = event.params.priorityMech
  entity.requester = event.params.requester
  entity.numRequests = event.params.numRequests
  entity.requestIds = event.params.requestIds

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  let sender = createOrGetSender(event.params.requester)
  sender.totalTransactions += 1
  sender.totalMarketplaceRequests += 1
  sender.totalRequests += event.params.numRequests.toI32();
  sender.save()

  // Set the sender relationship
  entity.sender = sender.id
  entity.save()

  let global = getGlobal();
  global.totalMarketplaceRequests += 1;
  global.totalRequests += event.params.numRequests.toI32();
  global.totalTransactions += 1;
  global.save()
}

export function handleOwnerUpdated(event: OwnerUpdatedEvent): void {
  let entity = new OwnerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.owner = event.params.owner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSetMechFactoryStatuses(
  event: SetMechFactoryStatusesEvent
): void {
  let entity = new SetMechFactoryStatuses(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )

  // Convert Address[] to Bytes[]
  let mechFactories: Bytes[] = event.params.mechFactories.map<Bytes>(
    (address: Address): Bytes => {
      return address as Bytes;
    }
  );
  entity.mechFactories = mechFactories

  entity.statuses = event.params.statuses

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSetPaymentTypeBalanceTrackers(
  event: SetPaymentTypeBalanceTrackersEvent
): void {
  let entity = new SetPaymentTypeBalanceTrackers(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.paymentTypes = event.params.paymentTypes

  // Convert Address[] to Bytes[]
  let balanceTrackers: Bytes[] = event.params.balanceTrackers.map<Bytes>(
    (address: Address): Bytes => {
      return address as Bytes;
    }
  );
  entity.balanceTrackers = balanceTrackers

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
