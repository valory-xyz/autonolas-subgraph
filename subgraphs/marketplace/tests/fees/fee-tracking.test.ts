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
import {
  handleDeliver as handleDeliverNative,
  handleRequest as handleRequestNative,
} from "../../src/marketplace/mech-fixed-price-native";
import {
  handleDeliver as handleDeliverToken,
  handleRequest as handleRequestToken,
} from "../../src/marketplace/mech-fixed-price-token";
import {
  handleDeliver as handleDeliverNvmNative,
  handleRequest as handleRequestNvmNative,
} from "../../src/marketplace/mech-nvm-subscription-native";
import {
  handleDeliverWithSignaturesV2,
} from "../../src/marketplace/mech-marketplace";

import { createMarketplaceRequestEvent } from "../marketplace/mech-marketplace-utils";
import {
  createDeliverEvent as createDeliverEventNative,
  createRequestEvent as createRequestEventNative,
  createMechWithMapping as createMechNative,
} from "../marketplace/mech-fixed-price-native-utils";
import {
  createDeliverEvent as createDeliverEventToken,
  createRequestEvent as createRequestEventToken,
} from "../marketplace/mech-fixed-price-token-utils";
import {
  createDeliverEvent as createDeliverEventNvmNative,
  createRequestEvent as createRequestEventNvmNative,
} from "../marketplace/mech-nvm-subscription-native-utils";
import {
  createDeliverWithSignaturesV2Event,
} from "../marketplace/mech-marketplace-utils";
import { createCreateServiceEvent, createCreateMultisigWithAgentsEvent } from "../service-registry-l-2-utils";
import {
  TEST_DATA,
  TEST_MECH,
  TEST_MECH_SERVICE_MULTISIG,
  TEST_REQUESTER,
  TEST_REQUEST_ID_1,
  TEST_REQUEST_ID_2,
  TEST_REQUEST_ID_3,
  TEST_REQUEST_ID_4,
  TEST_REQUEST_ID_6,
  TEST_REQUEST_ID_7,
  TEST_REQUEST_ID_8,
  TEST_REQUEST_ID_9,
  TEST_REQUEST_ID_A,
} from "../marketplace/test-constants";

import {
  CreateMech as CreateMechEntity,
  Mech,
  Service,
} from "../../generated/schema";
import {
  getGlobal,
  calculateBaseNvmCreditsToUsd,
  calculateGnosisNvmCreditsToUsd,
} from "../../src/marketplace/utils";
import {
  convertGnosisNativeWeiToUsd,
  convertBaseNativeWeiToUsd,
} from "../../src/marketplace/fee-utils";
import {
  GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN,
  GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_NATIVE,
  CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD,
  BALANCER_VAULT_ADDRESS_BASE,
  OLAS_USDC_POOL_ADDRESS_BASE,
  OLAS_ADDRESS_BASE,
  USDC_ADDRESS_BASE,
  BALANCER_VAULT_ADDRESS_GNOSIS,
  OLAS_WXDAI_POOL_ADDRESS_GNOSIS,
  OLAS_ADDRESS_GNOSIS,
  WXDAI_ADDRESS_GNOSIS,
} from "../../src/marketplace/constants";
import { handleCreateService, handleCreateMultisigWithAgents } from "../../src/marketplace/service-registry-l-2";

const ZERO_32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const PAYMENT_TYPE_BYTES32 = "0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1";

function initNetworkGnosis(): void {
  dataSourceMock.setNetwork("gnosis");
}

function initNetworkBase(): void {
  dataSourceMock.setNetwork("base");
}

function createMechWithMapping(
  mechAddress: Address,
  serviceId: BigInt,
  mechFactory: Address,
  maxDeliveryRate: BigInt = BigInt.fromI32(0)
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
  mechEntity.maxDeliveryRate = maxDeliveryRate;
  mechEntity.karma = BigInt.zero();
  mechEntity.paymentType = Bytes.fromHexString(PAYMENT_TYPE_BYTES32);
  mechEntity.save();
}

function ensureGlobalExists(): void {
  let g = getGlobal();
  g.save();
  assert.entityCount("Global", 1);
  assert.fieldEquals("Global", "", "totalFeesPaidUSD", "0");
}

function createService(serviceId: BigInt, multisig: Address): void {
  let createServiceEvent = createCreateServiceEvent(serviceId, Bytes.fromHexString(ZERO_32));
  handleCreateService(createServiceEvent);

  let createMultisigEvent = createCreateMultisigWithAgentsEvent(serviceId, multisig);
  handleCreateMultisigWithAgents(createMultisigEvent);

  let service = Service.load(serviceId.toString());
  if (service !== null) {
    service.totalRequests = BigInt.zero();
    service.totalDeliveries = BigInt.zero();
    service.save();
  }
}

