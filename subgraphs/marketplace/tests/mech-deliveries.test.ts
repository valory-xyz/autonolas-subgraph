import {
    assert,
    describe,
    test,
    clearStore,
    afterEach,
    dataSourceMock,
    readFile
} from "matchstick-as/assembly/index"
import { Bytes, DataSourceContext, log } from "@graphprotocol/graph-ts"
import { MechParsedDeliver } from "../generated/templates"
import { ParsedDeliver } from "../generated/schema"
import { handleMechDeliver } from "../src/mech-deliver"



describe("Describe mech deliveries processing", () => {
    afterEach(() => {
        clearStore()
    })

    test("Handle mech delivery", () => {
        // arrange
        const cid = "f01701220deadbeef/234";
        let requestId = Bytes.fromHexString("0xc51fdb9278ea5dac88b9cef72bd211e7cfa31517b1cb29f275090ec92d1cca72");
        let deliveryId = Bytes.fromHexString("0x1234567890abcdef");

        let context = new DataSourceContext();
        context.setBytes('deliveryId', deliveryId);

        MechParsedDeliver.create(cid);
        // Assert the dataSource has been created
        assert.dataSourceCount('MechParsedDeliver', 1);
        assert.dataSourceExists('MechParsedDeliver', cid);
        // logDataSources('GraphTokenLockMetadata')

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(cid, context);

        let delivery = readFile("tests/ipfs_mocks/mech-response.json");
        log.info("delivery: {}", [delivery.toString()]);
        handleMechDeliver(delivery);

        assert.entityCount("ParsedDeliver", 1);
        assert.fieldEquals("ParsedDeliver", deliveryId.toHexString(), "content", delivery.toString());
        assert.fieldEquals("ParsedDeliver", deliveryId.toHexString(), "hash", cid);
        assert.fieldEquals("ParsedDeliver", deliveryId.toHexString(), "deliver", deliveryId.toHexString());
        assert.fieldEquals("ParsedDeliver", deliveryId.toHexString(), "request", requestId.toHexString());
        assert.fieldEquals("ParsedDeliver", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("ParsedDeliver", deliveryId.toHexString(), "response", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
    })

    test("Handle mech request invalid object", () => {
        // arrange
    })
})  