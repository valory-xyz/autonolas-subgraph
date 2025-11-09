import {
    assert,
    describe,
    test,
    clearStore,
    afterEach,
    dataSourceMock,
    readFile
} from "matchstick-as/assembly/index"
import { Bytes, DataSourceContext, log, Address, BigInt } from "@graphprotocol/graph-ts"
import { handleMechRequest } from "../src/mech-request"
import { MechParsedRequest } from "../generated/templates"
import { ParsedRequest, Request, RequestToMech, Sender } from "../generated/schema"



describe("Describe mech requests processing", () => {
    afterEach(() => {
        clearStore()
    })

    test("Handle mech request", () => {
        // arrange
        const baseCid = "f01701220deadbeef";
        const requestIdBigInt = BigInt.fromI32(564);
        const route = baseCid;
        let requestId = requestIdBigInt.toHexString();
        let mechAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
        let senderAddress = Address.fromString("0x0000000000000000000000000000000000000001");

        // Create Request entity (normally created by handleRequest event handler)
        let request = new Request(requestId);
        let sender = new Sender(senderAddress);
        sender.totalRequests = BigInt.fromI32(0);
        sender.totalTransactions = BigInt.fromI32(0);
        sender.totalAtaTransactions = BigInt.fromI32(0);
        sender.totalMarketplaceRequests = BigInt.fromI32(0);
        sender.totalOffChainRequests = BigInt.fromI32(0);
        sender.save();
        request.sender = senderAddress;
        request.mech = mechAddress;
        request.blockNumber = BigInt.fromI32(100);
        request.blockTimestamp = BigInt.fromI32(1000);
        request.transactionHash = Bytes.fromHexString("0x1234567890abcdef");
        request.isDelivered = false;
        request.save();

        let requestToMech = new RequestToMech(requestId);
        requestToMech.ipfsHash = baseCid;
        requestToMech.request = requestId;
        requestToMech.save();

        let context = new DataSourceContext();
        context.setString('requestId', requestId);
        context.setString('ipfsBase', baseCid);

        MechParsedRequest.create(route);
        // Assert the dataSource has been created
        assert.dataSourceCount('MechParsedRequest', 1);
        assert.dataSourceExists('MechParsedRequest', route);
        // logDataSources('GraphTokenLockMetadata')

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let requestContent = readFile("tests/ipfs_mocks/mech-request.json");
        log.info("request: {}", [requestContent.toString()]);

        handleMechRequest(requestContent);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId, "content", requestContent.toString());
        assert.fieldEquals("ParsedRequest", requestId, "hash", baseCid);
        assert.fieldEquals("ParsedRequest", requestId, "request", requestId);

        assert.fieldEquals("ParsedRequest", requestId, "prompt", "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?");
        assert.fieldEquals("ParsedRequest", requestId, "tool", "prediction-request-rag");

        assert.fieldEquals("RequestToMech", requestId, "prompt", "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?");
        assert.fieldEquals("RequestToMech", requestId, "tool", "prediction-request-rag");
        assert.fieldEquals("RequestToMech", requestId, "questionTitle", "Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?");
    })

    test("Handle mech request with metadata route", () => {
        const baseCid = "f01701220deadbeef";
        const requestIdBigInt = BigInt.fromI32(1337);
        const route = baseCid + "/metadata.json";
        let requestId = requestIdBigInt.toHexString();
        let mechAddress = Address.fromString("0xa16081f360e3847006db660bae1c6d1b2e17ec2a");
        let senderAddress = Address.fromString("0x0000000000000000000000000000000000000001");

        // Create Request entity (normally created by handleRequest event handler)
        let request = new Request(requestId);
        let sender = new Sender(senderAddress);
        sender.totalRequests = BigInt.fromI32(0);
        sender.totalTransactions = BigInt.fromI32(0);
        sender.totalAtaTransactions = BigInt.fromI32(0);
        sender.totalMarketplaceRequests = BigInt.fromI32(0);
        sender.totalOffChainRequests = BigInt.fromI32(0);
        sender.save();
        request.sender = senderAddress;
        request.mech = mechAddress;
        request.blockNumber = BigInt.fromI32(100);
        request.blockTimestamp = BigInt.fromI32(1000);
        request.transactionHash = Bytes.fromHexString("0xabcdef0123456789");
        request.isDelivered = false;
        request.save();

        let requestToMech = new RequestToMech(requestId);
        requestToMech.ipfsHash = baseCid;
        requestToMech.request = requestId;
        requestToMech.save();

        let context = new DataSourceContext();
        context.setString('requestId', requestId);
        context.setString('ipfsBase', baseCid);

        MechParsedRequest.create(route);
        assert.dataSourceExists('MechParsedRequest', route);

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let requestContent = readFile("tests/ipfs_mocks/mech-request.json");

        handleMechRequest(requestContent);

        assert.entityCount("ParsedRequest", 1);
        assert.fieldEquals("ParsedRequest", requestId, "hash", baseCid);
        assert.fieldEquals("ParsedRequest", requestId, "prompt", "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?");
        assert.fieldEquals("ParsedRequest", requestId, "tool", "prediction-request-rag");

        assert.fieldEquals("RequestToMech", requestId, "prompt", "With the given question \"Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?\" and the `yes` option represented by `Yes` and the `no` option represented by `No`, what are the respective probabilities of `p_yes` and `p_no` occurring?");
        assert.fieldEquals("RequestToMech", requestId, "tool", "prediction-request-rag");
        assert.fieldEquals("RequestToMech", requestId, "questionTitle", "Will the average price of a gallon of gas in the United States reach at least $3.30 by June 19, 2025, in response to the Israel-Iran conflict?");
    })

    test("Handle mech request invalid object", () => {
        // arrange
        const baseCid = "f01701220deadbeef";
        const requestIdBigInt = BigInt.fromI32(564);
        const route = baseCid;
        let requestId = requestIdBigInt.toHexString();

        let context = new DataSourceContext();
        context.setString('requestId', requestId);
        context.setString('ipfsBase', baseCid);

        dataSourceMock.resetValues();
        dataSourceMock.setAddressAndContext(route, context);

        let requestContent = Bytes.fromHexString("0x1234567890abcdef");
        log.info("request: {}", [requestContent.toString()]);

        handleMechRequest(requestContent);

        assert.entityCount("ParsedRequest", 0);
    })
})  