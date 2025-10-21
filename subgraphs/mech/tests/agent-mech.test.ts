import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { handleRequest } from "../src/agent-mech"
import { createMechRequestEvent } from "./agent-mech-utilts"
import { mockIpfsFile } from "matchstick-as"


describe("Describe agent-mech processing", () => {
    afterAll(() => {
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
            "requestId",
            requestId.toString()
        )

        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "ipfsHash",
            "f017012201234567890abcdef"
        )

        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "tool",
            "prediction-request-rag"
        )

        assert.fieldEquals(
            "Request",
            requestId.toHexString(),
            "questionTitle",
            "Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?"
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

        assert.entityCount("Global", 1)

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

})