import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAINS, assertChainConfig, assertPortalDataset } from "../src/constants";
import { FACTORY_EVENTS, decodeFactoryLog, marketplaceTopics } from "../src/decode";
import * as v2 from "../src/abi/MechMarketplaceV2/events";
import * as mechAbi from "../src/abi/MechFixedPriceNative/events";
import { convertFeeToUsd, NO_OLAS_POOL } from "../src/fee";

const POLYGON = CHAINS.polygon;
const MECH = "0x00000000000000000000000000000000000000aa";
const SAFE = "0x00000000000000000000000000000000000000bb";
const POL_USD = { usdAt: async (_block: bigint) => ({ answer: 25_000_000n, decimals: 8 }) };

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MARKETPLACE_CHAIN", "polygon");
  vi.stubEnv("INGEST_SOURCE", "portal");
  vi.stubEnv("SQD_PORTAL_URL", POLYGON.portalDataset);
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Polygon source coverage", () => {
  it("selects Polygon and matches every contract, factory event and start block in the Graph manifest", async () => {
    const { CHAIN } = await import("../src/constants");
    expect(CHAIN.chainId).toBe(137);
    expect(CHAIN.startBlock).toBe(41_783_952);

    // Read the independent source manifest so changes cannot silently drop
    // historical factories or shift one of the source ranges during the port.
    const manifest = readFileSync(new URL("../../../subgraphs/marketplace/subgraph.polygon.yaml", import.meta.url), "utf8");
    const sources = manifest.split("\ntemplates:")[0].split(/^  - kind: ethereum\s*$/m).slice(1);
    expect(sources).toHaveLength(10);
    const contracts = new Map([
      ["ServiceRegistryL2", CHAIN.serviceRegistryL2],
      ["ComplementaryServiceMetadata", CHAIN.complementaryServiceMetadata!],
      ["Karma", CHAIN.karma],
      ["MechMarketplaceV2", CHAIN.mechMarketplace],
    ]);
    for (const source of sources) {
      const name = source.match(/^    name: (\S+)/m)![1];
      const address = source.match(/^      address: "([^"]+)"/m)![1].toLowerCase();
      const startBlock = Number(source.match(/^      startBlock: (\d+)/m)![1]);
      if (name.startsWith("MechFactory")) {
        const factory = CHAIN.mechFactories.find((f) => f.address === address);
        expect(factory, name).toBeDefined();
        expect(factory!.startBlock).toBe(startBlock);
        expect(factory!.event).toBe(source.match(/- event: (CreateMech\w+)\(/)![1]);
      } else {
        expect(contracts.get(name), name).toEqual({ address, startBlock });
      }
    }
    const pricing = readFileSync(new URL("../../../subgraphs/marketplace/src/marketplace/constants.ts", import.meta.url), "utf8");
    expect(CHAIN.nativeUsdFeed).toBe(pricing.match(/CHAINLINK_PRICE_FEED_ADDRESS_POLYGON_POL_USD = '([^']+)'/)![1].toLowerCase());
    expect(CHAIN.mechFactories.map((f) => f.feeUnit)).toEqual(["NATIVE", "TOKEN", "USDC", "CREDITS", "NATIVE", "USDC"]);
  });

  it("subscribes to one V2 era, all four factories, and advertised-rate updates", async () => {
    const { LOG_QUERIES } = await import("../src/processor");
    const marketplace = LOG_QUERIES.filter((q) => q.where.address?.includes(POLYGON.mechMarketplace.address));
    expect(marketplace).toHaveLength(1);
    expect(marketplace[0].range).toEqual({ from: 81_028_558 });
    expect(marketplace[0].where.topic0).toEqual(marketplaceTopics(v2));
    const factories = LOG_QUERIES.find((q) => q.where.address?.includes(POLYGON.mechFactories[0].address))!;
    expect(factories.where.address).toEqual(POLYGON.mechFactories.map((f) => f.address));
    expect(factories.where.topic0).toEqual([...new Set(POLYGON.mechFactories.map((f) => FACTORY_EVENTS[f.event as keyof typeof FACTORY_EVENTS].topic))]);
    const mechs = LOG_QUERIES.find((q) => q.where.address == null)!;
    expect(mechs.where.topic0).toContain(mechAbi.MaxDeliveryRateUpdated.topic);
    for (const factory of POLYGON.mechFactories) {
      const ev = FACTORY_EVENTS[factory.event as keyof typeof FACTORY_EVENTS];
      expect(decodeFactoryLog(ev.encode({ mech: MECH, serviceId: 1n, maxDeliveryRate: 120n })))
        .toEqual({ mech: MECH, serviceId: 1n, maxDeliveryRate: 120n });
    }
  });

  it("requires the Polygon dataset and explicit historical pricing gaps", () => {
    expect(() => assertPortalDataset(POLYGON.portalDataset, POLYGON)).not.toThrow();
    expect(() => assertPortalDataset(CHAINS.base.portalDataset, POLYGON)).toThrow(/needs "polygon-mainnet"/);
    expect(() => assertChainConfig(POLYGON)).not.toThrow();
    expect(() => assertChainConfig({ ...POLYGON, unpricedFeeUnits: [] })).toThrow(/TOKEN/);
    expect(() => assertChainConfig({ ...POLYGON, nativeUsdFeed: null })).toThrow(/NATIVE/);
    expect(() => assertChainConfig({ ...CHAINS.base, olasPool: null })).toThrow(/TOKEN/);
  });
});

