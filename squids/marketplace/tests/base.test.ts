// MARKETPLACE_CHAIN=base against the Base marketplace subgraph
// (subgraphs/marketplace/subgraph.base.yaml + src/marketplace/*): the chain
// table, the V1/V2 ABI split at 33,907,400, the five factories, the
// subscription set, and the fee conversions — CREDITS (NVM) at
// feeRaw × 0.99 / 1e6, NATIVE via Chainlink, TOKEN via the OLAS/USDC pool —
// in graph-node's 34-digit BigDecimal arithmetic. Expected numbers are the
// live Base subgraph's where one exists (quoted in the test name).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BigDecimal } from "@subsquid/big-decimal";
import * as v1 from "../src/abi/MechMarketplaceV1/events";
import * as v2 from "../src/abi/MechMarketplaceV2/events";
import * as mechAbi from "../src/abi/MechFixedPriceNative/events";
import { CHAINS } from "../src/constants";
import {
  FACTORY_EVENTS,
  decodeFactoryLog,
  decodeMarketplaceLog,
  marketplaceAbiAt,
} from "../src/decode";
import { convertFeeToUsd, gn, gnPlus, nativeToUsd, nvmCreditsToUsd, olasToUsd } from "../src/fee";

const BASE = CHAINS.base;
const V1_END = 33_907_400;
const warnings: string[] = [];
const log = { warn: (m: string) => warnings.push(m) };
const pad = (a: string) => "0x" + a.slice(2).padStart(64, "0");
const NO_PRICE = { usdAt: async () => null };

beforeEach(() => {
  warnings.length = 0;
  vi.resetModules();
});
afterEach(() => vi.unstubAllEnvs());

describe("Base chain table", () => {
  it("MARKETPLACE_CHAIN=base starts at 10,827,380 with the subgraph's addresses", async () => {
    vi.stubEnv("MARKETPLACE_CHAIN", "base");
    const c = await import("../src/constants");
    expect(c.CHAIN.name).toBe("base");
    expect(c.CHAIN.chainId).toBe(8453);
    expect(c.START_BLOCK).toBe(10_827_380);
    expect(c.SERVICE_REGISTRY_L2).toBe("0x3c1ff68f5aa342d296d4dee4bb1cacca912d95fe");
    expect(c.MECH_MARKETPLACE).toBe("0xf24ee42eda0fc9b33b7d41b06ee8ccd2ef7c5020");
    expect(c.KARMA).toBe("0x1f84f8f70de0651c2d51bf8850fe9d0289ba3b3a");
    expect(c.COMPLEMENTARY_SERVICE_METADATA).toBe("0x28c1edc7ced549f7f80b732fdc19f0370160707d");
    expect(c.CHAIN.mechMarketplace.startBlock).toBe(26_642_705);
    expect(c.CHAIN.mechMarketplaceV1EndBlock).toBe(V1_END);
    expect(c.CHAIN.nativeUsdFeed).toBe("0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70");
    expect(c.CHAIN.handlesMaxDeliveryRateUpdated).toBe(false);
    expect(c.MECH_FACTORY_ADDRESSES).toEqual([
      "0x2e008211f34b25a7d7c102403c6c2c3b665a1abe",
      "0x97371b1c0cda1d04dfc43dfb50a04645b7bc9bee",
      "0x5b70a66fe68c4c86ffd724b58cc56049c70e9d3d",
      "0x847bbe8b474e0820215f818858e23f5f5591855a",
      "0x7bed01f8482ff686f025628e7780ca6c1f0559fc",
    ]);
    expect(c.CHAIN.mechFactories.map((f) => f.feeUnit)).toEqual([
      "NATIVE",
      "TOKEN",
      "USDC",
      "CREDITS",
      "CREDITS",
    ]);
  });

  it("every address in the table is lowercase (SQD compares with ===)", () => {
    const all = JSON.stringify(BASE).match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)!;
    expect(all.length).toBeGreaterThan(10);
    for (const a of all) expect(a).toBe(a.toLowerCase());
  });

  it("robinhood stays the default", async () => {
    vi.stubEnv("MARKETPLACE_CHAIN", undefined);
    const c = await import("../src/constants");
    expect(c.CHAIN.name).toBe("robinhood");
    expect(c.CHAIN.mechMarketplaceV1EndBlock).toBeNull();
    expect(c.CHAIN.handlesMaxDeliveryRateUpdated).toBe(true);
  });
});

