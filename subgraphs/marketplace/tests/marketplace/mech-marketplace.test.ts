import {
  assert,
  describe,
  test,
  afterEach,
  clearStore,
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes, log } from "@graphprotocol/graph-ts"
import {
  handleCreateMech,
  handleMarketplaceDelivery,
  handleMarketplaceDeliveryWithSignatures,
  handleDeliverWithSignaturesV1,
  handleDeliverWithSignaturesV2,
  handleMarketplaceRequest,
  handleOwnerUpdated,
  handleSetMechFactoryStatuses,
  handleSetPaymentTypeBalanceTrackers,
} from "../../src/marketplace/mech-marketplace"
import {
  createCreateMechEvent,
  createMarketplaceDeliveryEvent,
  createMarketplaceDeliveryWithSignaturesEvent,
  createDeliverWithSignaturesV1Event,
  createDeliverWithSignaturesV2Event,
  createMarketplaceRequestEvent,
  createOwnerUpdatedEvent,
  createSetMechFactoryStatusesEvent,
  createSetPaymentTypeBalanceTrackersEvent,
} from "./mech-marketplace-utils"
import {
  CreateMech as CreateMechEntity,
  CreateMultisigWithAgents,
  Mech,
  Request,
  Service,
  Sender,
} from "../../generated/schema"

function createService(serviceId: BigInt, agentIds: BigInt[]): void {
  let service = new Service(serviceId.toString())
  service.serviceId = serviceId
  service.historicalMultisigs = []
  service.totalRequests = BigInt.fromI32(0)
  service.totalDeliveries = BigInt.fromI32(0)
  service.agentIds = agentIds
  service.save()
}

function createMultisig(multisig: Address, serviceId: BigInt): void {
  let entity = new CreateMultisigWithAgents(Bytes.fromHexString(multisig.toHexString()))
  entity.serviceId = serviceId
  entity.multisig = multisig
  entity.blockNumber = BigInt.fromI32(0)
  entity.blockTimestamp = BigInt.fromI32(0)
  entity.transactionHash = Bytes.fromHexString("0x01")
  entity.save()
}

function createMechMapping(
  mech: Address,
  serviceId: BigInt,
  mechFactory: Address,
  owner: Address
): void {
  let mapping = new CreateMechEntity(mech)
  mapping.mech = mech
  mapping.serviceId = serviceId
  mapping.mechFactory = mechFactory
  mapping.blockNumber = BigInt.fromI32(0)
  mapping.blockTimestamp = BigInt.fromI32(0)
  mapping.transactionHash = Bytes.fromHexString("0x02")
  mapping.save()

  log.info("Creating mech entity for service ID: {}", [serviceId.toString()]);
  let mechEntity = new Mech(serviceId.toString())
  mechEntity.address = mech
  mechEntity.mechFactory = mechFactory
  mechEntity.owner = owner
  mechEntity.service = serviceId.toString()
  mechEntity.totalDeliveriesTransactions = BigInt.fromI32(0)
  mechEntity.receivedRequests = BigInt.fromI32(0)
  mechEntity.selfDeliveredFromReceived = BigInt.fromI32(0)
  mechEntity.deliveredByOthersFromReceived = BigInt.fromI32(0)
  mechEntity.undeliveredRequests = BigInt.fromI32(0)
  log.info("Saving mech entity for service ID: {}", [serviceId.toString()]);
  mechEntity.save()
}

function createSender(id: Address): void {
  let sender = new Sender(id)
  sender.id = id
  sender.totalRequests = BigInt.fromI32(0)
  sender.totalTransactions = BigInt.fromI32(0)
  sender.totalAtaTransactions = BigInt.fromI32(0)
  sender.totalMarketplaceRequests = BigInt.fromI32(0)
  sender.totalOffChainRequests = BigInt.fromI32(0)
  sender.save()
}

function createRequestEntity(
  requestId: Bytes,
  sender: Address,
  mech: Address
): void {
  // Load the Sender entity (should exist since createSender is called first)
  let senderEntity = Sender.load(sender)
  if (senderEntity === null) {
    // Create it if it doesn't exist
    createSender(sender)
    senderEntity = Sender.load(sender)
    if (senderEntity === null) {
      // Should not happen, but TypeScript requires this check
      return
    }
  }
  
  let request = new Request(requestId)
  // request.sender should be the Sender entity ID (Bytes), not the Address
  request.sender = senderEntity.id
  request.mech = mech.toHexString()
  request.blockNumber = BigInt.fromI32(0)
  request.blockTimestamp = BigInt.fromI32(0)
  request.transactionHash = requestId
  request.isDelivered = false
  request.save()
}