describe("Polygon pricing", () => {
  it("prices POL at the event block and USDC at six decimals", async () => {
    const seen: bigint[] = [];
    const price = { usdAt: async (b: bigint) => { seen.push(b); return POL_USD.usdAt(b); } };
    const sources = { price, olasPool: NO_OLAS_POOL, log: { warn: vi.fn() } };
    expect((await convertFeeToUsd(2n * 10n ** 18n, "NATIVE", 82_000_000n, sources, POLYGON)).toFixed()).toBe("0.5");
    expect(seen).toEqual([82_000_000n]);
    expect((await convertFeeToUsd(1_500_000n, "USDC", 82_000_000n, sources, POLYGON)).toFixed()).toBe("1.5");
    expect(sources.log.warn).not.toHaveBeenCalled();
  });

  it("retains the Graph's zero-USD gaps for historical OLAS and NVM fees", async () => {
    const log = { warn: vi.fn() };
    const sources = { price: POL_USD, olasPool: NO_OLAS_POOL, log };
    for (const unit of ["TOKEN", "CREDITS"] as const) {
      expect((await convertFeeToUsd(123n, unit, 82_000_000n, sources, POLYGON)).toFixed()).toBe("0");
    }
    expect(log.warn).not.toHaveBeenCalled();
    const unexpected = { ...POLYGON, unpricedFeeUnits: [] };
    for (const unit of ["TOKEN", "CREDITS"] as const) {
      await convertFeeToUsd(123n, unit, 82_000_000n, sources, unexpected);
    }
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});

async function setup(unit: "NATIVE" | "USDC") {
  const h = await import("../src/handlers");
  const models = await import("../src/model");
  const { InMemoryCache, meta, rid } = await import("./inMemoryCache");
  const cache = new InMemoryCache();
  const ctx = { cache, log: cache.log, price: POL_USD, olasPool: NO_OLAS_POOL, ...h.newBatchState() };
  const event = () => meta({ blockNumber: 82_000_000n, address: MECH, txFrom: SAFE, txTo: POLYGON.mechMarketplace.address });
  const scale = unit === "NATIVE" ? 10n ** 18n : 10n ** 6n;
  const factory = POLYGON.mechFactories.find((f) => f.feeUnit === unit)!;
  await h.handleCreateService(ctx, event(), { serviceId: 1n, configHash: rid(0) });
  await h.handleCreateMultisigWithAgents(ctx, event(), { serviceId: 1n, multisig: SAFE });
  const creation = event();
  h.handleMechFactoryCreate(ctx, creation, { mech: MECH, serviceId: 1n, maxDeliveryRate: 120n * scale });
  await h.handleCreateMech(ctx, { ...creation, logIndex: 1 }, { mech: MECH, serviceId: 1n, mechFactory: factory.address });
  return { h, models, cache, ctx, event, rid, scale, factory };
}

describe("Polygon dynamic-price handlers", () => {
  it.each(["NATIVE", "USDC"] as const)("%s preserves the advertised maximum and aggregates the actual on-chain charge once", async (unit) => {
    const { h, models: m, cache, ctx, event, rid, scale } = await setup(unit);
    await h.handleMarketplaceRequest(ctx, event(), {
      priorityMech: MECH, requester: SAFE, numRequests: 1n, requestIds: [rid(1)],
    });
    const request = (await cache.get(m.Request, rid(1)))!;
    expect(request.feeUnit).toBe(unit);
    expect(request.feeUSD!.toFixed()).toBe(unit === "NATIVE" ? "30" : "120");
    const delivery = event();
    const args = { mechServiceMultisig: SAFE, requestId: rid(1), deliveryRate: 100n * scale, data: rid(2) };
    await h.handleMechDeliver(ctx, delivery, args);
    await h.handleMechDeliver(ctx, delivery, args);
    const actual = unit === "NATIVE" ? "25" : "100";
    expect((await cache.get(m.Request, rid(1)))!.finalFeeUSD!.toFixed()).toBe(actual);
    expect((await cache.get(m.Global, ""))!.totalFeesPaidUSD.toFixed()).toBe(actual);
    expect((await cache.get(m.Sender, SAFE))!.totalFeesPaidUSD.toFixed()).toBe(actual);
    expect((await cache.get(m.Mech, "1"))!.maxDeliveryRate).toBe(120n * scale);
    expect(cache.warnings).toEqual([]);
  });

  it.each(["NATIVE", "USDC"] as const)("%s records mixed zero/nonzero signed charges without overwriting the advertised rate", async (unit) => {
    const { h, models: m, cache, ctx, event, rid, scale } = await setup(unit);
    await h.handleMaxDeliveryRateUpdated(ctx, event(), { maxDeliveryRate: 150n * scale });
    const delivery = event();
    for (const [i, rate] of [0n, 100n * scale].entries()) {
      await h.handleDeliverWithSignatures(ctx, { ...delivery, address: POLYGON.mechMarketplace.address, logIndex: i }, {
        mech: MECH, mechServiceMultisig: SAFE, requestId: rid(i + 1), deliveryRate: rate, deliveryData: rid(3),
      });
    }
    await h.handleMarketplaceDeliveryWithSignatures(ctx, { ...delivery, address: POLYGON.mechMarketplace.address, logIndex: 2 }, {
      deliveryMech: MECH, requester: SAFE, numDeliveries: 2n, requestIds: [rid(1), rid(2)],
    });
    expect(cache.all(m.DeliverForMarketplace).map((row) => row.deliveryRate)).toEqual([0n, 100n * scale]);
    expect((await cache.get(m.Mech, "1"))!.maxDeliveryRate).toBe(150n * scale);
    expect((await cache.get(m.Global, ""))!.totalOffChainRequests).toBe(2n);
    // Signed-only deliveries have raw charges but no on-chain Request USD total.
    expect(cache.count(m.Request)).toBe(0);
    expect((await cache.get(m.Global, ""))!.totalFeesPaidUSD.toFixed()).toBe("0");
  });
});