describe("portal dataset guard", () => {
  it("accepts the chain's dataset on any host and rejects another chain's", async () => {
    const { assertPortalDataset } = await import("../src/constants");
    assertPortalDataset("https://portal.sqd.dev/datasets/base-mainnet", BASE);
    assertPortalDataset("https://shared.portal.sqd.dev/datasets/base-mainnet/", BASE);
    expect(() => assertPortalDataset("https://portal.sqd.dev/datasets/robinhood-mainnet", BASE)).toThrow(
      /serves dataset "robinhood-mainnet", but MARKETPLACE_CHAIN="base" needs "base-mainnet"/
    );
    expect(() => assertPortalDataset("", BASE)).toThrow(/"\(none\)"/);
  });

  it("refuses to build the portal source for a mismatched URL", async () => {
    vi.stubEnv("MARKETPLACE_CHAIN", "base");
    vi.stubEnv("INGEST_SOURCE", "portal");
    vi.stubEnv("SQD_PORTAL_URL", "https://portal.sqd.dev/datasets/robinhood-mainnet");
    await expect(import("../src/processor")).rejects.toThrow(/needs "base-mainnet"/);
  }, 60_000);
});

describe("Base subscriptions (processor.ts)", () => {
  it("V1 topics up to 33,907,400, V2 from 33,907,401, five factory topics, no MaxDeliveryRateUpdated", async () => {
    vi.stubEnv("MARKETPLACE_CHAIN", "base");
    vi.stubEnv("SQD_PORTAL_API_KEY", "");
    vi.stubEnv("INGEST_SOURCE", "portal");
    const { LOG_QUERIES } = await import("../src/processor");
    const mp = LOG_QUERIES.filter((q) =>
      q.where?.address?.includes("0xf24ee42eda0fc9b33b7d41b06ee8ccd2ef7c5020")
    );
    expect(mp).toHaveLength(2);
    expect(mp[0].range).toEqual({ from: 26_642_705, to: V1_END });
    expect(mp[0].where!.topic0).toEqual([
      v1.CreateMech.topic,
      v1.MarketplaceRequest.topic,
      v1.MarketplaceDelivery.topic,
      v1.MarketplaceDeliveryWithSignatures.topic,
      v1.Deliver.topic,
    ]);
    expect(mp[1].range).toEqual({ from: V1_END + 1 });
    expect(mp[1].where!.topic0).toContain(v2.MarketplaceRequest.topic);
    expect(mp[1].where!.topic0).toContain(v2.Deliver.topic);

    const factories = LOG_QUERIES.find((q) => q.where?.address?.includes("0x7bed01f8482ff686f025628e7780ca6c1f0559fc"))!;
    expect(new Set(factories.where!.topic0)).toEqual(
      new Set(Object.values(FACTORY_EVENTS).map((e) => e.topic))
    );

    const mechQuery = LOG_QUERIES.find((q) => q.where?.address == null)!;
    expect(mechQuery.where!.topic0).toEqual([mechAbi.Request.topic, mechAbi.Deliver.topic]);
  }, 60_000); // the SDK import alone takes several seconds
});

