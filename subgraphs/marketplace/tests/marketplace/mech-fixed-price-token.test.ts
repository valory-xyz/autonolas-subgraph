import {
  assert,
  describe,
  test,
  afterEach,
  clearStore
} from "matchstick-as/assembly/index"
import { Address, BigInt, BigInt as BI } from "@graphprotocol/graph-ts"
import { handleDeliver, handleRequest, handleRevokeRequest } from "../../src/marketplace/mech-fixed-price-token"
import { createDeliverEvent, createRequestEvent, createRevokeEvent } from "./mech-fixed-price-token-utils"
import {
  TEST_MECH,
  TEST_MECH_SERVICE_MULTISIG,
  TEST_REQUEST_ID_1,
  TEST_REQUEST_ID_2,
  TEST_REQUEST_ID_3,
  TEST_REQUEST_ID_4,
  TEST_DATA_TOKEN,
  TEST_DELIVERY_RATE_TOKEN
} from "./test-constants"

import { CreateMech as CreateMechEntity, Mech } from "../../generated/schema"
import { Bytes } from "@graphprotocol/graph-ts"

function createMechWithMapping(mechAddress: Address, serviceId: BigInt): void {
  let mapping = new CreateMechEntity(mechAddress)
  mapping.mech = mechAddress
  mapping.serviceId = serviceId
  mapping.mechFactory = Address.zero()
  mapping.blockNumber = BI.fromI32(0)
  mapping.blockTimestamp = BI.fromI32(0)
  mapping.transactionHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")
  mapping.save()

  let mechEntity = new Mech(serviceId.toString())
  mechEntity.address = mechAddress
  mechEntity.mechFactory = Address.zero()
  mechEntity.owner = Address.zero()
  mechEntity.service = serviceId.toString()
  mechEntity.totalDeliveriesTransactions = BI.fromI32(0)
  mechEntity.receivedRequests = BI.fromI32(0)
  mechEntity.selfDeliveredFromReceived = BI.fromI32(0)
  mechEntity.deliveredByOthersFromReceived = BI.fromI32(0)
  mechEntity.save()
}

