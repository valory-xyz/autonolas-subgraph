import {
    assert,
    describe,
    test,
    clearStore,
    afterEach,
    mockIpfsFile,
    readFile
} from "matchstick-as/assembly/index";
import { parseRequestIpfs } from "../src/marketplace/utils";

const UNHANDLED_TYPE = "[unhandled type]";

describe("Describe mech requests processing", () => {
    afterEach((): void => {
        clearStore();
    });

    test("parse request metadata from metadata.json path", () => {
        const baseCid = "f01701220deadbeef";
        const requestId = "0x1234567890abcdef";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-request.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-request.json");

        parseRequestIpfs(requestId, baseCid);

        const requestContent = readFile("tests/ipfs_mocks/mech-request.json").toString();

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId, "content", requestContent);
        assert.fieldEquals("ParsedRequest", requestId, "hash", baseCid);
        assert.fieldEquals("ParsedRequest", requestId, "request", requestId);
        assert.fieldEquals(
            "ParsedRequest",
            requestId,
            "prompt",
            "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?"
        );
        assert.fieldEquals("ParsedRequest", requestId, "tool", "prediction-request-rag");
    });

    test("parse request metadata with unexpected structure", () => {
        const baseCid = "f01701220badbad00";
        const requestId = "0x0000000000000000000000000000000000000001";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-invalid-response.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-invalid-response.json");

        parseRequestIpfs(requestId, baseCid);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId, "prompt", UNHANDLED_TYPE);
        assert.fieldEquals("ParsedRequest", requestId, "tool", UNHANDLED_TYPE);
    });
});
