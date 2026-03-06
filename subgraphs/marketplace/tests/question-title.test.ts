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

describe("questionTitle extraction from request prompts", () => {
    afterEach((): void => {
        clearStore();
    });

    test("extracts questionTitle from prompt with 'With the given question' marker", () => {
        const baseCid = "f01701220deadbeef";
        const requestId = "0x1234567890abcdef";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-request.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-request.json");

        parseRequestIpfs(requestId, baseCid);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals(
            "ParsedRequest",
            requestId,
            "questionTitle",
            "Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?"
        );
    });

    test("returns empty string when prompt has no 'With the given question' marker", () => {
        const baseCid = "f01701220abcd1234";
        const requestId = "0xabcd1234567890ef";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-request-no-question.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-request-no-question.json");

        parseRequestIpfs(requestId, baseCid);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId, "questionTitle", "");
    });

    test("returns empty string when marker exists but no quotes follow", () => {
        const baseCid = "f01701220efgh5678";
        const requestId = "0xefgh5678901234ab";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-request-no-quotes.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-request-no-quotes.json");

        parseRequestIpfs(requestId, baseCid);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId, "questionTitle", "");
    });

    test("questionTitle field is populated along with other parsed fields", () => {
        const baseCid = "f01701220fulltest";
        const requestId = "0xfulltest12345678";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-request.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-request.json");

        parseRequestIpfs(requestId, baseCid);

        const requestContent = readFile("tests/ipfs_mocks/mech-request.json").toString();

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId, "content", requestContent);
        assert.fieldEquals("ParsedRequest", requestId, "hash", baseCid);
        assert.fieldEquals("ParsedRequest", requestId, "tool", "prediction-request-rag");
        assert.fieldEquals(
            "ParsedRequest",
            requestId,
            "questionTitle",
            "Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?"
        );
    });

    test("extracts questionTitle when question contains inner quotes", () => {
        const baseCid = "f01701220innerquotes";
        const requestId = "0xinnerquotes123456";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-request-inner-quotes.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-request-inner-quotes.json");

        parseRequestIpfs(requestId, baseCid);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals(
            "ParsedRequest",
            requestId,
            "questionTitle",
            'Will Trump say "Crypto" or "Bitcoin" this week? (March 8)'
        );
    });

    test("extracts questionTitle from real China WTO example with prediction-offline tool", () => {
        const baseCid = "f01701220chinawto";
        const requestId = "0xchinawto123456ab";

        mockIpfsFile(baseCid + "/metadata.json", "tests/ipfs_mocks/mech-request-china-wto.json");
        mockIpfsFile(baseCid, "tests/ipfs_mocks/mech-request-china-wto.json");

        parseRequestIpfs(requestId, baseCid);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals(
            "ParsedRequest",
            requestId,
            "questionTitle",
            "Will China file a formal complaint with the World Trade Organization against the U.S. over the Huawei chip restrictions by May 26, 2025?"
        );
        assert.fieldEquals("ParsedRequest", requestId, "tool", "prediction-offline");
    });
});