describe("Fee tracking comprehensive tests", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("should_set_finalFeeUSD_equal_to_feeUSD_when_delivery_rate_equals_locked_rate", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(1);
    let lockedRate = BigInt.fromString("1000000000000000000"); // 1 xDAI
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE),
      lockedRate
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_1],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNative(TEST_MECH, TEST_REQUEST_ID_1, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNative(requestEvent);

    let deliveryRate = lockedRate;
    let deliverEvent = createDeliverEventNative(
      TEST_MECH,
      TEST_REQUEST_ID_1,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNative(deliverEvent);

    let expectedUsd = convertGnosisNativeWeiToUsd(deliveryRate);
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "finalFeeUSD", expectedUsd.toString());
    assert.fieldEquals("Request", TEST_REQUEST_ID_1.toHexString(), "feeUSD", expectedUsd.toString());
  });

  test("should_set_finalFeeUSD_less_than_feeUSD_when_delivery_rate_is_discounted", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(2);
    let lockedRate = BigInt.fromString("2000000000000000000"); // 2 xDAI
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE),
      lockedRate
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_2],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNative(TEST_MECH, TEST_REQUEST_ID_2, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNative(requestEvent);

    let deliveryRate = BigInt.fromString("1000000000000000000"); // 1 xDAI (discounted)
    let deliverEvent = createDeliverEventNative(
      TEST_MECH,
      TEST_REQUEST_ID_2,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNative(deliverEvent);

    let lockedFeeUsd = convertGnosisNativeWeiToUsd(lockedRate);
    let finalFeeUsd = convertGnosisNativeWeiToUsd(deliveryRate);

    assert.fieldEquals("Request", TEST_REQUEST_ID_2.toHexString(), "feeUSD", lockedFeeUsd.toString());
    assert.fieldEquals("Request", TEST_REQUEST_ID_2.toHexString(), "finalFeeUSD", finalFeeUsd.toString());
    assert.assertTrue(finalFeeUsd.lt(lockedFeeUsd));
  });

  test("should_convert_base_native_eth_to_usd_using_chainlink_price_feed", () => {
    initNetworkBase();
    ensureGlobalExists();

    let ethPrice = BigInt.fromString('250000000000'); // $2500 with 8 decimals
    createMockedFunction(
      Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD),
      'latestRoundData',
      'latestRoundData():(uint80,int256,uint256,uint256,uint80)'
    ).returns([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
      ethereum.Value.fromSignedBigInt(ethPrice),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
    ]);

    let serviceId = BigInt.fromI32(3);
    let lockedRate = BigInt.fromString("1000000000000000000"); // 1 ETH
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    // Pass maxDeliveryRate to Mech entity (no RPC mock needed - reads from entity)
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(BASE_MECH_FACTORY_FIXED_PRICE_NATIVE),
      lockedRate
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_3],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNative(TEST_MECH, TEST_REQUEST_ID_3, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNative(requestEvent);

    let deliveryRate = lockedRate;
    let deliverEvent = createDeliverEventNative(
      TEST_MECH,
      TEST_REQUEST_ID_3,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNative(deliverEvent);

    let expectedUsd = convertBaseNativeWeiToUsd(deliveryRate);
    assert.fieldEquals("Request", TEST_REQUEST_ID_3.toHexString(), "finalFeeUSD", expectedUsd.toString());
    assert.assertTrue(expectedUsd.gt(BigDecimal.fromString("2000")));
  });

  test("should_convert_olas_token_to_usd_using_balancer_pool_price", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let poolId = Bytes.fromHexString("0x79c872ed3acb3fc5770dd8a0cd9cd5db3b3ac985000200000000000000000067");

    createMockedFunction(
      Address.fromString(OLAS_WXDAI_POOL_ADDRESS_GNOSIS),
      'getPoolId',
      'getPoolId():(bytes32)'
    ).returns([ethereum.Value.fromFixedBytes(poolId)]);

    let tokens: Address[] = [
      Address.fromString(OLAS_ADDRESS_GNOSIS),
      Address.fromString(WXDAI_ADDRESS_GNOSIS),
    ];
    let balances: BigInt[] = [
      BigInt.fromString("1000000000000000000000"), // 1000 OLAS (18 decimals)
      BigInt.fromString("500000000000000000000"), // 500 WXDAI (18 decimals) -> 0.5 xDAI per OLAS
    ];

    createMockedFunction(
      Address.fromString(BALANCER_VAULT_ADDRESS_GNOSIS),
      'getPoolTokens',
      'getPoolTokens(bytes32):(address[],uint256[],uint256)'
    ).withArgs([ethereum.Value.fromFixedBytes(poolId)])
    .returns([
      ethereum.Value.fromAddressArray(tokens),
      ethereum.Value.fromUnsignedBigIntArray(balances),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0)),
    ]);

    let serviceId = BigInt.fromI32(4);
    let lockedRate = BigInt.fromString("100000000000000000000"); // 100 OLAS
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN),
      lockedRate
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_4],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventToken(TEST_MECH, TEST_REQUEST_ID_4, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestToken(requestEvent);

    let deliveryRate = lockedRate;
    let deliverEvent = createDeliverEventToken(
      TEST_MECH,
      TEST_REQUEST_ID_4,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverToken(deliverEvent);

    assert.fieldEquals("Request", TEST_REQUEST_ID_4.toHexString(), "feeUnit", "TOKEN");
    assert.fieldEquals("Request", TEST_REQUEST_ID_4.toHexString(), "finalFeeUSD", "50");
  });

  test("should_convert_nvm_credits_to_usd_using_fixed_ratio_gnosis", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(5);
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE),
      BigInt.fromI32(0)
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_6],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNvmNative(TEST_MECH, TEST_REQUEST_ID_6, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNvmNative(requestEvent);

    let deliveryRateCredits = BigInt.fromI32(1000000);
    let deliverEvent = createDeliverEventNvmNative(
      TEST_MECH,
      TEST_REQUEST_ID_6,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRateCredits,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNvmNative(deliverEvent);

    let expectedUsd = calculateGnosisNvmCreditsToUsd(deliveryRateCredits);
    assert.fieldEquals("Request", TEST_REQUEST_ID_6.toHexString(), "feeUnit", "CREDITS");
    assert.fieldEquals("Request", TEST_REQUEST_ID_6.toHexString(), "finalFeeUSD", expectedUsd.toString());
    assert.assertTrue(expectedUsd.gt(BigDecimal.fromString("0")));
  });

  test("should_handle_zero_fee_delivery_without_errors", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(6);
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE),
      BigInt.zero()
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_7],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNative(TEST_MECH, TEST_REQUEST_ID_7, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNative(requestEvent);

    let deliveryRate = BigInt.zero();
    let deliverEvent = createDeliverEventNative(
      TEST_MECH,
      TEST_REQUEST_ID_7,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNative(deliverEvent);

    assert.fieldEquals("Request", TEST_REQUEST_ID_7.toHexString(), "finalFeeUSD", "0");
    assert.fieldEquals("Sender", TEST_REQUESTER.toHexString(), "totalFeesPaidUSD", "0");
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", "0");
  });

  test("should_handle_very_large_fee_without_overflow", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(7);
    let largeRate = BigInt.fromString("1000000000000000000000000"); // 1,000,000 xDAI
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE),
      largeRate
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_8],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNative(TEST_MECH, TEST_REQUEST_ID_8, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNative(requestEvent);

    let deliveryRate = largeRate;
    let deliverEvent = createDeliverEventNative(
      TEST_MECH,
      TEST_REQUEST_ID_8,
      TEST_MECH_SERVICE_MULTISIG,
      deliveryRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNative(deliverEvent);

    let expectedUsd = convertGnosisNativeWeiToUsd(deliveryRate);
    assert.fieldEquals("Request", TEST_REQUEST_ID_8.toHexString(), "finalFeeUSD", expectedUsd.toString());
    assert.assertTrue(expectedUsd.equals(BigDecimal.fromString("1000000")));
  });

  test("should_not_update_fees_for_offchain_signed_delivery", () => {
    initNetworkBase();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(8);
    let deliveryRate = BigInt.fromString("1000000000000000000"); // 1 ETH
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(BASE_MECH_FACTORY_FIXED_PRICE_NATIVE),
      deliveryRate
    );

    let ethPrice = BigInt.fromString('250000000000'); // $2500 with 8 decimals
    createMockedFunction(
      Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD),
      'latestRoundData',
      'latestRoundData():(uint80,int256,uint256,uint256,uint80)'
    ).returns([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
      ethereum.Value.fromSignedBigInt(ethPrice),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
    ]);

    let deliverEvent = createDeliverWithSignaturesV2Event(
      TEST_MECH,
      TEST_MECH_SERVICE_MULTISIG,
      TEST_REQUEST_ID_9,
      deliveryRate,
      TEST_DATA,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_REQUESTER;
    handleDeliverWithSignaturesV2(deliverEvent);

    // Off-chain deliveries should NOT update fee tracking - Global remains at 0
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", "0");
    // Sender entity should not be created for off-chain deliveries (no on-chain request)
    assert.notInStore("Sender", TEST_REQUESTER.toHexString());
  });

  test("should_accumulate_sender_totals_across_multiple_deliveries", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(9);
    let lockedRate = BigInt.fromString("500000000000000000"); // 0.5 xDAI
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE),
      lockedRate
    );

    let requestIds = [TEST_REQUEST_ID_1, TEST_REQUEST_ID_2, TEST_REQUEST_ID_3];

    for (let i = 0; i < requestIds.length; i++) {
      let marketplaceEvent = createMarketplaceRequestEvent(
        TEST_MECH,
        TEST_REQUESTER,
        [requestIds[i]],
        [TEST_DATA]
      );
      handleMarketplaceRequest(marketplaceEvent);

      let requestEvent = createRequestEventNative(TEST_MECH, requestIds[i], TEST_DATA);
      requestEvent.transaction.from = TEST_REQUESTER;
      handleRequestNative(requestEvent);

      let deliverEvent = createDeliverEventNative(
        TEST_MECH,
        requestIds[i],
        TEST_MECH_SERVICE_MULTISIG,
        lockedRate,
        TEST_DATA
      );
      deliverEvent.transaction.from = TEST_MECH;
      deliverEvent.logIndex = BigInt.fromI32(i);
      handleDeliverNative(deliverEvent);
    }

    let expectedPerRequest = convertGnosisNativeWeiToUsd(lockedRate);
    let expectedTotal = expectedPerRequest.times(BigDecimal.fromString("3"));

    assert.fieldEquals("Sender", TEST_REQUESTER.toHexString(), "totalFeesPaidUSD", expectedTotal.toString());
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", expectedTotal.toString());
  });

  test("should_preserve_decimal_precision_in_usd_conversion", () => {
    initNetworkGnosis();
    ensureGlobalExists();

    let serviceId = BigInt.fromI32(10);
    let lockedRate = BigInt.fromString("123456789012345678"); // 0.123456789012345678 xDAI
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE),
      lockedRate
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_A],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNative(TEST_MECH, TEST_REQUEST_ID_A, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNative(requestEvent);

    let deliverEvent = createDeliverEventNative(
      TEST_MECH,
      TEST_REQUEST_ID_A,
      TEST_MECH_SERVICE_MULTISIG,
      lockedRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNative(deliverEvent);

    let expectedUsd = convertGnosisNativeWeiToUsd(lockedRate);
    assert.fieldEquals("Request", TEST_REQUEST_ID_A.toHexString(), "finalFeeUSD", expectedUsd.toString());
    assert.assertTrue(expectedUsd.toString().includes("0.123456789012345678"));
  });

  test("should_return_zero_usd_when_chainlink_price_feed_reverts", () => {
    initNetworkBase();
    ensureGlobalExists();

    createMockedFunction(
      Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD),
      'latestRoundData',
      'latestRoundData():(uint80,int256,uint256,uint256,uint80)'
    ).reverts();

    let serviceId = BigInt.fromI32(11);
    let lockedRate = BigInt.fromString("1000000000000000000"); // 1 ETH
    createService(serviceId, TEST_MECH_SERVICE_MULTISIG);
    createMechWithMapping(
      TEST_MECH,
      serviceId,
      Address.fromString(BASE_MECH_FACTORY_FIXED_PRICE_NATIVE),
      lockedRate
    );

    let marketplaceEvent = createMarketplaceRequestEvent(
      TEST_MECH,
      TEST_REQUESTER,
      [TEST_REQUEST_ID_7],
      [TEST_DATA]
    );
    handleMarketplaceRequest(marketplaceEvent);

    let requestEvent = createRequestEventNative(TEST_MECH, TEST_REQUEST_ID_7, TEST_DATA);
    requestEvent.transaction.from = TEST_REQUESTER;
    handleRequestNative(requestEvent);

    let deliverEvent = createDeliverEventNative(
      TEST_MECH,
      TEST_REQUEST_ID_7,
      TEST_MECH_SERVICE_MULTISIG,
      lockedRate,
      TEST_DATA
    );
    deliverEvent.transaction.from = TEST_MECH;
    handleDeliverNative(deliverEvent);

    assert.fieldEquals("Request", TEST_REQUEST_ID_7.toHexString(), "finalFeeUSD", "0");
    assert.fieldEquals("Global", "", "totalFeesPaidUSD", "0");
  });
});
