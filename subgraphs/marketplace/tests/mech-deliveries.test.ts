import {
    assert,
    describe,
    test,
    clearStore,
    afterEach,
    mockIpfsFile,
    readFile
} from "matchstick-as/assembly/index";
import { Bytes, BigInt, Address } from "@graphprotocol/graph-ts";
import { parseDeliverIpfs } from "../src/marketplace/utils";
import { Deliver } from "../generated/schema";

const UNHANDLED_TYPE = "[unhandled type]";

function requestIdToDecimal(requestId: Bytes): string {
    let copy = new Uint8Array(requestId.length);
    for (let i = 0; i < requestId.length; i++) {
        copy[i] = requestId[i];
    }
    let reversed = Bytes.fromUint8Array(copy.reverse());
    return BigInt.fromUnsignedBytes(reversed).toString();
}

function createDeliverEntity(id: Bytes, requestId: string, requestIdBytes: Bytes): void {
    let entity = new Deliver(id);
    entity.requestId = requestIdBytes;
    entity.sender = Address.fromString("0x0000000000000000000000000000000000000001");
    entity.mech = Address.fromString("0x0000000000000000000000000000000000000002");
    entity.request = requestId;
    entity.blockNumber = BigInt.fromI32(100);
    entity.blockTimestamp = BigInt.fromI32(200);
    entity.transactionHash = Bytes.fromHexString("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    entity.save();
}

describe("Describe mech deliveries processing", () => {
    afterEach((): void => {
        clearStore();
    });

    test("parse delivery metadata from metadata.json path", () => {
        const baseCid = "f01701220deadbeef";
        const deliverId = Bytes.fromHexString("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
        const requestId = Bytes.fromHexString("0x00000000000000000000000000000000000000000000000000000000000000f1");
        const requestIdHex = requestId.toHexString();
        const requestIdDecimal = requestIdToDecimal(requestId);
        const route = baseCid + "/" + requestIdDecimal;

        mockIpfsFile(route + "/metadata.json", "tests/ipfs_mocks/mech-response.json");
        mockIpfsFile(route, "tests/ipfs_mocks/mech-response.json");

        createDeliverEntity(deliverId, requestIdHex, requestId);

        parseDeliverIpfs(deliverId, requestId, baseCid);

        const deliveryContent = readFile("tests/ipfs_mocks/mech-response.json").toString();
        const deliverIdHex = deliverId.toHexString();

        assert.entityCount("ParsedDelivery", 1);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "content", deliveryContent);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "hash", baseCid);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "request", requestIdHex);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "response", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "tool", "prediction-request-reasoning");
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "toolHash", "bafybeiepzi7sen65r6csqgimko7tk6axeckstkrjdwxgmrcsts4kpzinrm");
    });

    test("parse delivery metadata with unexpected structure", () => {
        const baseCid = "f01701220badcafe0";
        const deliverId = Bytes.fromHexString("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        const requestId = Bytes.fromHexString("0x00000000000000000000000000000000000000000000000000000000000000ff");
        const requestIdHex = requestId.toHexString();
        const requestIdDecimal = requestIdToDecimal(requestId);
        const route = baseCid + "/" + requestIdDecimal;

        mockIpfsFile(route + "/metadata.json", "tests/ipfs_mocks/mech-invalid-response.json");
        mockIpfsFile(route, "tests/ipfs_mocks/mech-invalid-response.json");

        createDeliverEntity(deliverId, requestIdHex, requestId);

        parseDeliverIpfs(deliverId, requestId, baseCid);

        const deliverIdHex = deliverId.toHexString();

        assert.entityCount("ParsedDelivery", 1);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "model", UNHANDLED_TYPE);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "response", UNHANDLED_TYPE);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "tool", UNHANDLED_TYPE);
        assert.fieldEquals("ParsedDelivery", deliverIdHex, "toolHash", UNHANDLED_TYPE);
    });
});
