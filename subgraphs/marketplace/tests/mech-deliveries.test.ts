import {
    assert,
    describe,
    test,
    clearStore,
    afterEach,
    dataSourceMock,
    readFile
} from "matchstick-as/assembly/index"
import { Bytes, DataSourceContext, BigInt, log } from "@graphprotocol/graph-ts"
import { MechParsedDeliver } from "../generated/templates"
import { handleMechDeliver } from "../src/mech-deliver"
import { getOddBigIntBytes } from "../src/utils"



describe("Describe mech deliveries processing", () => {
    afterEach(() => {
        clearStore()
    })

    test("Handle mech delivery", () => {
        // arrange
        const baseCid = "f01701220deadbeef";
        const route = baseCid + "/234";
        const requestIdBigInt = BigInt.fromString("89161918861247656506307074754335742257461958235371918534377414398583737469554");
        let requestId = getOddBigIntBytes(requestIdBigInt);
        let deliveryId = Bytes.fromHexString("0x1234567890abcdef");

        let context = new DataSourceContext();
        context.setBytes('deliveryId', deliveryId);
        context.setString('ipfsBase', baseCid);

        MechParsedDeliver.create(route);
        // Assert the dataSource has been created
        assert.dataSourceCount('MechParsedDeliver', 1);
        assert.dataSourceExists('MechParsedDeliver', route);
        // logDataSources('GraphTokenLockMetadata')

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let delivery = readFile("tests/ipfs_mocks/mech-response.json");
        log.info("delivery: {}", [delivery.toString()]);
        handleMechDeliver(delivery);

        assert.entityCount("ParsedDelivery", 1);
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "content", delivery.toString());
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "hash", baseCid);
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "deliver", deliveryId.toHexString());
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "request", requestId.toHexString());
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "response", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
    })

    test("Handle mech delivery with metadata route", () => {
        const baseCid = "f01701220deadbeef";
        const route = baseCid + "/234/metadata.json";
        const requestIdBigInt = BigInt.fromString("89161918861247656506307074754335742257461958235371918534377414398583737469554");
        let requestId = getOddBigIntBytes(requestIdBigInt);
        let deliveryId = Bytes.fromHexString("0xabcdef1234567890");

        let context = new DataSourceContext();
        context.setBytes('deliveryId', deliveryId);
        context.setString('ipfsBase', baseCid);

        MechParsedDeliver.create(route);
        assert.dataSourceExists('MechParsedDeliver', route);

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let delivery = readFile("tests/ipfs_mocks/mech-response.json");
        handleMechDeliver(delivery);

        assert.entityCount("ParsedDelivery", 1);
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "hash", baseCid);
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "request", requestId.toHexString());
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "response", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
    })

    test("Handle mech request invalid object", () => {
        // arrange
    })
})  