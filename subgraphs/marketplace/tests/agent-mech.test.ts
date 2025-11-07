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

        // assert
        // assert.entityCount("RequestToMech", 1)
        // assert.fieldEquals(
        //     "RequestToMech",
        //     requestId.toHexString(),
        //     "ipfsHash",
        //     "f017012201234567890abcdef"
        // )
        // assert.fieldEquals(
        //     "RequestToMech",
        //     requestId.toHexString(),
        //     "prompt",
        //     "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?"
        // )
        // assert.fieldEquals(
        //     "RequestToMech",
        //     requestId.toHexString(),
        //     "tool",
        //     "prediction-request-rag"
        // )
        // assert.fieldEquals(
        //     "RequestToMech",
        //     requestId.toHexString(),
        //     "questionTitle",
        //     "Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?"
        // )

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
            "totalRequests",
            "1"
        )

        assert.fieldEquals(
            "Sender",
            sender.toHexString(),
            "totalTransactions",
            "1"
        )

        assert.entityCount("LegacyGlobal", 1)

        assert.fieldEquals(
            "LegacyGlobal",
            "",
            "totalRequests",
            "1"
        )

        assert.fieldEquals(
            "LegacyGlobal",
            "",
            "totalTransactions",
            "1"
        )

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