describe("Mech Fixed Price Token Handler", () => {
  afterEach(() => {
    clearStore()
  })

  test("Request creates Request and RequestToMarketplace entities", () => {
    let serviceId = BigInt.fromI32(1)
    createMechWithMapping(TEST_MECH, serviceId)
    
    let requestId = TEST_REQUEST_ID_1
    let data = TEST_DATA_TOKEN

    let requestEvent = createRequestEvent(TEST_MECH, requestId, data)

    assert.entityCount("Request", 0)
    assert.entityCount("RequestToMarketplace", 0)
    assert.entityCount("Sender", 0)
    assert.entityCount("Global", 0)

    handleRequest(requestEvent)

    assert.entityCount("Request", 1)
    assert.entityCount("RequestToMarketplace", 1)
    assert.entityCount("Sender", 1)
    assert.entityCount("Global", 1)

    assert.fieldEquals("Request", requestId.toHexString(), "mech", serviceId.toString())
    assert.fieldEquals("Request", requestId.toHexString(), "sender", requestEvent.transaction.from.toHexString())
    assert.fieldEquals("RequestToMarketplace", requestId.toHexString(), "ipfsHashBytes", data.toHexString())

    assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalRequests", "1")
    assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalMarketplaceRequests", "1")

    assert.fieldEquals("Global", "", "totalRequests", "1")
    assert.fieldEquals("Global", "", "totalTransactions", "1")
  })

  test("Delivery creates Deliver and DeliverForMarketplace entities", () => {
    // Arrange - create request first (required for delivery)
    let serviceId = BigInt.fromI32(2)
    createMechWithMapping(TEST_MECH, serviceId)
    
    let requestId = TEST_REQUEST_ID_2
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let data = TEST_DATA_TOKEN

    let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
    handleRequest(requestEvent)

    // Verify initial state for delivery entities
    assert.entityCount("Deliver", 0)
    assert.entityCount("DeliverForMarketplace", 0)

    let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)

    handleDeliver(deliverEvent)

    assert.entityCount("Deliver", 1)
    assert.entityCount("DeliverForMarketplace", 1)
    assert.entityCount("AtaTransaction", 1)

    let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "mech", TEST_MECH.toHexString())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "sender", requestEvent.transaction.from.toHexString())

    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "requestId", requestId.toHexString())
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "ipfsHashBytes", data.toHexString())
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "mechServiceMultisig", TEST_MECH_SERVICE_MULTISIG.toHexString())
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliveryRate", deliveryRate.toString())
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliver", deliverId.toHexString())

    assert.fieldEquals("Global", "", "totalDeliveries", "1")
    assert.fieldEquals("Global", "", "totalTransactions", "2")
    assert.fieldEquals("Global", "", "totalAtaTransactions", "1")
  })

  test("Request and delivery together", () => {
    let serviceId = BigInt.fromI32(3)
    createMechWithMapping(TEST_MECH, serviceId)
    
    let requestId = TEST_REQUEST_ID_3
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let data = TEST_DATA_TOKEN

    let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
    handleRequest(requestEvent)

    let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)
    handleDeliver(deliverEvent)

    assert.entityCount("Request", 1)
    assert.entityCount("RequestToMarketplace", 1)
    assert.entityCount("Deliver", 1)
    assert.entityCount("DeliverForMarketplace", 1)

    let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
    
    assert.fieldEquals("Global", "", "totalRequests", "1")
    assert.fieldEquals("Global", "", "totalDeliveries", "1")
    assert.fieldEquals("Global", "", "totalTransactions", "2")
    assert.fieldEquals("Global", "", "totalAtaTransactions", "1")
  })

  test("Full request-delivery cycle", () => {
    let serviceId = BigInt.fromI32(4)
    createMechWithMapping(TEST_MECH, serviceId)
    
    let requestId = TEST_REQUEST_ID_4
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let data = TEST_DATA_TOKEN

    assert.entityCount("Request", 0)
    assert.entityCount("Deliver", 0)
    assert.entityCount("Global", 0)

    let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
    handleRequest(requestEvent)

    assert.entityCount("Request", 1)
    assert.fieldEquals("Global", "", "totalRequests", "1")
    assert.fieldEquals("Global", "", "totalTransactions", "1")

    let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)
    handleDeliver(deliverEvent)

    assert.entityCount("Request", 1)
    assert.entityCount("RequestToMarketplace", 1)
    assert.entityCount("Deliver", 1)
    assert.entityCount("DeliverForMarketplace", 1)

    let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "sender", requestEvent.transaction.from.toHexString())
    
    assert.fieldEquals("Global", "", "totalRequests", "1")
    assert.fieldEquals("Global", "", "totalDeliveries", "1")
    assert.fieldEquals("Global", "", "totalTransactions", "2")
    assert.fieldEquals("Global", "", "totalAtaTransactions", "1")
  })

  test("Revoke decrements undelivered when not delivered", () => {
    const serviceId = BI.fromI32(16)

    let mapping = new CreateMechEntity(TEST_MECH)
    mapping.mech = TEST_MECH
    mapping.serviceId = serviceId
    mapping.mechFactory = Address.zero()
    mapping.blockNumber = BI.fromI32(0)
    mapping.blockTimestamp = BI.fromI32(0)
    mapping.transactionHash = TEST_REQUEST_ID_1
    mapping.save()

    let mechEntity = new Mech(serviceId.toString())
    mechEntity.address = TEST_MECH
    mechEntity.mechFactory = Address.zero()
    mechEntity.owner = Address.zero()
    mechEntity.service = serviceId.toString()
    mechEntity.totalDeliveriesTransactions = BI.fromI32(0)
    mechEntity.receivedRequests = BI.fromI32(0)
    mechEntity.selfDeliveredFromReceived = BI.fromI32(0)
    mechEntity.deliveredByOthersFromReceived = BI.fromI32(0)
    mechEntity.save()

    handleRequest(createRequestEvent(TEST_MECH, TEST_REQUEST_ID_1, TEST_DATA_TOKEN))

    // Assert initial counters
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "0")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")

    // RevokeRequest is informational only - RevokeRequest and Deliver are mutually exclusive
    handleRevokeRequest(createRevokeEvent(TEST_MECH, TEST_REQUEST_ID_1))

    // Assert counters remain unchanged
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "0")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
  })

  test("RevokeRequest on already delivered request is informational only", () => {
    const serviceId = BI.fromI32(32)

    let mapping = new CreateMechEntity(TEST_MECH)
    mapping.mech = TEST_MECH
    mapping.serviceId = serviceId
    mapping.mechFactory = Address.zero()
    mapping.blockNumber = BI.fromI32(0)
    mapping.blockTimestamp = BI.fromI32(0)
    mapping.transactionHash = TEST_REQUEST_ID_1
    mapping.save()

    let mechEntity = new Mech(serviceId.toString())
    mechEntity.address = TEST_MECH
    mechEntity.mechFactory = Address.zero()
    mechEntity.owner = Address.zero()
    mechEntity.service = serviceId.toString()
    mechEntity.totalDeliveriesTransactions = BI.fromI32(0)
    mechEntity.receivedRequests = BI.fromI32(0)
    mechEntity.selfDeliveredFromReceived = BI.fromI32(0)
    mechEntity.deliveredByOthersFromReceived = BI.fromI32(0)
    mechEntity.save()

    handleRequest(createRequestEvent(TEST_MECH, TEST_REQUEST_ID_1, TEST_DATA_TOKEN))
    handleDeliver(
      createDeliverEvent(
        TEST_MECH,
        TEST_REQUEST_ID_1,
        TEST_MECH_SERVICE_MULTISIG,
        BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN),
        TEST_DATA_TOKEN
      )
    )

    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "isDelivered", "true")
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "1")

    // RevokeRequest is informational only - RevokeRequest and Deliver are mutually exclusive
    handleRevokeRequest(createRevokeEvent(TEST_MECH, TEST_REQUEST_ID_1))

    // Assert counters remain unchanged
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "1")
  })

  test("Self-delivery increments selfDeliveredFromReceived counter", () => {
    // Arrange
    let serviceId = BigInt.fromI32(324)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let testMech = Address.fromString("0x0000000000000000000000000000000000000324")
    createMechWithMapping(testMech, serviceId)

    // Act - Request and deliver by same mech
    handleRequest(createRequestEvent(testMech, TEST_REQUEST_ID_1, TEST_DATA_TOKEN))
    handleDeliver(createDeliverEvent(testMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN))

    // Assert
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "priorityMech", testMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "deliveredByMech", testMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "isDelivered", "true")
    
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
  })

  test("Other-mech delivery increments deliveredByOthersFromReceived counter", () => {
    // Arrange
    let priorityMechServiceId = BigInt.fromI32(340)
    let deliveryMechServiceId = BigInt.fromI32(356)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    
    let priorityMech = Address.fromString("0x0000000000000000000000000000000000000340")
    let deliveryMech = Address.fromString("0x0000000000000000000000000000000000000356")
    
    createMechWithMapping(priorityMech, priorityMechServiceId)
    createMechWithMapping(deliveryMech, deliveryMechServiceId)

    // Request goes to priority mech
    let requestEvent = createRequestEvent(priorityMech, TEST_REQUEST_ID_1, TEST_DATA_TOKEN)
    
    // But delivery mech delivers it
    let deliverEvent = createDeliverEvent(deliveryMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN)

    // Act
    handleRequest(requestEvent)
    handleDeliver(deliverEvent)

    // Assert - priority mech received but didn't deliver
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "priorityMech", priorityMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "deliveredByMech", deliveryMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "isDelivered", "true")
    
    // Priority mech counters - received but delivered by others
    assert.fieldEquals("Mech", priorityMechServiceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", priorityMechServiceId.toString(), "selfDeliveredFromReceived", "0")
    assert.fieldEquals("Mech", priorityMechServiceId.toString(), "deliveredByOthersFromReceived", "1")
    
    // Delivery mech counters - didn't receive this request, so no counter changes
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "receivedRequests", "0")
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "selfDeliveredFromReceived", "0")
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "deliveredByOthersFromReceived", "0")
  })

  test("Multiple self-deliveries increment counter correctly", () => {
    // Arrange
    let serviceId = BigInt.fromI32(372)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let testMech = Address.fromString("0x0000000000000000000000000000000000000372")
    createMechWithMapping(testMech, serviceId)

    let requestId1 = Bytes.fromHexString("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    let requestId2 = Bytes.fromHexString("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")

    // Act - Two requests and two deliveries by same mech
    handleRequest(createRequestEvent(testMech, requestId1, TEST_DATA_TOKEN))
    handleRequest(createRequestEvent(testMech, requestId2, TEST_DATA_TOKEN))
    
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "2")
    
    handleDeliver(createDeliverEvent(testMech, requestId1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN))
    handleDeliver(createDeliverEvent(testMech, requestId2, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN))

    // Assert
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
  })
})
