import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { handleDeliver, handleRequest } from "../src/agent-mech"
import { createMechDeliveryEvent, createMechRequestEvent } from "./agent-mech-utilts"
import { mockIpfsFile } from "matchstick-as"


describe("Describe agent-mech processing", () => {
    afterEach(() => {
        clearStore()
    })

    test("Request created and stored", () => {
        // arrange
        mockIpfsFile("f017012201234567890abcdef/metadata.json", "tests/ipfs_mocks/mech-request.json")

        let requestId = BigInt.fromI32(234)
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")

        let event = createMechRequestEvent(
            sender,
            requestId,
            Bytes.fromHexString("0x1234567890abcdef"),
        )

        // act
        handleRequest(event)

        assert.entityCount("RequestToMech", 1)
        assert.fieldEquals(
            "RequestToMech",
            requestId.toHexString(),
            "ipfsHash",
            "f017012201234567890abcdef"
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
        mockIpfsFile("f017012201234567890abcdef/metadata.json", "tests/ipfs_mocks/mech-request.json")

        let requestId = BigInt.fromI32(15)
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")

        let event = createMechRequestEvent(
            sender,
            requestId,
            Bytes.fromHexString("0x1234567890abcdef"),
        )

        handleRequest(event)

        assert.entityCount("RequestToMech", 1)
        assert.fieldEquals("RequestToMech", requestId.toHexString(), "ipfsHash", "f017012201234567890abcdef")
    })

    test("Response indexed and stored", () => {
        let sender = Address.fromString("0x0000000000000000000000000000000000000001")
        let requestId = BigInt.fromI32(234)
        let data = Bytes.fromHexString("0xdeadbeef")

        mockIpfsFile("f01701220deadbeef/234/metadata.json", "tests/ipfs_mocks/mech-response.json")

        let event = createMechDeliveryEvent(
            sender,
            requestId,
            data,
        )

        handleDeliver(event)

        assert.entityCount("Deliver", 1)

        // Uses requestId (converted to Bytes) as entity ID
        let deliveryId = changetype<Bytes>(Bytes.fromBigInt(requestId));

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
        let data = Bytes.fromHexString("0xdeadbeef")

        mockIpfsFile("f01701220deadbeef/metadata.json", "tests/ipfs_mocks/mech-request.json")
        mockIpfsFile("f01701220deadbeef/234/metadata.json", "tests/ipfs_mocks/mech-response.json")

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

        // Uses requestId (converted to Bytes) as entity ID
        let deliveryId = changetype<Bytes>(Bytes.fromBigInt(requestId));

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
            "f01701220deadbeef"
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
})