describe("Mech Marketplace Handlers", () => {
  afterEach(() => {
    clearStore()
  })

  test("handleCreateMech stores entities and updates global counters", () => {
    let mech = Address.fromString("0x00000000000000000000000000000000000000aa")
    let serviceId = BigInt.fromI32(16) 
    let mechFactory = Address.fromString("0x00000000000000000000000000000000000000bb")

    let event = createCreateMechEvent(mech, serviceId, mechFactory)
    handleCreateMech(event)

    assert.fieldEquals("CreateMech", mech.toHexString(), "serviceId", "16")
    assert.fieldEquals("Mech", serviceId.toString(), "address", mech.toHexString())
    assert.fieldEquals("Global", "", "totalMechs", "1")
  })

  test("handleMarketplaceDelivery persists aggregated delivery snapshot", () => {
    let serviceId = BigInt.fromI32(200)
    let mech = Address.fromString("0x00000000000000000000000000000000000000cc")
    let mechFactory = Address.fromString("0x00000000000000000000000000000000000000cd")
    let owner = Address.fromString("0x00000000000000000000000000000000000000ce")
    
    // Create the mech so the handler can update its counters
    createMechMapping(mech, serviceId, mechFactory, owner)
    
    let requestIds = [
      Bytes.fromHexString("0x1000000000000000000000000000000000000000000000000000000000000001"),
      Bytes.fromHexString("0x2000000000000000000000000000000000000000000000000000000000000002"),
    ]
    let event = createMarketplaceDeliveryEvent(
      mech,
      [Address.fromString("0x00000000000000000000000000000000000000dd")],
      BigInt.fromI32(2),
      requestIds,
      [true, false]
    )

    handleMarketplaceDelivery(event)

    let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
    assert.fieldEquals("MarketplaceDelivery", id, "deliveryMech", mech.toHexString())
    assert.fieldEquals("MarketplaceDelivery", id, "numDeliveries", "2")
    
    // Verify mech counter was updated
    assert.fieldEquals("Mech", serviceId.toString(), "totalDeliveriesTransactions", "1")
  })

  test("handleMarketplaceDeliveryWithSignatures records off-chain deliveries", () => {
    let serviceId = BigInt.fromI32(112) 
    let mech = Address.fromString("0x00000000000000000000000000000000000000ee")
    let mechFactory = Address.fromString("0x00000000000000000000000000000000000000ef")
    let requester = Address.fromString("0x00000000000000000000000000000000000000f0")
    let agentId = BigInt.fromI32(33)

    createService(serviceId, [agentId])
    createMultisig(requester, serviceId)
    createMechMapping(mech, serviceId, mechFactory, requester)

    let requestIds = [
      Bytes.fromHexString("0x3000000000000000000000000000000000000000000000000000000000000003"),
      Bytes.fromHexString("0x4000000000000000000000000000000000000000000000000000000000000004"),
    ]
    let event = createMarketplaceDeliveryWithSignaturesEvent(
      mech,
      requester,
      BigInt.fromI32(2),
      requestIds
    )

    handleMarketplaceDeliveryWithSignatures(event)

    assert.entityCount("Deliver", 2)
    assert.fieldEquals("DeliverForMarketplace", requestIds[0].toHexString(), "isOffChain", "true")
    assert.fieldEquals("Sender", requester.toHexString(), "totalOffChainRequests", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "totalDeliveriesTransactions", "1")
    assert.fieldEquals("Global", "", "totalDeliveries", "2")
    assert.fieldEquals("Global", "", "totalTransactions", "2")
    assert.fieldEquals("Global", "", "totalAtaTransactions", "2")
  })

  test("handleDeliverWithSignaturesV1 stores delivery data and links to requester", () => {
    let serviceId = BigInt.fromI32(160) 
    let mech = Address.fromString("0x00000000000000000000000000000000000000f1")
    let multisig = Address.fromString("0x00000000000000000000000000000000000000f2")
    let requester = Address.fromString("0x00000000000000000000000000000000000000f3")
    let requestId = Bytes.fromHexString("0x5000000000000000000000000000000000000000000000000000000000000005")
    let agentId = BigInt.fromI32(50)

    createService(serviceId, [agentId])
    createMechMapping(mech, serviceId, multisig, requester)

    // In real scenario, both events occur in same transaction
    // handleMarketplaceDeliveryWithSignatures sets the sender
    let deliveryEvent = createMarketplaceDeliveryWithSignaturesEvent(
      mech,
      requester,
      BigInt.fromI32(1),
      [requestId]
    )
    // Use same transaction hash so events appear in same transaction
    let deliverEvent = createDeliverWithSignaturesV1Event(
      mech,
      multisig,
      requestId,
      BigInt.fromI32(10),
      Bytes.fromHexString("0xdeadbeef")
    )
    deliverEvent.transaction.hash = deliveryEvent.transaction.hash

    // Order matters: handleMarketplaceDeliveryWithSignatures sets sender
    handleMarketplaceDeliveryWithSignatures(deliveryEvent)
    handleDeliverWithSignaturesV1(deliverEvent)

    assert.fieldEquals("Deliver", requestId.toHexString(), "sender", requester.toHexString())
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "isOffChain", "true")
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "ipfsHashBytes", "0xdeadbeef")
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliveryRate", "10")
  })

  test("handleDeliverWithSignaturesV2 stores delivery data and links to requester", () => {
    let serviceId = BigInt.fromI32(176)
    let mech = Address.fromString("0x00000000000000000000000000000000000000f4")
    let multisig = Address.fromString("0x00000000000000000000000000000000000000f5")
    let requester = Address.fromString("0x00000000000000000000000000000000000000f6")
    let requestId = Bytes.fromHexString("0x6000000000000000000000000000000000000000000000000000000000000006")
    let agentId = BigInt.fromI32(55)

    createService(serviceId, [agentId])
    createMechMapping(mech, serviceId, multisig, requester)

    // In real scenario, both events occur in same transaction
    // handleMarketplaceDeliveryWithSignatures sets the sender
    let deliveryEvent = createMarketplaceDeliveryWithSignaturesEvent(
      mech,
      requester,
      BigInt.fromI32(1),
      [requestId]
    )
    // Use same transaction hash so events appear in same transaction
    let deliverEvent = createDeliverWithSignaturesV2Event(
      mech,
      multisig,
      requestId,
      BigInt.fromI32(12),
      Bytes.fromHexString("0xaaaa"),
      Bytes.fromHexString("0xbbbb")
    )
    deliverEvent.transaction.hash = deliveryEvent.transaction.hash

    // Order matters: handleMarketplaceDeliveryWithSignatures sets sender
    handleMarketplaceDeliveryWithSignatures(deliveryEvent)
    handleDeliverWithSignaturesV2(deliverEvent)

    assert.fieldEquals("Deliver", requestId.toHexString(), "sender", requester.toHexString())
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "ipfsHashBytes", "0xbbbb")
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliveryRate", "12")
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "isOffChain", "true")
  })

  test("handleMarketplaceRequest creates per-request records and updates counters", () => {
    let serviceId = BigInt.fromI32(4096)
    let requester = Address.fromString("0x0000000000000000000000000000000000000101")
    let priorityMech = Address.fromString("0x0000000000000000000000000000000000000102")
    let mechFactory = Address.fromString("0x0000000000000000000000000000000000000103")
    let agentId = BigInt.fromI32(44)

    createService(serviceId, [agentId])
    createMultisig(requester, serviceId)
    createMechMapping(priorityMech, serviceId, mechFactory, requester)

    let requestIds = [
      Bytes.fromHexString("0x7000000000000000000000000000000000000000000000000000000000000007"),
      Bytes.fromHexString("0x8000000000000000000000000000000000000000000000000000000000000008"),
    ]
    let datas = [Bytes.fromHexString("0x1234"), Bytes.fromHexString("0x5678")]

    let event = createMarketplaceRequestEvent(priorityMech, requester, requestIds, datas)
    handleMarketplaceRequest(event)

    assert.fieldEquals("MarketplaceRequest", event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString(), "priorityMech", priorityMech.toHexString())
    assert.fieldEquals("Global", "", "totalRequests", "2")
    assert.fieldEquals("Global", "", "totalMarketplaceRequests", "1")
    assert.fieldEquals("Sender", requester.toHexString(), "totalRequests", "2")
    assert.fieldEquals("Sender", requester.toHexString(), "totalAtaTransactions", "1")
    assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "2")
  })

  test("handleOwnerUpdated stores snapshot", () => {
    let owner = Address.fromString("0x0000000000000000000000000000000000000201")
    let event = createOwnerUpdatedEvent(owner)
    handleOwnerUpdated(event)

    let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
    assert.fieldEquals("OwnerUpdated", id, "owner", owner.toHexString())
  })

  test("handleSetMechFactoryStatuses captures factory flags", () => {
    let factories = [
      Address.fromString("0x0000000000000000000000000000000000000301"),
      Address.fromString("0x0000000000000000000000000000000000000302"),
    ]
    let event = createSetMechFactoryStatusesEvent(factories, [true, false])
    handleSetMechFactoryStatuses(event)

    let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
    assert.fieldEquals("SetMechFactoryStatuses", id, "statuses", "[true, false]")
  })

  test("handleSetPaymentTypeBalanceTrackers stores tracker mapping", () => {
    let paymentTypes = [Bytes.fromHexString("0xaaaa"), Bytes.fromHexString("0xbbbb")]
    let trackers = [
      Address.fromString("0x0000000000000000000000000000000000000401"),
      Address.fromString("0x0000000000000000000000000000000000000402"),
    ]
    let event = createSetPaymentTypeBalanceTrackersEvent(paymentTypes, trackers)
    handleSetPaymentTypeBalanceTrackers(event)

    let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
    assert.fieldEquals("SetPaymentTypeBalanceTrackers", id, "paymentTypes", "[0xaaaa, 0xbbbb]")
  })
})

