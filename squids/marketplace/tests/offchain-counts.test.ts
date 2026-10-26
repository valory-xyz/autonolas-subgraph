import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each(["base", "robinhood"])("%s counts signed batches once across individual delivery logs", async (chain) => {
  vi.resetModules();
  vi.stubEnv("MARKETPLACE_CHAIN", chain);
  const h = await import("../src/handlers");
  const { CHAIN } = await import("../src/constants");
  const { Global, Sender, Mech, MarketplaceDeliveryWithSignatures } = await import("../src/model");
  const { InMemoryCache, newBatch, meta, rid } = await import("./inMemoryCache");
  const cache = new InMemoryCache();
  const ctx = newBatch(cache);
  const mech = "0x00000000000000000000000000000000000000aa";
  const requester = "0x00000000000000000000000000000000000000bb";
  const factory = CHAIN.mechFactories[0].address;
  const creation = meta();
  h.handleMechFactoryCreate(ctx, creation, { mech, serviceId: 1n, maxDeliveryRate: 100n });
  await h.handleCreateMech(ctx, { ...creation, logIndex: 1 }, { mech, serviceId: 1n, mechFactory: factory });
  expect((await cache.get(Global, ""))!.totalOffChainRequests).toBe(0n);
  const event = meta({ address: CHAIN.mechMarketplace.address });
  for (const [index, id] of [rid(1), rid(2)].entries()) {
    await h.handleDeliverWithSignatures(ctx, { ...event, logIndex: index }, {
      mech, mechServiceMultisig: requester, requestId: id, deliveryRate: 30n, deliveryData: "0x",
    });
  }
  expect((await cache.get(Global, ""))!.totalOffChainRequests).toBe(0n);
  await h.handleMarketplaceDeliveryWithSignatures(ctx, { ...event, logIndex: 2 }, {
    deliveryMech: mech, requester, numDeliveries: 2n, requestIds: [rid(1), rid(2)],
  });
  expect((await cache.get(Global, ""))!.totalOffChainRequests).toBe(2n);
  expect((await cache.get(Global, ""))!.totalMarketplaceDeliveriesWithSignatures).toBe(1n);
  expect((await cache.get(Sender, requester))!.totalOffChainRequests).toBe(2n);
  expect((await cache.get(Mech, "1"))!.receivedRequests).toBe(2n);
  expect(cache.count(MarketplaceDeliveryWithSignatures)).toBe(1);
});
