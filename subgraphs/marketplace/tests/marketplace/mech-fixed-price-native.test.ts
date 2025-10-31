import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index"
import { BigInt } from "@graphprotocol/graph-ts"
import {
  handleDeliver,
  handleRequest
} from "../../src/marketplace/mech-fixed-price-native"
import {
  createDeliverEvent,
  createRequestEvent
} from "./mech-fixed-price-native-utils"
import {
  TEST_MECH,
  TEST_MECH_SERVICE_MULTISIG,
  TEST_REQUEST_ID_1,
  TEST_REQUEST_ID_2,
  TEST_REQUEST_ID_3,
  TEST_REQUEST_ID_4,
  TEST_DATA_NATIVE,
  TEST_DELIVERY_RATE_NATIVE
} from "./test-constants"

describe("Mech Fixed Price Native Handler", () => {
  afterEach(() => {
    clearStore()
  })

  test("Request creates Request and RequestToMarketplace entities", () => {
      // Arrange
      let requestId = TEST_REQUEST_ID_1
      let data = TEST_DATA_NATIVE

      let requestEvent = createRequestEvent(TEST_MECH, requestId, data)

      // Verify initial state
      assert.entityCount("Request", 0)
      assert.entityCount("RequestToMarketplace", 0)
      assert.entityCount("Sender", 0)
      assert.entityCount("Global", 0)

      // Act
      handleRequest(requestEvent)

      // Assert
      assert.entityCount("Request", 1)
      assert.entityCount("RequestToMarketplace", 1)
      assert.entityCount("Sender", 1)
      assert.entityCount("Global", 1)

      // Check Request entity
      assert.fieldEquals("Request", requestId.toHexString(), "mech", TEST_MECH.toHexString())
      assert.fieldEquals("Request", requestId.toHexString(), "blockNumber", requestEvent.block.number.toString())
      assert.fieldEquals("Request", requestId.toHexString(), "blockTimestamp", requestEvent.block.timestamp.toString())
      assert.fieldEquals("Request", requestId.toHexString(), "transactionHash", requestEvent.transaction.hash.toHexString())
      assert.fieldEquals("Request", requestId.toHexString(), "sender", requestEvent.transaction.from.toHexString())

      // Check RequestToMarketplace entity
      assert.fieldEquals("RequestToMarketplace", requestId.toHexString(), "requestId", requestId.toHexString())
      assert.fieldEquals("RequestToMarketplace", requestId.toHexString(), "ipfsHashBytes", data.toHexString())
      assert.fieldEquals("RequestToMarketplace", requestId.toHexString(), "isMarketplace", "true")
      assert.fieldEquals("RequestToMarketplace", requestId.toHexString(), "isOffChain", "false")
      assert.fieldEquals("RequestToMarketplace", requestId.toHexString(), "request", requestId.toHexString())

      // Check Sender entity
      assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalRequests", "1")
      assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalMarketplaceRequests", "1")

      // Check Global counters
      assert.fieldEquals("Global", "", "totalRequests", "1")
      assert.fieldEquals("Global", "", "totalTransactions", "1")
    })

  test("Delivery creates Deliver and DeliverForMarketplace entities", () => {
      // Arrange - create request first (required for delivery)
      let requestId = TEST_REQUEST_ID_2
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let data = TEST_DATA_NATIVE

      let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
      handleRequest(requestEvent)

      // Verify initial state for delivery entities
      assert.entityCount("Deliver", 0)
      assert.entityCount("DeliverForMarketplace", 0)

      let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)

      // Act
      handleDeliver(deliverEvent)

      // Assert
      assert.entityCount("Deliver", 1)
      assert.entityCount("DeliverForMarketplace", 1)
      assert.entityCount("AtaTransaction", 1)

      // Check Deliver entity
      let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "mech", TEST_MECH.toHexString())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "sender", requestEvent.transaction.from.toHexString())

      // Check DeliverForMarketplace entity
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "requestId", requestId.toHexString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "ipfsHashBytes", data.toHexString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "mechServiceMultisig", TEST_MECH_SERVICE_MULTISIG.toHexString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliveryRate", deliveryRate.toString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "isMarketplace", "true")
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "isOffChain", "false")
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliver", deliverId.toHexString())

      // Check Global counters (both request and delivery increment transactions)
      assert.fieldEquals("Global", "", "totalDeliveries", "1")
      assert.fieldEquals("Global", "", "totalTransactions", "2")
      assert.fieldEquals("Global", "", "totalAtaTransactions", "1")
    })

  test("Request and delivery together", () => {
      // Arrange
      let requestId = TEST_REQUEST_ID_3
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let data = TEST_DATA_NATIVE

      // Act - Create request first
      let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
      handleRequest(requestEvent)

      // Act - Then create delivery
      let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)
      handleDeliver(deliverEvent)

      // Assert - Both entities exist and are properly linked
      assert.entityCount("Request", 1)
      assert.entityCount("RequestToMarketplace", 1)
      assert.entityCount("Deliver", 1)
      assert.entityCount("DeliverForMarketplace", 1)

      // Check the relationship between deliver and request
      let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
      
      // Check Global counters
      assert.fieldEquals("Global", "", "totalRequests", "1")
      assert.fieldEquals("Global", "", "totalDeliveries", "1")
      assert.fieldEquals("Global", "", "totalTransactions", "2")
      assert.fieldEquals("Global", "", "totalAtaTransactions", "1")
    })

  test("Full request-delivery cycle", () => {
      // Arrange
      let requestId = TEST_REQUEST_ID_4
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let data = TEST_DATA_NATIVE

      // Verify initial state
      assert.entityCount("Request", 0)
      assert.entityCount("Deliver", 0)
      assert.entityCount("Global", 0)

      // Act - Create request first
      let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
      handleRequest(requestEvent)

      // Verify request was created
      assert.entityCount("Request", 1)
      assert.fieldEquals("Global", "", "totalRequests", "1")
      assert.fieldEquals("Global", "", "totalTransactions", "1")

      // Act - Then create delivery
      let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)
      handleDeliver(deliverEvent)

      // Assert - Complete cycle
      assert.entityCount("Request", 1)
      assert.entityCount("RequestToMarketplace", 1)
      assert.entityCount("Deliver", 1)
      assert.entityCount("DeliverForMarketplace", 1)

      // Check relationships
      let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "sender", requestEvent.transaction.from.toHexString())
      
      // Check final Global counters
      assert.fieldEquals("Global", "", "totalRequests", "1")
      assert.fieldEquals("Global", "", "totalDeliveries", "1")
      assert.fieldEquals("Global", "", "totalTransactions", "2")
      assert.fieldEquals("Global", "", "totalAtaTransactions", "1")
    })
})
