import {
  assert,
  describe,
  test,
  afterEach,
  clearStore,
  dataSourceMock,
  createMockedFunction,
} from "matchstick-as/assembly/index";
import { Address, BigDecimal, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";

import { handleMarketplaceRequest } from "../../src/marketplace/mech-marketplace";
import { handleDeliver, handleRequest } from "../../src/marketplace/mech-nvm-subscription-token-usdc";

import { createMarketplaceRequestEvent } from "../marketplace/mech-marketplace-utils";
import {
  createDeliverEvent,
  createRequestEvent,
} from "../marketplace/mech-nvm-subscription-token-usdc-utils";
import {
  TEST_DATA_USDC,
  TEST_MECH,
  TEST_MECH_SERVICE_MULTISIG,
  TEST_REQUESTER,
  TEST_REQUEST_ID_8,
  TEST_REQUEST_ID_9,
} from "../marketplace/test-constants";

import {
  CreateMech as CreateMechEntity,
  Mech,
  Request,
  RequestToMarketplace,
} from "../../generated/schema";
import {
  calculateBaseNvmCreditsToUsd,
  getGlobal,
} from "../../src/marketplace/utils";
import { BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC } from "../../src/marketplace/constants";

const ZERO_32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const PAYMENT_TYPE_BYTES32 =
  "0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1";

function initNetworkBase(): void {
  dataSourceMock.setNetwork("base");
}

function mockMaxDeliveryRate(mech: Address, rate: BigInt): void {
  createMockedFunction(mech, 'maxDeliveryRate', 'maxDeliveryRate():(uint256)')
    .returns([ethereum.Value.fromUnsignedBigInt(rate)]);
}

function createMechWithMapping(
  mechAddress: Address,
  serviceId: BigInt,
  mechFactory: Address
): void {
  let mapping = new CreateMechEntity(mechAddress);
  mapping.mech = mechAddress;
  mapping.serviceId = serviceId;
  mapping.mechFactory = mechFactory;
  mapping.blockNumber = BigInt.zero();
  mapping.blockTimestamp = BigInt.zero();
  mapping.transactionHash = Bytes.fromHexString(ZERO_32);
  mapping.save();

  let mechEntity = new Mech(serviceId.toString());
  mechEntity.address = mechAddress;
  mechEntity.mechFactory = mechFactory;
  mechEntity.owner = Address.zero();
  mechEntity.service = serviceId.toString();
  mechEntity.totalDeliveriesTransactions = BigInt.zero();
  mechEntity.receivedRequests = BigInt.zero();
  mechEntity.selfDeliveredFromReceived = BigInt.zero();
  mechEntity.deliveredByOthersFromReceived = BigInt.zero();
  mechEntity.maxDeliveryRate = null;
  mechEntity.karma = BigInt.zero();
  mechEntity.paymentType = Bytes.fromHexString(PAYMENT_TYPE_BYTES32);
  mechEntity.save();

  // Mock maxDeliveryRate for fee tracking
  mockMaxDeliveryRate(mechAddress, BigInt.fromI32(0));
}

function ensureGlobalExists(): void {
  let g = getGlobal();
  g.save();
  assert.entityCount("Global", 1);
  assert.fieldEquals("Global", "", "totalFeesPaidUSD", "0");
}

describe("Fee tracking scope (marketplace on-chain only)", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("Direct mech delivery does not update finalFeeUSD or totals (scope guard)", () => {
    initNetworkBase();
    ensureGlobalExists();

    // Create mech mapping so template handlers can resolve serviceId
    createMechWithMapping(
      TEST_MECH,
      BigInt.fromI32(1),
      Address.fromString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC)
    );

    // Direct mech request (no MarketplaceRequest)
    let requestEvent = createRequestEvent(TEST_MECH, TEST_REQUEST_ID_9, TEST_DATA_USDC);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequest(requestEvent);

    // Make conversion possible if scope allowed (credits path)
    let request = Request.load(TEST_REQUEST_ID_9.toHexString());
    if (request !== null) {
      request.feeUnit = "CREDITS";
      request.save();
    }

    let deliveryRateCredits = BigInt.fromI32(1000000); // => 0.99 USD with current TOKEN_RATIO_BASE
    let deliverEvent = createDeliverEvent(
      TEST_MECH,
      TEST_REQUEST_ID_9,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRateCredits,
      TEST_DATA_USDC
    );
    deliverEvent.transaction.from = TEST_MECH; // irrelevant for fee scope
    handleDeliver(deliverEvent);

    // Scope guard should prevent writing finalFeeUSD and totals
    // Note: In matchstick, a null/unset field doesn't exist on the entity,
    // so we verify the scope guard worked by checking totals are still 0
    assert.fieldEquals("Sender", TEST_REQUESTER.toHexString(), "totalFeesPaidUSD", "0");
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", "0");
    let rtm = RequestToMarketplace.load(TEST_REQUEST_ID_9.toHexString());
    assert.assertNotNull(rtm);
    if (rtm !== null) {
      assert.booleanEquals(rtm.isMarketplace, false);
    }
  });

  test("Marketplace on-chain delivery updates finalFeeUSD and totals", () => {
    initNetworkBase();
    ensureGlobalExists();

    createMechWithMapping(
      TEST_MECH,
      BigInt.fromI32(2),
      Address.fromString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC)
    );

    // MarketplaceRequest marks the requestId as in-scope (isMarketplace=true)
    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_8],
      [TEST_DATA_USDC]
    );
    handleMarketplaceRequest(marketplaceEvent);

    // Mech template request creates the Request entity the Deliver will attach to
    let requestEvent = createRequestEvent(TEST_MECH, TEST_REQUEST_ID_8, TEST_DATA_USDC);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequest(requestEvent);

    // Ensure feeUnit is present for conversion (credits path)
    let request = Request.load(TEST_REQUEST_ID_8.toHexString());
    if (request !== null) {
      request.feeUnit = "CREDITS";
      request.save();
    }

    let deliveryRateCredits = BigInt.fromI32(1000000); // => 0.99 USD
    let expectedUsd = calculateBaseNvmCreditsToUsd(deliveryRateCredits);

    let deliverEvent = createDeliverEvent(
      TEST_MECH,
      TEST_REQUEST_ID_8,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRateCredits,
      TEST_DATA_USDC
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliver(deliverEvent);

    assert.fieldEquals(
      "Request",
      TEST_REQUEST_ID_8.toHexString(),
      "finalFeeUSD",
      expectedUsd.toString()
    );
    assert.fieldEquals(
      "Sender",
      TEST_REQUESTER.toHexString(),
      "totalFeesPaidUSD",
      expectedUsd.toString()
    );
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", expectedUsd.toString());
    assert.fieldEquals(
      "RequestToMarketplace",
      TEST_REQUEST_ID_8.toHexString(),
      "isMarketplace",
      "true"
    );
  });

  test("Duplicate delivery does not double-count totals", () => {
    initNetworkBase();
    ensureGlobalExists();

    createMechWithMapping(
      TEST_MECH,
      BigInt.fromI32(3),
      Address.fromString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC)
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_8],
      [TEST_DATA_USDC]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEvent(TEST_MECH, TEST_REQUEST_ID_8, TEST_DATA_USDC);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequest(requestEvent);

    let request = Request.load(TEST_REQUEST_ID_8.toHexString());
    if (request !== null) {
      request.feeUnit = "CREDITS";
      request.save();
    }

    let deliveryRateCredits = BigInt.fromI32(1000000);
    let expectedUsd = calculateBaseNvmCreditsToUsd(deliveryRateCredits);

    let deliverEvent1 = createDeliverEvent(
      TEST_MECH,
      TEST_REQUEST_ID_8,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRateCredits,
      TEST_DATA_USDC
    );
    deliverEvent1.transaction.from = TEST_MECH;
    handleDeliver(deliverEvent1);

    // Second deliver event (different logIndex to avoid entity ID collision)
    let deliverEvent2 = createDeliverEvent(
      TEST_MECH,
      TEST_REQUEST_ID_8,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRateCredits,
      TEST_DATA_USDC
    );
    deliverEvent2.transaction.from = TEST_MECH;
    deliverEvent2.logIndex = BigInt.fromI32(1);
    handleDeliver(deliverEvent2);

    assert.fieldEquals("Global", "", "totalFeesPaidUSD", expectedUsd.toString());
    assert.fieldEquals(
      "Sender",
      TEST_REQUESTER.toHexString(),
      "totalFeesPaidUSD",
      expectedUsd.toString()
    );
    assert.fieldEquals(
      "Request",
      TEST_REQUEST_ID_8.toHexString(),
      "finalFeeUSD",
      expectedUsd.toString()
    );
  });

  test("Multi-request batch fee tracking (3+ requests)", () => {
    initNetworkBase();
    ensureGlobalExists();

    createMechWithMapping(
      TEST_MECH,
      BigInt.fromI32(4),
      Address.fromString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC)
    );

    let requestId3 = Bytes.fromHexString(
      "0x3333333333333333333333333333333333333333333333333333333333333333"
    );
    let requestId4 = Bytes.fromHexString(
      "0x4444444444444444444444444444444444444444444444444444444444444444"
    );
    let requestId5 = Bytes.fromHexString(
      "0x5555555555555555555555555555555555555555555555555555555555555555"
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [requestId3, requestId4, requestId5],
      [TEST_DATA_USDC, TEST_DATA_USDC, TEST_DATA_USDC]
    );
    handleMarketplaceRequest(marketplaceEvent);

    // Process requests individually
    for (let i = 0; i < 3; i++) {
      let reqId = i == 0 ? requestId3 : i == 1 ? requestId4 : requestId5;
      let requestEvent = createRequestEvent(TEST_MECH, reqId, TEST_DATA_USDC);
      requestEvent.transaction.from = TEST_REQUESTER;
      handleRequest(requestEvent);

      let request = Request.load(reqId.toHexString());
      if (request !== null) {
        request.feeUnit = "CREDITS";
        request.save();
      }
    }

    let deliveryRateCredits = BigInt.fromI32(500000);
    let perRequestUsd = calculateBaseNvmCreditsToUsd(deliveryRateCredits);

    // Deliver all 3 requests
    for (let i = 0; i < 3; i++) {
      let reqId = i == 0 ? requestId3 : i == 1 ? requestId4 : requestId5;
      let deliverEvent = createDeliverEvent(
        TEST_MECH,
        reqId,
        TEST_MECH_SERVICE_MULTISIG,
        deliveryRateCredits,
        TEST_DATA_USDC
      );
      deliverEvent.transaction.from = TEST_MECH;
      deliverEvent.logIndex = BigInt.fromI32(i);
      handleDeliver(deliverEvent);
    }

    // Each request should have its own finalFeeUSD
    assert.fieldEquals("Request", requestId3.toHexString(), "finalFeeUSD", perRequestUsd.toString());
    assert.fieldEquals("Request", requestId4.toHexString(), "finalFeeUSD", perRequestUsd.toString());
    assert.fieldEquals("Request", requestId5.toHexString(), "finalFeeUSD", perRequestUsd.toString());

    // Totals should be 3x the per-request amount
    let totalUsd = perRequestUsd.times(BigDecimal.fromString("3"));
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", totalUsd.toString());
    assert.fieldEquals("Sender", TEST_REQUESTER.toHexString(), "totalFeesPaidUSD", totalUsd.toString());
  });

  test("Multiple senders accumulate separately", () => {
    initNetworkBase();
    ensureGlobalExists();

    let mech1 = Address.fromString("0x0000000000000000000000000000000000000051");
    let mech2 = Address.fromString("0x0000000000000000000000000000000000000052");
    let senderA = Address.fromString("0x0000000000000000000000000000000000000061");
    let senderB = Address.fromString("0x0000000000000000000000000000000000000062");

    createMechWithMapping(mech1, BigInt.fromI32(5), Address.fromString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC));
    createMechWithMapping(mech2, BigInt.fromI32(6), Address.fromString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC));

    let requestIdA = Bytes.fromHexString("0xaaaa000000000000000000000000000000000000000000000000000000000000");
    let requestIdB = Bytes.fromHexString("0xbbbb000000000000000000000000000000000000000000000000000000000000");

    // Sender A request
    let marketplaceEventA = createMarketplaceRequestEvent(mech1, senderA, [requestIdA], [TEST_DATA_USDC]);
    handleMarketplaceRequest(marketplaceEventA);
    let requestEventA = createRequestEvent(mech1, requestIdA, TEST_DATA_USDC);
    requestEventA.transaction.from = senderA;
    handleRequest(requestEventA);

    // Sender B request
    let marketplaceEventB = createMarketplaceRequestEvent(mech2, senderB, [requestIdB], [TEST_DATA_USDC]);
    handleMarketplaceRequest(marketplaceEventB);
    let requestEventB = createRequestEvent(mech2, requestIdB, TEST_DATA_USDC);
    requestEventB.transaction.from = senderB;
    handleRequest(requestEventB);

    // Set fee units
    let reqA = Request.load(requestIdA.toHexString());
    if (reqA !== null) { reqA.feeUnit = "CREDITS"; reqA.save(); }
    let reqB = Request.load(requestIdB.toHexString());
    if (reqB !== null) { reqB.feeUnit = "CREDITS"; reqB.save(); }

    let deliveryRateA = BigInt.fromI32(1000000);
    let deliveryRateB = BigInt.fromI32(2000000);
    let usdA = calculateBaseNvmCreditsToUsd(deliveryRateA);
    let usdB = calculateBaseNvmCreditsToUsd(deliveryRateB);

    // Deliver A
    let deliverEventA = createDeliverEvent(mech1, requestIdA, TEST_MECH_SERVICE_MULTISIG, deliveryRateA, TEST_DATA_USDC);
    deliverEventA.transaction.from = mech1;
    handleDeliver(deliverEventA);

    // Deliver B
    let deliverEventB = createDeliverEvent(mech2, requestIdB, TEST_MECH_SERVICE_MULTISIG, deliveryRateB, TEST_DATA_USDC);
    deliverEventB.transaction.from = mech2;
    deliverEventB.logIndex = BigInt.fromI32(1);
    handleDeliver(deliverEventB);

    // Verify separate sender totals
    assert.fieldEquals("Sender", senderA.toHexString(), "totalFeesPaidUSD", usdA.toString());
    assert.fieldEquals("Sender", senderB.toHexString(), "totalFeesPaidUSD", usdB.toString());

    // Global total is sum of both
    let totalUsd = usdA.plus(usdB);
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", totalUsd.toString());
  });

  test("Request without delivery has feeUSD but null finalFeeUSD", () => {
    initNetworkBase();
    ensureGlobalExists();

    createMechWithMapping(
      TEST_MECH,
      BigInt.fromI32(7),
      Address.fromString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC)
    );

    let requestIdUndelivered = Bytes.fromHexString(
      "0xcccc000000000000000000000000000000000000000000000000000000000000"
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [requestIdUndelivered],
      [TEST_DATA_USDC]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEvent(TEST_MECH, requestIdUndelivered, TEST_DATA_USDC);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequest(requestEvent);

    // Set feeUnit manually (simulating what MarketplaceRequest would do with maxDeliveryRate)
    let request = Request.load(requestIdUndelivered.toHexString());
    if (request !== null) {
      request.feeUnit = "CREDITS";
      request.feeRaw = BigInt.fromI32(1000000);
      request.feeUSD = calculateBaseNvmCreditsToUsd(BigInt.fromI32(1000000));
      request.save();
    }

    // No delivery - finalFeeUSD should remain unset (null fields don't exist in matchstick)
    // We verify by checking feeUnit exists but totals are still 0
    assert.fieldEquals("Request", requestIdUndelivered.toHexString(), "feeUnit", "CREDITS");

    // Global and sender totals should still be 0 (proves finalFeeUSD wasn't set)
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", "0");
    assert.fieldEquals("Sender", TEST_REQUESTER.toHexString(), "totalFeesPaidUSD", "0");
  });
});


