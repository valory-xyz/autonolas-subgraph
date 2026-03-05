import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock
} from "matchstick-as/assembly/index"
import { Address, BigInt, BigInt as BI } from "@graphprotocol/graph-ts"
import {
  handleDeliver,
  handleRequest,
  handleMaxDeliveryRateUpdated
} from "../../src/marketplace/mech-fixed-price-native"
import { handleMarketplaceRequest } from "../../src/marketplace/mech-marketplace"
import { CreateMultisigWithAgents, Service } from "../../generated/schema"
import {
  createDeliverEvent,
  createRequestEvent,
  createMechWithMapping,
  createMaxDeliveryRateUpdatedEvent
} from "./mech-fixed-price-native-utils"
import { createMarketplaceRequestEvent } from "./mech-marketplace-utils"
import {
  TEST_MECH,
  TEST_MECH_SERVICE_MULTISIG,
  TEST_REQUESTER,
  TEST_OWNER,
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
    dataSourceMock.setNetwork("gnosis")
  })

  test("Request creates Request entity", () => {
      // Arrange
      let serviceId = BigInt.fromI32(1)
      createMechWithMapping(TEST_MECH, serviceId)
      
      let requestId = TEST_REQUEST_ID_1
      let data = TEST_DATA_NATIVE

      let requestEvent = createRequestEvent(TEST_MECH, requestId, data)

      // Verify initial state
      assert.entityCount("Request", 0)
      assert.entityCount("Sender", 0)

      // Act
      handleRequest(requestEvent)

      // Assert - mech Request handler creates entities but doesn't update counters
      // (counters are updated by handleMarketplaceRequest which fires after this)
      assert.entityCount("Request", 1)
      assert.entityCount("Sender", 1)

      // Check Request entity
      assert.fieldEquals("Request", requestId.toHexString(), "mech", TEST_MECH.toHexString())
      assert.fieldEquals("Request", requestId.toHexString(), "blockNumber", requestEvent.block.number.toString())
      assert.fieldEquals("Request", requestId.toHexString(), "blockTimestamp", requestEvent.block.timestamp.toString())
      assert.fieldEquals("Request", requestId.toHexString(), "transactionHash", requestEvent.transaction.hash.toHexString())
      assert.fieldEquals("Request", requestId.toHexString(), "sender", requestEvent.transaction.from.toHexString())

      // Sender entity exists but counters are 0 (marketplace handler will update them)
      assert.fieldEquals("Sender", requestEvent.transaction.from.toHexString(), "totalMarketplaceRequests", "0")
    })

  test("Delivery creates Deliver and DeliverForMarketplace entities", () => {
      // Arrange - create request first (required for delivery)
      let serviceId = BigInt.fromI32(2)
      createMechWithMapping(TEST_MECH, serviceId)
      
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

      // Deliver entity uses txHash + logIndex as ID
      let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "mech", TEST_MECH.toHexString())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "sender", requestEvent.transaction.from.toHexString())

      // DeliverForMarketplace uses requestId as entity ID
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "requestId", requestId.toHexString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "requestIdBytes", requestId.toHexString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "ipfsHashBytes", data.toHexString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "mechServiceMultisig", TEST_MECH_SERVICE_MULTISIG.toHexString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliveryRate", deliveryRate.toString())
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "isMarketplace", "true")
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "isOffChain", "false")
      assert.fieldEquals("DeliverForMarketplace", requestId.toHexString(), "deliver", deliverId.toHexString())
    })

  test("Request and delivery together", () => {
      // Arrange
      let serviceId = BigInt.fromI32(3)
      createMechWithMapping(TEST_MECH, serviceId)
      
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
      assert.entityCount("Deliver", 1)
      assert.entityCount("DeliverForMarketplace", 1)

      // Deliver uses txHash + logIndex as entity ID
      let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
    })

  test("Full request-delivery cycle", () => {
      // Arrange
      let serviceId = BigInt.fromI32(4)
      createMechWithMapping(TEST_MECH, serviceId)
      
      let requestId = TEST_REQUEST_ID_4
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let data = TEST_DATA_NATIVE

      // Verify initial state
      assert.entityCount("Request", 0)
      assert.entityCount("Deliver", 0)

      // Act - Create request first
      let requestEvent = createRequestEvent(TEST_MECH, requestId, data)
      handleRequest(requestEvent)

      // Verify request was created
      assert.entityCount("Request", 1)

      // Act - Then create delivery
      let deliverEvent = createDeliverEvent(TEST_MECH, requestId, TEST_MECH_SERVICE_MULTISIG, deliveryRate, data)
      handleDeliver(deliverEvent)

      // Assert - Complete cycle
      assert.entityCount("Request", 1)
      assert.entityCount("Deliver", 1)
      assert.entityCount("DeliverForMarketplace", 1)

      // Deliver uses txHash + logIndex as entity ID
      let deliverId = deliverEvent.transaction.hash.concatI32(deliverEvent.logIndex.toI32())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "request", requestId.toHexString())
      assert.fieldEquals("Deliver", deliverId.toHexString(), "sender", requestEvent.transaction.from.toHexString())
    })

  test("Self-delivery increments selfDeliveredFromReceived counter", () => {
      // Arrange
      let serviceId = BigInt.fromI32(144)
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let testMech = Address.fromString("0x0000000000000000000000000000000000000144")
      createMechWithMapping(testMech, serviceId)

      // Simulate marketplace flow: MarketplaceRequest increments counters, then mech Request fires
      let marketplaceRequestEvent = createMarketplaceRequestEvent(testMech, TEST_REQUESTER, [TEST_REQUEST_ID_1], [TEST_DATA_NATIVE])
      let requestEvent = createRequestEvent(testMech, TEST_REQUEST_ID_1, TEST_DATA_NATIVE)
      let deliverEvent = createDeliverEvent(testMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE)

      // Act - MarketplaceRequest handler increments receivedRequests
      handleMarketplaceRequest(marketplaceRequestEvent)
      handleRequest(requestEvent)
      
      // Check state after request
      assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
      
      handleDeliver(deliverEvent)

      // Assert
      assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "priorityMech", testMech.toHexString())
      assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "deliveredByMech", testMech.toHexString())
      assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "isDelivered", "true")
      assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "1")
      assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "1")
      assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
    })

  test("Other-mech delivery increments deliveredByOthersFromReceived counter", () => {
      // Arrange - two different mechs
      let priorityMechServiceId = BigInt.fromI32(160)
      let deliveryMechServiceId = BigInt.fromI32(176)
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      
      let priorityMech = Address.fromString("0x0000000000000000000000000000000000000011")
      let deliveryMech = Address.fromString("0x0000000000000000000000000000000000000022")
      
      createMechWithMapping(priorityMech, priorityMechServiceId)
      createMechWithMapping(deliveryMech, deliveryMechServiceId)

      // Simulate marketplace flow: request goes to priority mech
      let marketplaceRequestEvent = createMarketplaceRequestEvent(priorityMech, TEST_REQUESTER, [TEST_REQUEST_ID_1], [TEST_DATA_NATIVE])
      let requestEvent = createRequestEvent(priorityMech, TEST_REQUEST_ID_1, TEST_DATA_NATIVE)
      
      // But delivery mech delivers it
      let deliverEvent = createDeliverEvent(deliveryMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE)

      // Act
      handleMarketplaceRequest(marketplaceRequestEvent)
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
      let serviceId = BigInt.fromI32(192)
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let testMech = Address.fromString("0x0000000000000000000000000000000000000192")
      createMechWithMapping(testMech, serviceId)

      // Simulate marketplace flow for both requests
      let marketplaceRequestEvent1 = createMarketplaceRequestEvent(testMech, TEST_REQUESTER, [TEST_REQUEST_ID_1], [TEST_DATA_NATIVE])
      let requestEvent1 = createRequestEvent(testMech, TEST_REQUEST_ID_1, TEST_DATA_NATIVE)
      let deliverEvent1 = createDeliverEvent(testMech, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE)
      
      let marketplaceRequestEvent2 = createMarketplaceRequestEvent(testMech, TEST_REQUESTER, [TEST_REQUEST_ID_2], [TEST_DATA_NATIVE])
      let requestEvent2 = createRequestEvent(testMech, TEST_REQUEST_ID_2, TEST_DATA_NATIVE)
      let deliverEvent2 = createDeliverEvent(testMech, TEST_REQUEST_ID_2, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE)

      // Act
      handleMarketplaceRequest(marketplaceRequestEvent1)
      handleRequest(requestEvent1)
      handleDeliver(deliverEvent1)
      handleMarketplaceRequest(marketplaceRequestEvent2)
      handleRequest(requestEvent2)
      handleDeliver(deliverEvent2)

      // Assert
      assert.fieldEquals("Mech", serviceId.toString(), "receivedRequests", "2")
      assert.fieldEquals("Mech", serviceId.toString(), "selfDeliveredFromReceived", "2")
      assert.fieldEquals("Mech", serviceId.toString(), "deliveredByOthersFromReceived", "0")
    })

    test("Service counters are not double-counted for marketplace requests", () => {
      // Setup: Create a Service entity
      let serviceId = BigInt.fromI32(250)
      let service = new Service(serviceId.toString())
      service.serviceId = serviceId
      service.latestMultisig = TEST_REQUESTER
      service.historicalMultisigs = [TEST_REQUESTER]
      service.agentIds = []
      service.totalRequests = BigInt.fromI32(0)
      service.totalDeliveries = BigInt.fromI32(0)
      service.save()

      // Create multisig-to-service mapping (required for getServiceIdFromMultisig)
      let multisigEntity = new CreateMultisigWithAgents(TEST_REQUESTER)
      multisigEntity.serviceId = serviceId
      multisigEntity.multisig = TEST_REQUESTER
      multisigEntity.blockNumber = BigInt.fromI32(1)
      multisigEntity.blockTimestamp = BigInt.fromI32(1)
      multisigEntity.transactionHash = TEST_REQUEST_ID_1
      multisigEntity.save()

      // Create mech mapping
      let mechAddress = Address.fromString("0x0000000000000000000000000000000000000250")
      createMechWithMapping(mechAddress, serviceId)

      // Simulate marketplace request flow:
      // 1. MarketplaceRequest event increments service.totalRequests
      let marketplaceRequestEvent = createMarketplaceRequestEvent(
        mechAddress,
        TEST_REQUESTER,
        [TEST_REQUEST_ID_1],
        [TEST_DATA_NATIVE]
      )
      handleMarketplaceRequest(marketplaceRequestEvent)

      // Service counter should be incremented to 1 by marketplace handler
      assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "1")

      // 2. Individual mech Request event fires (but should NOT increment service counter)
      let requestEvent = createRequestEvent(mechAddress, TEST_REQUEST_ID_1, TEST_DATA_NATIVE)
      handleRequest(requestEvent)

      // Service counter should STILL be 1 (no double counting!)
      assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "1")

      // Global counter should also be 1 (no double counting)
      assert.fieldEquals("Global", "", "totalRequests", "1")
    })

    test("Service delivery counter incremented for mech deliveries", () => {
      // Setup: Create a Service entity
      let serviceId = BigInt.fromI32(260)
      let service = new Service(serviceId.toString())
      service.serviceId = serviceId
      service.latestMultisig = TEST_REQUESTER
      service.historicalMultisigs = [TEST_REQUESTER]
      service.agentIds = []
      service.totalRequests = BigInt.fromI32(0)
      service.totalDeliveries = BigInt.fromI32(0)
      service.save()

      // Create multisig-to-service mapping (required for getServiceIdFromMultisig)
      let multisigEntity = new CreateMultisigWithAgents(TEST_REQUESTER)
      multisigEntity.serviceId = serviceId
      multisigEntity.multisig = TEST_REQUESTER
      multisigEntity.blockNumber = BigInt.fromI32(1)
      multisigEntity.blockTimestamp = BigInt.fromI32(1)
      multisigEntity.transactionHash = TEST_REQUEST_ID_1
      multisigEntity.save()

      // Create mech mapping
      let mechAddress = Address.fromString("0x0000000000000000000000000000000000000260")
      createMechWithMapping(mechAddress, serviceId)

      // Simulate marketplace flow
      let marketplaceRequestEvent = createMarketplaceRequestEvent(mechAddress, TEST_REQUESTER, [TEST_REQUEST_ID_1], [TEST_DATA_NATIVE])
      handleMarketplaceRequest(marketplaceRequestEvent)
      
      let requestEvent = createRequestEvent(mechAddress, TEST_REQUEST_ID_1, TEST_DATA_NATIVE)
      handleRequest(requestEvent)

      // Verify service.totalRequests incremented by marketplace handler
      assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "1")
      assert.fieldEquals("Service", serviceId.toString(), "totalDeliveries", "0")

      // Now handle delivery
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let deliverEvent = createDeliverEvent(mechAddress, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE)
      handleDeliver(deliverEvent)

      // Verify service.totalDeliveries incremented
      assert.fieldEquals("Service", serviceId.toString(), "totalDeliveries", "1")
      assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "1")
    })

    test("Service delivery counter incremented for marketplace deliveries", () => {
      // Setup: Create a Service entity
      let serviceId = BigInt.fromI32(270)
      let service = new Service(serviceId.toString())
      service.serviceId = serviceId
      service.latestMultisig = TEST_REQUESTER
      service.historicalMultisigs = [TEST_REQUESTER]
      service.agentIds = []
      service.totalRequests = BigInt.fromI32(0)
      service.totalDeliveries = BigInt.fromI32(0)
      service.save()

      // Create multisig-to-service mapping (required for getServiceIdFromMultisig)
      let multisigEntity = new CreateMultisigWithAgents(TEST_REQUESTER)
      multisigEntity.serviceId = serviceId
      multisigEntity.multisig = TEST_REQUESTER
      multisigEntity.blockNumber = BigInt.fromI32(1)
      multisigEntity.blockTimestamp = BigInt.fromI32(1)
      multisigEntity.transactionHash = TEST_REQUEST_ID_1
      multisigEntity.save()

      // Create mech mapping
      let mechAddress = Address.fromString("0x0000000000000000000000000000000000000270")
      createMechWithMapping(mechAddress, serviceId)

      // Simulate marketplace request flow:
      // 1. MarketplaceRequest event increments service.totalRequests
      let marketplaceRequestEvent = createMarketplaceRequestEvent(
        mechAddress,
        TEST_REQUESTER,
        [TEST_REQUEST_ID_1],
        [TEST_DATA_NATIVE]
      )
      handleMarketplaceRequest(marketplaceRequestEvent)

      // Service request counter should be incremented
      assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "1")
      assert.fieldEquals("Service", serviceId.toString(), "totalDeliveries", "0")

      // 2. Individual mech Request event fires (should NOT increment service counter)
      let requestEvent = createRequestEvent(mechAddress, TEST_REQUEST_ID_1, TEST_DATA_NATIVE)
      handleRequest(requestEvent)

      // Service request counter should STILL be 1 (no double counting)
      assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "1")

      // 3. Delivery happens
      let deliveryRate = BigInt.fromI32(TEST_DELIVERY_RATE_NATIVE)
      let deliverEvent = createDeliverEvent(mechAddress, TEST_REQUEST_ID_1, TEST_MECH_SERVICE_MULTISIG, deliveryRate, TEST_DATA_NATIVE)
      handleDeliver(deliverEvent)

      // Service delivery counter should be incremented
      assert.fieldEquals("Service", serviceId.toString(), "totalDeliveries", "1")
      assert.fieldEquals("Service", serviceId.toString(), "totalRequests", "1")
    })

    test("MaxDeliveryRateUpdated updates Mech entity maxDeliveryRate", () => {
      // Arrange
      let serviceId = BigInt.fromI32(300)
      let mechAddress = Address.fromString("0x0000000000000000000000000000000000000300")
      createMechWithMapping(mechAddress, serviceId)

      // Initial state: maxDeliveryRate should be null
      assert.fieldEquals("Mech", serviceId.toString(), "maxDeliveryRate", "null")

      // Act: Emit MaxDeliveryRateUpdated event
      let maxDeliveryRate = BigInt.fromI32(1000)
      let updateEvent = createMaxDeliveryRateUpdatedEvent(mechAddress, maxDeliveryRate)
      handleMaxDeliveryRateUpdated(updateEvent)

      // Assert: maxDeliveryRate should be updated
      assert.fieldEquals("Mech", serviceId.toString(), "maxDeliveryRate", maxDeliveryRate.toString())
    })

    test("MaxDeliveryRateUpdated updates maxDeliveryRate multiple times", () => {
      // Arrange
      let serviceId = BigInt.fromI32(301)
      let mechAddress = Address.fromString("0x0000000000000000000000000000000000000301")
      createMechWithMapping(mechAddress, serviceId)

      // Act: First update
      let firstRate = BigInt.fromI32(1000)
      let firstEvent = createMaxDeliveryRateUpdatedEvent(mechAddress, firstRate)
      handleMaxDeliveryRateUpdated(firstEvent)
      assert.fieldEquals("Mech", serviceId.toString(), "maxDeliveryRate", firstRate.toString())

      // Act: Second update
      let secondRate = BigInt.fromI32(2000)
      let secondEvent = createMaxDeliveryRateUpdatedEvent(mechAddress, secondRate)
      handleMaxDeliveryRateUpdated(secondEvent)

      // Assert: Should reflect latest value
      assert.fieldEquals("Mech", serviceId.toString(), "maxDeliveryRate", secondRate.toString())
    })
})
