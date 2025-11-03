import {
  assert,
  describe,
  test,
  afterEach,
  clearStore
} from "matchstick-as/assembly/index"
import { Address, BigInt, BigInt as BI } from "@graphprotocol/graph-ts"
import { handleDeliver, handleRequest, handleRevokeRequest } from "../../src/marketplace/mech-nvm-subscription-native"
import { createDeliverEvent, createRequestEvent, createRevokeEvent } from "./mech-nvm-subscription-native-utils"
import {
  TEST_MECH,
  TEST_MECH_SERVICE_MULTISIG,
  TEST_REQUEST_ID_A,
  TEST_REQUEST_ID_B,
  TEST_REQUEST_ID_C,
  TEST_REQUEST_ID_D,
  TEST_REQUEST_ID_1,
  TEST_DATA_NVM,
  TEST_DELIVERY_RATE_NVM,
  TEST_DATA_NATIVE,
  TEST_DELIVERY_RATE_NATIVE
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
  mechEntity.undeliveredRequests = BI.fromI32(0)
  mechEntity.save()
}

describe("Mech NVM Subscription Native Handler", () => {
  afterEach(() => {
    clearStore()
  })

  test("Request creates Request and RequestToMarketplace entities", () => {
    let requestId = TEST_REQUEST_ID_A
    let data = TEST_DATA_NVM

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

    assert.fieldEquals("Request", requestId.toHexString(), "mech", TEST_MECH.toHexString())
    assert.fieldEquals("Request", requestId.toHexString(), "sender", requestEvent.transaction.from.toHexString())
    assert.fieldEquals("RequestToMarketplace", requestId.toHexString(), "ipfsHashBytes", data.toHexString())

    assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalRequests", "1")
    assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalMarketplaceRequests", "1")

    assert.fieldEquals("Global", "", "totalRequests", "1")
    assert.fieldEquals("Global", "", "totalTransactions", "1")
  })

  test("Delivery creates Deliver and DeliverForMarketplace entities", () => {
    // Arrange - create request first (required for delivery)
    let requestId = TEST_REQUEST_ID_B
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NVM)
    let data = TEST_DATA_NVM

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

    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliveryRate", deliveryRate.toString())
    assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliver", deliverId.toHexString())

    assert.fieldEquals("Global", "", "totalDeliveries", "1")
    assert.fieldEquals("Global", "", "totalTransactions", "2")
    assert.fieldEquals("Global", "", "totalAtaTransactions", "1")
  })

  test("Request and delivery together", () => {
    let requestId = TEST_REQUEST_ID_C
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NVM)
    let data = TEST_DATA_NVM

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
    let requestId = TEST_REQUEST_ID_D
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NVM)
    let data = TEST_DATA_NVM

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
    const serviceId = BI.fromI32(48)

    let mapping = new CreateMechEntity(TEST_MECH)
    mapping.mech = TEST_MECH
    mapping.serviceId = serviceId
    mapping.mechFactory = Address.zero()
    mapping.blockNumber = BI.fromI32(0)
    mapping.blockTimestamp = BI.fromI32(0)
    mapping.transactionHash = TEST_REQUEST_ID_A
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
    mechEntity.undeliveredRequests = BI.fromI32(0)
    mechEntity.save()

    handleRequest(createRequestEvent(TEST_MECH, TEST_REQUEST_ID_A, TEST_DATA_NVM))
    assert.fieldEquals("Mech", serviceId.toString(), "undeliveredRequests", "1")

    handleRevokeRequest(createRevokeEvent(TEST_MECH, TEST_REQUEST_ID_A))
    assert.fieldEquals("Mech", serviceId.toString(), "undeliveredRequests", "0")
  })

  test("Revoke ignored when request already delivered", () => {
    const serviceId = BI.fromI32(64)

    let mapping = new CreateMechEntity(TEST_MECH)
    mapping.mech = TEST_MECH
    mapping.serviceId = serviceId
    mapping.mechFactory = Address.zero()
    mapping.blockNumber = BI.fromI32(0)
    mapping.blockTimestamp = BI.fromI32(0)
    mapping.transactionHash = TEST_REQUEST_ID_A
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
    mechEntity.undeliveredRequests = BI.fromI32(0)
    mechEntity.save()

    handleRequest(createRequestEvent(TEST_MECH, TEST_REQUEST_ID_A, TEST_DATA_NVM))
    handleDeliver(
      createDeliverEvent(
        TEST_MECH,
        TEST_REQUEST_ID_A,
        TEST_MECH_SERVICE_MULTISIG,
        BigInt.fromI32(TEST_DELIVERY_RATE_NVM),
        TEST_DATA_NVM
      )
    )

    assert.fieldEquals("Request", TEST_REQUEST_ID_A.toHexString(), "isDelivered", "true")

    handleRevokeRequest(createRevokeEvent(TEST_MECH, TEST_REQUEST_ID_A))
    assert.fieldEquals("Mech", serviceId.toString(), "undeliveredRequests", "0")
  })

  test("Self-delivery increments selfDeliveredFromReceived counter", () => {
    // Arrange
    let serviceId = BigInt.fromI32(388)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
    let testMech = Address.fromString("0x0000000000000000000000000000000000000388")
    createMechWithMapping(testMech, serviceId)

    // Act - Request and deliver by same mech
    handleRequest(createRequestEvent(testMech, TEST_REQUEST_ID_1, TEST_DATA_NATIVE))
    handleDeliver(createDeliverEvent(testMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE))

    // Assert
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "priorityMech", testMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "deliveredByMech", testMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "isDelivered", "true")
    
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
    assert.fieldEquals("Mech", serviceId.toString(), "undeliveredRequests", "0") // Decremented because self-delivered
  })

  test("Other-mech delivery increments deliveredByOthersFromReceived counter", () => {
    // Arrange
    let priorityMechServiceId = BigInt.fromI32(404)
    let deliveryMechServiceId = BigInt.fromI32(420)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
    
    let priorityMech = Address.fromString("0x0000000000000000000000000000000000000404")
    let deliveryMech = Address.fromString("0x0000000000000000000000000000000000000420")
    
    createMechWithMapping(priorityMech, priorityMechServiceId)
    createMechWithMapping(deliveryMech, deliveryMechServiceId)

    // Request goes to priority mech
    let requestEvent = createRequestEvent(priorityMech, TEST_REQUEST_ID_1, TEST_DATA_NATIVE)
    
    // But delivery mech delivers it
    let deliverEvent = createDeliverEvent(deliveryMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE)

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
    assert.fieldEquals("Mech", priorityMechServiceId.toString(), "undeliveredRequests", "1") // Stays 1 because priority mech hasn't delivered it itself
    
    // Delivery mech counters - didn't receive this request, so no counter changes
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "receivedRequests", "0")
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "selfDeliveredFromReceived", "0")
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "deliveredByOthersFromReceived", "0")
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "undeliveredRequests", "0")
  })

  test("Multiple self-deliveries increment counter correctly", () => {
    // Arrange
    let serviceId = BigInt.fromI32(436)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
    let testMech = Address.fromString("0x0000000000000000000000000000000000000436")
    createMechWithMapping(testMech, serviceId)

    let requestId1 = Bytes.fromHexString("0xcccccccccccccccccccccccccccccccccccccccc")
    let requestId2 = Bytes.fromHexString("0xdddddddddddddddddddddddddddddddddddddddd")

    // Act - Two requests and two deliveries by same mech
    handleRequest(createRequestEvent(testMech, requestId1, TEST_DATA_NATIVE))
    handleRequest(createRequestEvent(testMech, requestId2, TEST_DATA_NATIVE))
    
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "undeliveredRequests", "2")
    
    handleDeliver(createDeliverEvent(testMech, requestId1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE))
    handleDeliver(createDeliverEvent(testMech, requestId2, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE))

    // Assert
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
    assert.fieldEquals("Mech", serviceId.toString(), "undeliveredRequests", "0") // Both delivered by self
  })
})
