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
import { handleMechRequest } from "../src/mech-request"
import { MechParsedRequest } from "../generated/templates"
import { ParsedRequest } from "../generated/schema"



describe("Describe mech requests processing", () => {
    afterEach(() => {
        clearStore()
    })

    test("Handle mech request", () => {
        // arrange
        const baseCid = "f01701220deadbeef";
        const route = baseCid + "/234";
        let requestId = Bytes.fromHexString("0x1234567890abcdef");

        let context = new DataSourceContext();
        context.setBytes('requestId', requestId);
        context.setString('ipfsBase', baseCid);

        MechParsedRequest.create(route);
        // Assert the dataSource has been created
        assert.dataSourceCount('MechParsedRequest', 1);
        assert.dataSourceExists('MechParsedRequest', route);
        // logDataSources('GraphTokenLockMetadata')

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let request = readFile("tests/ipfs_mocks/mech-request.json");
        log.info("request: {}", [request.toString()]);

        handleMechRequest(request);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "content", request.toString());
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "hash", baseCid);
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "request", requestId.toHexString());

        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "prompt", "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?");
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "tool", "prediction-request-rag");
    })

    test("Handle mech request with metadata route", () => {
        const baseCid = "f01701220deadbeef";
        const route = baseCid + "/metadata.json";
        let requestId = Bytes.fromHexString("0xabcdef0123456789");

        let context = new DataSourceContext();
        context.setBytes('requestId', requestId);
        context.setString('ipfsBase', baseCid);

        MechParsedRequest.create(route);
        assert.dataSourceExists('MechParsedRequest', route);

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let request = readFile("tests/ipfs_mocks/mech-request.json");

        handleMechRequest(request);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "hash", baseCid);
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "prompt", "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?");
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "tool", "prediction-request-rag");
    })

    test("Handle mech request invalid object", () => {
        // arrange
        const baseCid = "f01701220deadbeef";
        const route = baseCid + "/234";
        let requestId = Bytes.fromHexString("0x1234567890abcdef");

        let context = new DataSourceContext();
        context.setBytes('requestId', requestId);
        context.setString('ipfsBase', baseCid);

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let request = Bytes.fromHexString("0x1234567890abcdef");
        log.info("request: {}", [request.toString()]);

        handleMechRequest(request);

        assert.entityCount("ParsedRequest", 0);
    })
})  