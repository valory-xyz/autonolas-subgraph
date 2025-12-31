import {
  assert,
  describe,
  test,
  afterEach,
  clearStore,
  dataSourceMock,
} from "matchstick-as/assembly/index";
import { Address, BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts";

import {
  getFeeUnitFromMechFactory,
  convertGnosisNativeWeiToUsd,
  calculateGnosisNvmCreditsToUsd,
  calculateBaseNvmCreditsToUsd,
  FEE_UNIT_NATIVE,
  FEE_UNIT_TOKEN,
  FEE_UNIT_CREDITS,
} from "../../src/marketplace/fee-utils";

import {
  GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN,
  GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_TOKEN,
  BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC,
} from "../../src/marketplace/constants";

describe("getFeeUnitFromMechFactory", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("Returns NATIVE for Gnosis fixed price native factory", () => {
    let factory = Bytes.fromHexString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE);
    let result = getFeeUnitFromMechFactory(factory);
    assert.stringEquals(result, FEE_UNIT_NATIVE);
  });

  test("Returns NATIVE for Base fixed price native factory", () => {
    let factory = Bytes.fromHexString(BASE_MECH_FACTORY_FIXED_PRICE_NATIVE);
    let result = getFeeUnitFromMechFactory(factory);
    assert.stringEquals(result, FEE_UNIT_NATIVE);
  });

  test("Returns TOKEN for Gnosis fixed price token factory", () => {
    let factory = Bytes.fromHexString(GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN);
    let result = getFeeUnitFromMechFactory(factory);
    assert.stringEquals(result, FEE_UNIT_TOKEN);
  });

  test("Returns TOKEN for Base fixed price token factory", () => {
    let factory = Bytes.fromHexString(BASE_MECH_FACTORY_FIXED_PRICE_TOKEN);
    let result = getFeeUnitFromMechFactory(factory);
    assert.stringEquals(result, FEE_UNIT_TOKEN);
  });

  test("Returns CREDITS for Gnosis NVM subscription native factory", () => {
    let factory = Bytes.fromHexString(GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE);
    let result = getFeeUnitFromMechFactory(factory);
    assert.stringEquals(result, FEE_UNIT_CREDITS);
  });

  test("Returns CREDITS for Base NVM subscription USDC factory", () => {
    let factory = Bytes.fromHexString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC);
    let result = getFeeUnitFromMechFactory(factory);
    assert.stringEquals(result, FEE_UNIT_CREDITS);
  });

  test("Returns NATIVE for unknown factory (fallback)", () => {
    let factory = Bytes.fromHexString("0x1234567890123456789012345678901234567890");
    let result = getFeeUnitFromMechFactory(factory);
    assert.stringEquals(result, FEE_UNIT_NATIVE);
  });
});

describe("convertGnosisNativeWeiToUsd", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("1e18 wei = 1 USD", () => {
    let oneEth = BigInt.fromString("1000000000000000000"); // 1e18
    let result = convertGnosisNativeWeiToUsd(oneEth);
    assert.stringEquals(result.toString(), "1");
  });

  test("0 wei = 0 USD", () => {
    let zero = BigInt.zero();
    let result = convertGnosisNativeWeiToUsd(zero);
    assert.stringEquals(result.toString(), "0");
  });

  test("0.5e18 wei = 0.5 USD", () => {
    let halfEth = BigInt.fromString("500000000000000000"); // 0.5e18
    let result = convertGnosisNativeWeiToUsd(halfEth);
    assert.stringEquals(result.toString(), "0.5");
  });
});

describe("calculateGnosisNvmCreditsToUsd", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("Credits conversion with TOKEN_RATIO_GNOSIS", () => {
    let credits = BigInt.fromI32(1000000);
    let result = calculateGnosisNvmCreditsToUsd(credits);
    // Result should be non-zero due to TOKEN_RATIO_GNOSIS multiplication
    assert.assertTrue(!result.equals(BigDecimal.fromString("0")));
  });

  test("0 credits = 0 USD", () => {
    let zero = BigInt.zero();
    let result = calculateGnosisNvmCreditsToUsd(zero);
    assert.stringEquals(result.toString(), "0");
  });
});

describe("calculateBaseNvmCreditsToUsd", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("Credits conversion with TOKEN_RATIO_BASE", () => {
    let credits = BigInt.fromI32(1000000);
    let result = calculateBaseNvmCreditsToUsd(credits);
    // Result should be non-zero due to TOKEN_RATIO_BASE multiplication
    assert.assertTrue(!result.equals(BigDecimal.fromString("0")));
  });

  test("0 credits = 0 USD", () => {
    let zero = BigInt.zero();
    let result = calculateBaseNvmCreditsToUsd(zero);
    assert.stringEquals(result.toString(), "0");
  });

  test("Large credits value", () => {
    let largeCredits = BigInt.fromString("1000000000000000000"); // 1e18
    let result = calculateBaseNvmCreditsToUsd(largeCredits);
    // Should produce a reasonable USD value
    assert.assertTrue(!result.equals(BigDecimal.fromString("0")));
  });
});

