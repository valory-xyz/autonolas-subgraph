import {
  assert,
  describe,
  test,
  afterEach,
  clearStore,
  dataSourceMock
} from "matchstick-as/assembly/index"
import { Address, BigInt, BigInt as BI } from "@graphprotocol/graph-ts"
import { handleDeliver, handleRequest, handleMaxDeliveryRateUpdated } from "../../src/marketplace/mech-fixed-price-token"
import { handleMarketplaceRequest } from "../../src/marketplace/mech-marketplace"
import { createDeliverEvent, createRequestEvent, createMaxDeliveryRateUpdatedEvent } from "./mech-fixed-price-token-utils"
import { createMarketplaceRequestEvent } from "./mech-marketplace-utils"
import { mockMaxDeliveryRate } from "./shared-mech-event-helpers"
import {
  TEST_MECH,
  TEST_MECH_SERVICE_MULTISIG,
  TEST_REQUESTER,
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
  mechEntity.maxDeliveryRate = null
  mechEntity.karma = BI.fromI32(0)
  
  mechEntity.paymentType = Bytes.fromHexString("0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1")
  mechEntity.save()

  // Mock maxDeliveryRate for fee tracking
  mockMaxDeliveryRate(mechAddress, BI.fromI32(0))
}

describe("Mech Fixed Price Token Handler", () => {
  afterEach(() => {
    clearStore()
    dataSourceMock.setNetwork("gnosis")
  })

  test("Request creates Request entity", () => {
    let serviceId = BigInt.fromI32(1)
    createMechWithMapping(TEST_MECH, serviceId)
    
    let requestId = TEST_REQUEST_ID_1
    let data = TEST_DATA_TOKEN

    let requestEvent = createRequestEvent(TEST_MECH, requestId, data)

    assert.entityCount("Request", 0)
    assert.entityCount("Sender", 0)

    handleRequest(requestEvent)

    // Mech Request handler creates Request and Sender entities
    // Counter updates are handled by handleMarketplaceRequest
    assert.entityCount("Request", 1)
    assert.entityCount("Sender", 1)

    assert.fieldEquals("Request", requestId.toHexString(), "mech", TEST_MECH.toHexString())
    assert.fieldEquals("Request", requestId.toHexString(), "sender", requestEvent.transaction.from.toHexString())
    assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalMarketplaceRequests", "0")
  })

  test("Delivery creates Deliver and DeliverForMarketplace entities", () => {
    let serviceId = BigInt.fromI32(2)
    createMechWithMapping(TEST_MECH, serviceId)
    
    let requestId = TEST_REQUEST_ID_2
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let data = TEST_DATA_TOKEN

    let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
    handleRequest(requestEvent)

    assert.entityCount("Deliver", 0)
    assert.entityCount("DeliverForMarketplace", 0)

    let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)
    handleDeliver(deliverEvent)

    assert.entityCount("Deliver", 1)
    assert.entityCount("DeliverForMarketplace", 1)

    // Deliver uses txHash + logIndex as entity ID
    let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "mech", TEST_MECH.toHexString())
    assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
  })

  test("Self-delivery increments selfDeliveredFromReceived counter", () => {
    let serviceId = BigInt.fromI32(324)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let testMech = Address.fromString("0x0000000000000000000000000000000000000324")
    createMechWithMapping(testMech, serviceId)

    // Simulate marketplace flow
    let marketplaceRequestEvent = createMarketplaceRequestEvent(testMech, TEST_REQUESTER, [TEST_REQUEST_ID_1], [TEST_DATA_TOKEN])
    handleMarketplaceRequest(marketplaceRequestEvent)
    handleRequest(createRequestEvent(testMech, TEST_REQUEST_ID_1, TEST_DATA_TOKEN))
    handleDeliver(createDeliverEvent(testMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN))

    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "priorityMech", testMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "deliveredByMech", testMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "isDelivered", "true")
    
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "1")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
  })

  test("Other-mech delivery increments deliveredByOthersFromReceived counter", () => {
    let priorityMechServiceId = BigInt.fromI32(340)
    let deliveryMechServiceId = BigInt.fromI32(356)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    
    let priorityMech = Address.fromString("0x0000000000000000000000000000000000000340")
    let deliveryMech = Address.fromString("0x0000000000000000000000000000000000000356")
    
    createMechWithMapping(priorityMech, priorityMechServiceId)
    createMechWithMapping(deliveryMech, deliveryMechServiceId)

    // Simulate marketplace flow
    let marketplaceRequestEvent = createMarketplaceRequestEvent(priorityMech, TEST_REQUESTER, [TEST_REQUEST_ID_1], [TEST_DATA_TOKEN])
    handleMarketplaceRequest(marketplaceRequestEvent)
    handleRequest(createRequestEvent(priorityMech, TEST_REQUEST_ID_1, TEST_DATA_TOKEN))
    handleDeliver(createDeliverEvent(deliveryMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN))

    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "priorityMech", priorityMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "deliveredByMech", deliveryMech.toHexString())
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "isDelivered", "true")
    
    assert.fieldEquals("Mech", priorityMechServiceId.toString(), "receivedRequests", "1")
    assert.fieldEquals("Mech", priorityMechServiceId.toString(), "selfDeliveredFromReceived", "0")
    assert.fieldEquals("Mech", priorityMechServiceId.toString(), "deliveredByOthersFromReceived", "1")
    
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "receivedRequests", "0")
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "selfDeliveredFromReceived", "0")
    assert.fieldEquals("Mech", deliveryMechServiceId.toString(), "deliveredByOthersFromReceived", "0")
  })

  test("Multiple self-deliveries increment counter correctly", () => {
    let serviceId = BigInt.fromI32(372)
    let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_TOKEN)
    let testMech = Address.fromString("0x0000000000000000000000000000000000000372")
    createMechWithMapping(testMech, serviceId)

    let requestId1 = Bytes.fromHexString("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    let requestId2 = Bytes.fromHexString("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")

    // Simulate marketplace flow
    let marketplaceRequestEvent1 = createMarketplaceRequestEvent(testMech, TEST_REQUESTER, [requestId1], [TEST_DATA_TOKEN])
    handleMarketplaceRequest(marketplaceRequestEvent1)
    handleRequest(createRequestEvent(testMech, requestId1, TEST_DATA_TOKEN))

    let marketplaceRequestEvent2 = createMarketplaceRequestEvent(testMech, TEST_REQUESTER, [requestId2], [TEST_DATA_TOKEN])
    handleMarketplaceRequest(marketplaceRequestEvent2)
    handleRequest(createRequestEvent(testMech, requestId2, TEST_DATA_TOKEN))
    
    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "2")
    
    handleDeliver(createDeliverEvent(testMech, requestId1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN))
    handleDeliver(createDeliverEvent(testMech, requestId2, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_TOKEN))

    assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "2")
    assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
  })

  test("MaxDeliveryRateUpdated updates Mech entity maxDeliveryRate", () => {
    let serviceId = BigInt.fromI32(300)
    let mechAddress = Address.fromString("0x0000000000000000000000000000000000000300")
    createMechWithMapping(mechAddress, serviceId)

    assert.fieldEquals("Mech", serviceId.toString(), "maxDeliveryRate", "null")

    let maxDeliveryRate = BigInt.fromI32(1000)
    let updateEvent = createMaxDeliveryRateUpdatedEvent(mechAddress, maxDeliveryRate)
    handleMaxDeliveryRateUpdated(updateEvent)

    assert.fieldEquals("Mech", serviceId.toString(), "maxDeliveryRate", maxDeliveryRate.toString())
  })
})
