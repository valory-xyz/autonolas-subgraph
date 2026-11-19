import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import deployment from "./fixtures/marketplace-factories-946eade.json";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

const cases = (["base", "polygon", "robinhood"] as const).flatMap((chain) => [
  { chain, factory: deployment.chains[chain].mechFactoryFixedPriceNativeAddress.toLowerCase(), event: "CreateMechFixedPriceNative", unit: "NATIVE", rate: 10n ** 18n, usd: "2000" },
  { chain, factory: deployment.chains[chain].mechFactoryFixedPriceTokenUSDCAddress.toLowerCase(), event: "CreateMechFixedPriceToken", unit: "USDC", rate: 1_000_000n, usd: "1" },
]);

describe("pinned replacement factories", () => {
  it.each(["base", "polygon", "robinhood"] as const)("%s covers every factory in the pinned deployment globals", async (chain) => {
    vi.stubEnv("MARKETPLACE_CHAIN", chain);
    const { CHAIN } = await import("../src/constants");
    const addresses = CHAIN.mechFactories.map((factory) => factory.address);
    for (const address of Object.values(deployment.chains[chain])) {
      expect(addresses).toContain(address.toLowerCase());
    }
  });

  it.each(cases)("$chain $unit: subscription, decoder, CreateMech and request pricing", async ({ chain, factory, event, unit, rate, usd }) => {
    vi.stubEnv("MARKETPLACE_CHAIN", chain);
    vi.stubEnv("INGEST_SOURCE", "portal");
    vi.stubEnv("SQD_PORTAL_URL", `https://portal.sqd.dev/datasets/${chain === "polygon" ? "polygon-mainnet" : chain === "base" ? "base-mainnet" : "robinhood-mainnet"}`);
    vi.stubEnv("SQD_PORTAL_API_KEY", "");
    const { CHAIN } = await import("../src/constants");
    const { LOG_QUERIES } = await import("../src/processor");
    const { factoryEvent, decodeFactoryLog } = await import("../src/decode");
    const { getPaymentTypeFromFactory, getFeeUnitFromFactory } = await import("../src/logic");
    const h = await import("../src/handlers");
    const models = await import("../src/model");
    const { InMemoryCache } = await import("./inMemoryCache");
    const config = CHAIN.mechFactories.find((entry) => entry.address === factory)!;
    expect(config.event).toBe(event);
    expect(getFeeUnitFromFactory(factory)).toBe(unit);
    expect(getPaymentTypeFromFactory(factory)).toBe(config.paymentType);
    const args = { mech: "0x" + "ab".repeat(20), serviceId: 42n, maxDeliveryRate: rate };
    const log = factoryEvent(event).encode(args);
    expect(LOG_QUERIES.some((query) => query.where.address?.includes(factory) && query.where.topic0?.includes(log.topics[0]))).toBe(true);
    const decoded = decodeFactoryLog(log)!;
    expect(decoded).toEqual(args);
    const cache = new InMemoryCache();
    const ctx = { cache, log: cache.log, price: { usdAt: async () => ({ answer: 200_000_000_000n, decimals: 8 }) }, olasPool: { balancesAt: async () => null }, ...h.newBatchState() };
    const meta = { blockNumber: 59_560_893n, blockTimestamp: 1_795_103_873n, txHash: "0x" + "12".repeat(32), logIndex: 0, address: factory, txFrom: args.mech, txTo: CHAIN.mechMarketplace.address };
    h.handleMechFactoryCreate(ctx, meta, decoded);
    await h.handleCreateMech(ctx, { ...meta, address: CHAIN.mechMarketplace.address, logIndex: 1 }, { mech: args.mech, serviceId: args.serviceId, mechFactory: factory });
    const mech = (await cache.get(models.Mech, "42"))!;
    expect(mech.paymentType).toBe(config.paymentType);
    expect(mech.maxDeliveryRate).toBe(rate);
    expect(mech.maxDeliveryRateUSD!.toFixed()).toBe(usd);
    const requestId = "0x" + "34".repeat(32);
    await h.handleMarketplaceRequest(ctx, { ...meta, logIndex: 2 }, { priorityMech: args.mech, requester: args.mech, numRequests: 1n, requestIds: [requestId] });
    const request = (await cache.get(models.Request, requestId))!;
    expect(request.feeUnit).toBe(unit);
    expect(request.feeRaw).toBe(rate);
    expect(request.feeUSD!.toFixed()).toBe(usd);
  }, 60_000);
});
