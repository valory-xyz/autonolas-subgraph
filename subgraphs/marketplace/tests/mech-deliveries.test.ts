import {
    assert,
    describe,
    test,
    clearStore,
    afterEach,
    dataSourceMock,
    readFile
} from "matchstick-as/assembly/index"
import { Bytes, DataSourceContext, BigInt, log, Address } from "@graphprotocol/graph-ts"
import { MechParsedDeliver } from "../generated/templates"
import { handleMechDeliver } from "../src/mech-deliver"
import { Deliver, DeliverForMech, Request, Sender } from "../generated/schema"



describe("Describe mech deliveries processing", () => {
    afterEach(() => {
        clearStore()
    })

    test("Handle mech delivery", () => {
        // arrange
        const baseCid = "f01701220deadbeef";
        const route = baseCid + "/234";
        const requestIdBigInt = BigInt.fromString("89161918861247656506307074754335742257461958235371918534377414398583737469554");
        let requestId = requestIdBigInt.toHexString();
        let deliveryId = Bytes.fromHexString("0x1234567890abcdef");
        let mechAddress = Address.fromString("0x77af31de935740567cf4ff1986d04b2c964a786a");
        let senderAddress = Address.fromString("0x0000000000000000000000000000000000000001");

        // Create Deliver entity (normally created by handleDeliver event handler)
        let deliver = new Deliver(deliveryId);
        deliver.sender = senderAddress;
        deliver.mech = mechAddress;
        deliver.blockNumber = BigInt.fromI32(100);
        deliver.blockTimestamp = BigInt.fromI32(1000);
        deliver.transactionHash = Bytes.fromHexString("0x1234567890abcdef");
        deliver.save();

        // Create DeliverForMech entity (normally created by handleDeliver event handler)
        let mechDelivery = new DeliverForMech(deliveryId);
        mechDelivery.requestId = requestId;
        mechDelivery.ipfsHash = baseCid;
        mechDelivery.deliver = deliveryId;
        mechDelivery.save();

        // Create Request entity (for linking)
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
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "request", requestId);
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "response", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
        
        // Verify Deliver entity was updated
        assert.fieldEquals("Deliver", deliveryId.toHexString(), "request", requestId);
        assert.fieldEquals("Deliver", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("Deliver", deliveryId.toHexString(), "toolResponse", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
    })

    test("Handle mech delivery with metadata route", () => {
        const baseCid = "f01701220deadbeef";
        const route = baseCid + "/234/metadata.json";
        const requestIdBigInt = BigInt.fromString("89161918861247656506307074754335742257461958235371918534377414398583737469554");
        let requestId = requestIdBigInt.toHexString();
        let deliveryId = Bytes.fromHexString("0xabcdef1234567890");
        let mechAddress = Address.fromString("0x77af31de935740567cf4ff1986d04b2c964a786a");
        let senderAddress = Address.fromString("0x0000000000000000000000000000000000000001");

        // Create Deliver entity (normally created by handleDeliver event handler)
        let deliver = new Deliver(deliveryId);
        deliver.sender = senderAddress;
        deliver.mech = mechAddress;
        deliver.blockNumber = BigInt.fromI32(100);
        deliver.blockTimestamp = BigInt.fromI32(1000);
        deliver.transactionHash = Bytes.fromHexString("0xabcdef1234567890");
        deliver.save();

        // Create DeliverForMech entity (normally created by handleDeliver event handler)
        let mechDelivery = new DeliverForMech(deliveryId);
        mechDelivery.requestId = requestId;
        mechDelivery.ipfsHash = baseCid;
        mechDelivery.deliver = deliveryId;
        mechDelivery.save();

        // Create Request entity (for linking)
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
        request.transactionHash = Bytes.fromHexString("0xabcdef1234567890");
        request.isDelivered = false;
        request.save();

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
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "request", requestId);
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("ParsedDelivery", deliveryId.toHexString(), "response", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
        
        // Verify Deliver entity was updated
        assert.fieldEquals("Deliver", deliveryId.toHexString(), "request", requestId);
        assert.fieldEquals("Deliver", deliveryId.toHexString(), "model", "gpt-4.1-2025-04-14");
        assert.fieldEquals("Deliver", deliveryId.toHexString(), "toolResponse", "{\"p_yes\": 0.99, \"p_no\": 0.01, \"info_utility\": 1.0, \"confidence\": 0.99}");
    })

    test("Handle mech request invalid object", () => {
        // arrange
    })
})  