describe("V1 / V2 marketplace decoding by block", () => {
  const MECH = "0x723f6a7fc401a8d2eade269b5c65643b9ad3719f";
  const REQUESTER = "0x00000000000000000000000000000000000000e0";
  const RID = "0x" + "ab".repeat(32);

  it("picks V1 through 33,907,400 and V2 from 33,907,401", () => {
    expect(marketplaceAbiAt(26_642_705, V1_END)).toBe(v1);
    expect(marketplaceAbiAt(V1_END, V1_END)).toBe(v1);
    expect(marketplaceAbiAt(V1_END + 1, V1_END)).toBe(v2);
    expect(marketplaceAbiAt(1, null)).toBe(v2);
  });

  it("decodes V1 MarketplaceRequest (no requestDatas)", () => {
    const l = v1.MarketplaceRequest.encode({
      priorityMech: MECH,
      requester: REQUESTER,
      numRequests: 1n,
      requestIds: [RID],
    });
    expect(decodeMarketplaceLog(l, 27_000_000, V1_END)).toEqual({
      kind: "MarketplaceRequest",
      priorityMech: MECH,
      requester: REQUESTER,
      numRequests: 1n,
      requestIds: [RID],
    });
    // The V1 topic is not a V2 event: after the switch it is ignored, as
    // the subgraph's V1 data source has ended.
    expect(decodeMarketplaceLog(l, V1_END + 1, V1_END)).toBeNull();
  });

  it("decodes V1 MarketplaceDelivery with the indexed requesters topic (same topic0 as V2)", () => {
    const l = v1.MarketplaceDelivery.encode({
      deliveryMech: MECH,
      requesters: [REQUESTER] as any,
      numDeliveries: 1n,
      requestIds: [RID],
      deliveredRequests: [true],
    });
    expect(l.topics).toHaveLength(3);
    expect(l.topics[0]).toBe(v2.MarketplaceDelivery.topic);
    expect(decodeMarketplaceLog(l, 30_000_000, V1_END)).toEqual({
      kind: "MarketplaceDelivery",
      deliveryMech: MECH,
      numDeliveries: 1n,
      requestIds: [RID],
      deliveredRequests: [true],
    });
    // Decoding it with the V2 ABI fails (2 topics expected): the block
    // boundary, not the topic, decides.
    expect(() => decodeMarketplaceLog(l, V1_END + 1, V1_END)).toThrow();
  });

  it("decodes V1 Deliver (`data`) and V2 Deliver (`deliveryData`) into the same shape", () => {
    const base = { mech: MECH, mechServiceMultisig: REQUESTER, requestId: RID, deliveryRate: 7n };
    const l1 = v1.Deliver.encode({ ...base, data: "0x" + "11".repeat(32) });
    const l2 = v2.Deliver.encode({
      ...base,
      requestData: "0x",
      deliveryData: "0x" + "11".repeat(32),
    });
    expect(l1.topics[0]).toBe(mechAbi.Deliver.topic); // same signature as the mech's own Deliver
    const want = { kind: "Deliver", ...base, deliveryData: "0x" + "11".repeat(32) };
    expect(decodeMarketplaceLog(l1, 30_000_000, V1_END)).toEqual(want);
    expect(decodeMarketplaceLog(l2, 34_000_000, V1_END)).toEqual(want);
    expect(decodeMarketplaceLog(l2, 30_000_000, V1_END)).toBeNull();
  });

  it("decodes all five factory creation events", () => {
    for (const ev of Object.values(FACTORY_EVENTS)) {
      const l = ev.encode({ mech: MECH, serviceId: 111n, maxDeliveryRate: 100n });
      expect(decodeFactoryLog(l)).toEqual({ mech: MECH, serviceId: 111n, maxDeliveryRate: 100n });
    }
    expect(decodeFactoryLog({ topics: [pad("0x01")], data: "0x" })).toBeNull();
  });
});

