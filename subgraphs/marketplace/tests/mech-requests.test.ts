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
        const cid = "f01701220deadbeef/234";
        let requestId = Bytes.fromHexString("0x1234567890abcdef");

        let context = new DataSourceContext();
        context.setBytes('requestId', requestId);

        MechParsedRequest.create(cid);
        // Assert the dataSource has been created
        assert.dataSourceCount('MechParsedRequest', 1);
        assert.dataSourceExists('MechParsedRequest', cid);
        // logDataSources('GraphTokenLockMetadata')

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(cid, context);

        let request = readFile("tests/ipfs_mocks/mech-request.json");
        log.info("request: {}", [request.toString()]);

        handleMechRequest(request);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "content", request.toString());
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "hash", cid);
        assert.fieldEquals("ParsedRequest", requestId.toHexString(), "request", requestId.toHexString());

    })
})  