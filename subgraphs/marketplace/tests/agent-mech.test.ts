import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock,
  readFile
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes, DataSourceContext } from "@graphprotocol/graph-ts"
import { handleDeliver, handleRequest } from "../src/agent-mech"
import { createMechDeliveryEvent, createMechRequestEvent } from "./agent-mech-utils"
import { getGlobal, getOrCreateSender } from "../src/utils"
import { handleParsedRequest } from "../src/marketplace/parsed-request-file"
import { handleParsedDelivery } from "../src/marketplace/parsed-delivery-file"
import { CTX_BASE_HASH, CTX_REQUEST_ID } from "../src/marketplace/request-metadata"
import { CTX_DELIVER_ID, CTX_DELIVER_REQUEST } from "../src/marketplace/delivery-metadata"

const DIGEST = "0x1111111111111111111111111111111111111111111111111111111111111111"
const BASE_HASH = "f017012201111111111111111111111111111111111111111111111111111111111111111"


describe("Describe agent-mech processing", () => {
    afterEach(() => {
        clearStore()
        dataSourceMock.resetValues()
    })

    test("Request created and stored", () => {
        // arrange

        let requestId = BigInt.fromI32(234)
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")

        let event = createMechRequestEvent(
            sender,
            requestId,
            Bytes.fromHexString(DIGEST),
        )

        // act
        handleRequest(event)

        assert.dataSourceExists("ParsedRequestFile", BASE_HASH + "/metadata.json")
        assert.dataSourceExists("ParsedRequestFile", BASE_HASH)
        assert.entityCount("ParsedRequest", 0)
        assert.entityCount("RequestToMech", 1)
        assert.fieldEquals(
            "RequestToMech",
            requestId.toHexString(),
            "ipfsHash",
            BASE_HASH
        )

        assert.entityCount("Request", 1)

        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "sender",
            sender.toHexString()
        )

        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "mech",
            "0xa16081f360e3847006db660bae1c6d1b2e17ec2a"
        )

        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "blockNumber",
            event.block.number.toString()
        )

        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "blockTimestamp",
            event.block.timestamp.toString()
        )
        
        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "transactionHash",
            event.transaction.hash.toHexString()
        )

        assert.entityCount("Sender", 1)

        assert.fieldEquals(
            "Sender",
            sender.toHexString(),
            "totalLegacyRequests",
            "1"
        )

        assert.fieldEquals(
            "Sender",
            sender.toHexString(),
            "totalLegacyTransactions",
            "1"
        )

        assert.entityCount("Global", 1)

        assert.fieldEquals(
            "Global",
            "",
            "totalLegacyRequests",
            "1"
        )

        assert.fieldEquals(
            "Global",
            "",
            "totalLegacyTransactions",
            "1"
        )
        
        assert.fieldEquals(
            "Global",
            "",
            "totalRequests",
            "1"
        )

        assert.fieldEquals(
            "Global",
            "",
            "totalTransactions",
            "1"
        )

    })

    test("Request handles odd-length requestId hex representation", () => {

        let requestId = BigInt.fromI32(15)
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")

        let event = createMechRequestEvent(
            sender,
            requestId,
            Bytes.fromHexString(DIGEST),
        )

        handleRequest(event)

        assert.entityCount("RequestToMech", 1)
        assert.fieldEquals("RequestToMech", requestId.toHexString(), "ipfsHash", BASE_HASH)
    })

    test("Response indexed and stored", () => {
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")
        let requestId = BigInt.fromI32(234)
        let data = Bytes.fromHexString(DIGEST)


        let event = createMechDeliveryEvent(
            sender,
            requestId,
            data,
        )

        handleDeliver(event)

        assert.dataSourceExists("ParsedDeliveryFile", BASE_HASH + "/234/metadata.json")
        assert.dataSourceExists("ParsedDeliveryFile", BASE_HASH + "/234")
        assert.entityCount("ParsedDelivery", 0)
        assert.entityCount("Deliver", 1)

        // Uses txHash + logIndex as entity ID (same as mech subgraph)
        let deliveryId = event.transaction.hash.concatI32(event.logIndex.toI32());

        assert.fieldEquals(
            "Deliver",
            deliveryId.toHexString(),
            "sender",
            sender.toHexString()
        )

        assert.entityCount("Request", 0)
    })

    test("Full request/response cycle", () => {
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")
        let requestId = BigInt.fromI32(234)
        let data = Bytes.fromHexString(DIGEST)


        let event = createMechRequestEvent(
            sender,
            requestId,
            data,
        )

        handleRequest(event)

        assert.entityCount("Request", 1)

        let deliveryEvent = createMechDeliveryEvent(
            sender,
            requestId,
            data,
        )

        handleDeliver(deliveryEvent)

        assert.entityCount("Deliver", 1)

        // Uses txHash + logIndex as entity ID (same as mech subgraph)
        let deliveryId = deliveryEvent.transaction.hash.concatI32(deliveryEvent.logIndex.toI32());

        assert.entityCount("DeliverForMech", 1)

        assert.fieldEquals(
            "DeliverForMech",
            deliveryId.toHexString(),
            "requestId",
            requestId.toHexString()
        )

        assert.fieldEquals(
            "DeliverForMech",
            deliveryId.toHexString(),
            "ipfsHash",
            BASE_HASH
        )

        assert.fieldEquals(
            "DeliverForMech",
            deliveryId.toHexString(),
            "deliver",
            deliveryId.toHexString()
        )

        assert.fieldEquals(
            "Deliver",
            deliveryId.toHexString(),
            "request",
            requestId.toHexString()
        )

        assert.entityCount("Request", 1)
    })





    test("Legacy metadata is enriched later without changing chain counts or grafted prediction totals", () => {
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")
        let requestId = BigInt.fromI32(15)
        let global = getGlobal()
        global.totalPredictRequests = BigInt.fromI32(42)
        global.save()
        let senderEntity = getOrCreateSender(sender)
        senderEntity.totalPredictRequests = BigInt.fromI32(7)
        senderEntity.save()

        handleRequest(createMechRequestEvent(sender, requestId, Bytes.fromHexString(DIGEST)))
        let delivery = createMechDeliveryEvent(sender, requestId, Bytes.fromHexString(DIGEST))
        handleDeliver(delivery)
        let deliveryId = delivery.transaction.hash.concatI32(delivery.logIndex.toI32())
        assert.entityCount("ParsedRequest", 0)
        assert.entityCount("ParsedDelivery", 0)

        let requestContext = new DataSourceContext()
        requestContext.setString(CTX_REQUEST_ID, requestId.toHexString())
        requestContext.setString(CTX_BASE_HASH, BASE_HASH)
        dataSourceMock.setContext(requestContext)
        handleParsedRequest(readFile("tests/ipfs_mocks/mech-request.json"))

        let deliveryContext = new DataSourceContext()
        deliveryContext.setString(CTX_DELIVER_ID, deliveryId.toHexString())
        deliveryContext.setString(CTX_DELIVER_REQUEST, requestId.toHexString())
        deliveryContext.setString(CTX_BASE_HASH, BASE_HASH)
        dataSourceMock.setContext(deliveryContext)
        handleParsedDelivery(readFile("tests/ipfs_mocks/mech-response.json"))

        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "request", requestId.toHexString())
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "hash", BASE_HASH)
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "tool", "prediction-request-rag")
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "content", readFile("tests/ipfs_mocks/mech-request.json").toString())
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "deliver", deliveryId.toHexString())
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "request", requestId.toHexString())
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "hash", BASE_HASH)
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14")
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "tool", "prediction-request-reasoning")
        assert.fieldEquals("Request", requestId.toHexString(), "isDelivered", "true")
        assert.fieldEquals("Global", "", "totalRequests", "1")
        assert.fieldEquals("Global", "", "totalDeliveries", "1")
        assert.fieldEquals("Global", "", "totalTransactions", "2")
        assert.fieldEquals("Global", "", "totalPredictRequests", "42")
        assert.fieldEquals("Sender", sender.toHexString(), "totalLegacyRequests", "1")
        assert.fieldEquals("Sender", sender.toHexString(), "totalPredictRequests", "7")
    })
})