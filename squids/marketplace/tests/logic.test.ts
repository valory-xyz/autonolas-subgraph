import { describe, expect, it } from "vitest";
import {
  eventId,
  factoryConfig,
  getFeeUnitFromFactory,
  getPaymentTypeFromFactory,
  isIpfsPayload,
  isMarketplaceTransaction,
  pushUnique,
  signedDeliverId,
} from "../src/logic";
import {
  CHAIN,
  PAYMENT_TYPE_FIXED_PRICE_NATIVE,
  PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC,
} from "../src/constants";
import { FACTORY_NATIVE, FACTORY_USDC, MARKETPLACE } from "./inMemoryCache";

describe("chain table (robinhood)", () => {
  it("selects robinhood by default and keeps every address lowercase", () => {
    expect(CHAIN.name).toBe("robinhood");
    expect(CHAIN.chainId).toBe(4663);
    const addrs = [
      CHAIN.serviceRegistryL2.address,
      CHAIN.karma.address,
      CHAIN.mechMarketplace.address,
      CHAIN.complementaryServiceMetadata!.address,
      CHAIN.nativeUsdFeed!,
      ...CHAIN.mechFactories.map((f) => f.address),
    ];
    for (const a of addrs) {
      expect(a).toMatch(/^0x[0-9a-f]{40}$/);
    }
    // START_BLOCK must not postdate any tracked source.
    for (const b of [
      CHAIN.serviceRegistryL2.startBlock,
      CHAIN.karma.startBlock,
      CHAIN.mechMarketplace.startBlock,
      CHAIN.complementaryServiceMetadata!.startBlock,
      ...CHAIN.mechFactories.map((f) => f.startBlock),
    ]) {
      expect(b).toBeGreaterThanOrEqual(CHAIN.startBlock);
    }
  });

  it("maps the two Robinhood factories to their on-chain payment types", () => {
    expect(getPaymentTypeFromFactory(FACTORY_NATIVE)).toBe(PAYMENT_TYPE_FIXED_PRICE_NATIVE);
    // The USDG factory is a FixedPriceTokenUSDC deployment (verified against
    // mapPaymentTypeBalanceTrackers on the proxy) even though it emits the
    // plain CreateMechFixedPriceToken event.
    expect(getPaymentTypeFromFactory(FACTORY_USDC)).toBe(PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
    expect(getFeeUnitFromFactory(FACTORY_NATIVE)).toBe("NATIVE");
    expect(getFeeUnitFromFactory(FACTORY_USDC)).toBe("USDC");
    expect(factoryConfig(FACTORY_USDC)?.event).toBe("CreateMechFixedPriceToken");
  });

  it("is case-insensitive on lookup and throws on an unknown factory", () => {
    expect(getPaymentTypeFromFactory(FACTORY_NATIVE.toUpperCase().replace("0X", "0x"))).toBe(
      PAYMENT_TYPE_FIXED_PRICE_NATIVE
    );
    expect(() => getPaymentTypeFromFactory("0x" + "1".repeat(40))).toThrow(/Unknown mech factory/);
    expect(getFeeUnitFromFactory("0x" + "1".repeat(40))).toBeNull();
  });
});

describe("classification and ids", () => {
  it("classifies a tx by its outermost `to`", () => {
    expect(isMarketplaceTransaction(MARKETPLACE)).toBe(true);
    expect(isMarketplaceTransaction(MARKETPLACE.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(isMarketplaceTransaction("0x" + "2".repeat(40))).toBe(false);
    expect(isMarketplaceTransaction(null)).toBe(false);
  });

  it("accepts exactly 32-byte payloads as IPFS digests", () => {
    expect(isIpfsPayload("0x" + "ab".repeat(32))).toBe(true);
    expect(isIpfsPayload("0x" + "ab".repeat(31))).toBe(false);
    expect(isIpfsPayload("0x")).toBe(false);
    expect(isIpfsPayload("0x" + "ab".repeat(64))).toBe(false);
  });

  it("builds ids", () => {
    expect(eventId("0xabc", 7)).toBe("0xabc-7");
    expect(signedDeliverId("0xabc", "0xreq")).toBe("0xabc-0xreq");
    expect(pushUnique(["a"], "a")).toEqual(["a"]);
    expect(pushUnique(["a"], "b")).toEqual(["a", "b"]);
  });
});