describe("Base fee conversion (subgraph fee-utils.ts)", () => {
  it('CREDITS: feeRaw × 0.99 / 1e6 — subgraph "0.00000099" for 1, "0.000099" for 100', async () => {
    expect((await convertFeeToUsd(1n, "CREDITS", 1n, NO_PRICE, log, undefined, BASE)).toFixed()).toBe(
      "0.00000099"
    );
    expect((await convertFeeToUsd(100n, "CREDITS", 1n, NO_PRICE, log, undefined, BASE)).toFixed()).toBe(
      "0.000099"
    );
    expect(nvmCreditsToUsd(123_456_789n, "990000000000000000", 6).toFixed()).toBe("122.22222111");
    expect(warnings).toHaveLength(0);
  });

  it('NATIVE: wei × answer / 1e8 / 1e18 — mech 109 "0.0937255" for 5e13 wei at $1,874.51', async () => {
    const price = { usdAt: async () => ({ answer: 187_451_000_000n, decimals: 8 }) };
    expect((await convertFeeToUsd(50_000_000_000_000n, "NATIVE", 1n, price, log, undefined, BASE)).toFixed()).toBe(
      "0.0937255"
    );
    expect(nativeToUsd(99n, { answer: 316_556_740n * 1000n, decimals: 8 }, 18).toFixed()).toBe(
      "0.0000000000003133911726"
    );
  });

  it("USDC: 1:1 at 6 decimals", async () => {
    expect((await convertFeeToUsd(1_500_000n, "USDC", 1n, NO_PRICE, log, undefined, BASE)).toFixed()).toBe("1.5");
  });

  it("TOKEN: OLAS amount × (USDC balance / OLAS balance) from the pool at the block", async () => {
    const seen: bigint[] = [];
    const pool = {
      balancesAt: async (b: bigint) => {
        seen.push(b);
        // 3,000,000 OLAS vs 600,000 USDC -> $0.20 per OLAS
        return { olas: 3_000_000n * 10n ** 18n, stable: 600_000n * 10n ** 6n };
      },
    };
    const usd = await convertFeeToUsd(5n * 10n ** 18n, "TOKEN", 42n, NO_PRICE, log, pool, BASE);
    expect(usd.toFixed()).toBe("1");
    expect(seen).toEqual([42n]);
    // empty pool / unreadable pool -> $0 with a warning, like the subgraph
    const zero = await convertFeeToUsd(1n, "TOKEN", 1n, NO_PRICE, log, { balancesAt: async () => null }, BASE);
    expect(zero.toFixed()).toBe("0");
    expect(olasToUsd(1n, { olas: 0n, stable: 1n }, 6)).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it("rounds every step to 34 significant digits, half-up, like graph-node", () => {
    // 1/3 OLAS price: (1 USDC / 3 OLAS) at 34 digits, then × amount, rounded again
    const usd = olasToUsd(10n ** 18n, { olas: 3n * 10n ** 18n, stable: 10n ** 6n }, 6)!;
    expect(usd.toFixed()).toBe("0.3333333333333333333333333333333333");
    expect(gn(BigDecimal("2").div(3)).toFixed()).toBe("0.6666666666666666666666666666666667");
    // a running total is re-rounded on every addition
    expect(gnPlus(BigDecimal("1000"), usd).toFixed()).toBe("1000.333333333333333333333333333333");
  });
});

describe("Base handlers: NVM-USDC mech end to end", () => {
  it('maxDeliveryRateUSD, feeUSD and finalFeeUSD match the subgraph ("0.000099" locked, "0.00000099" paid)', async () => {
    vi.stubEnv("MARKETPLACE_CHAIN", "base");
    const h = await import("../src/handlers");
    const m = await import("../src/model");
    const { InMemoryCache } = await import("./inMemoryCache");
    const cache = new InMemoryCache();
    const ctx = { cache, log: cache.log, price: NO_PRICE, ...h.newBatchState() };

    const MARKETPLACE = "0xf24ee42eda0fc9b33b7d41b06ee8ccd2ef7c5020";
    const NVM_USDC_FACTORY = "0x7bed01f8482ff686f025628e7780ca6c1f0559fc";
    const MECH = "0x723f6a7fc401a8d2eade269b5c65643b9ad3719f";
    const MULTISIG = "0x0000000000000000000000000000000000000011";
    const RID = "0x" + "6b".repeat(32);
    let n = 0;
    const meta = (txTo: string | null = MARKETPLACE) => ({
      blockNumber: 27_716_877n,
      blockTimestamp: 1_700_000_000n,
      txHash: "0x" + String(++n).padStart(64, "0"),
      logIndex: 0,
      address: MECH,
      txFrom: "0x0000000000000000000000000000000000000abc",
      txTo,
    });

    await h.handleCreateService(ctx, meta(), { serviceId: 111n, configHash: "0x" + "00".repeat(32) });
    await h.handleCreateMultisigWithAgents(ctx, meta(), { serviceId: 111n, multisig: MULTISIG });
    const t = meta();
    h.handleMechFactoryCreate(ctx, t, { mech: MECH, serviceId: 111n, maxDeliveryRate: 100n });
    await h.handleCreateMech(ctx, { ...t, logIndex: 1 }, { mech: MECH, serviceId: 111n, mechFactory: NVM_USDC_FACTORY });
    const mech = (await cache.get(m.Mech, "111"))!;
    expect(mech.paymentType).toBe("0x0d6fd99afa9c4c580fab5e341922c2a5c4b61d880da60506193d7bf88944dd14");
    expect(mech.maxDeliveryRateUSD!.toFixed()).toBe("0.000099");

    await h.handleMarketplaceRequest(ctx, meta(), {
      priorityMech: MECH,
      requester: MULTISIG,
      numRequests: 1n,
      requestIds: [RID],
    });
    let req = (await cache.get(m.Request, RID))!;
    expect(req.feeUnit).toBe("CREDITS");
    expect(req.feeRaw).toBe(100n);
    expect(req.feeUSD!.toFixed()).toBe("0.000099");

    // delivered at 1 credit
    await h.handleMechDeliver(ctx, meta(), {
      mechServiceMultisig: MULTISIG,
      requestId: RID,
      deliveryRate: 1n,
      data: "0x" + "22".repeat(32),
    });
    req = (await cache.get(m.Request, RID))!;
    expect(req.finalFeeUSD!.toFixed()).toBe("0.00000099");
    expect((await cache.get(m.Global, ""))!.totalFeesPaidUSD.toFixed()).toBe("0.00000099");
    expect((await cache.get(m.Sender, MULTISIG))!.totalFeesPaidUSD.toFixed()).toBe("0.00000099");
    // The Base manifest has no MaxDeliveryRateUpdated handler; the observed
    // deliveryRate refreshes the mech's rate, as in the subgraph.
    expect((await cache.get(m.Mech, "111"))!.maxDeliveryRate).toBe(1n);
    expect((await cache.get(m.Mech, "111"))!.maxDeliveryRateUSD!.toFixed()).toBe("0.00000099");
  });
});
