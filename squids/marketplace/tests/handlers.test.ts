// Handler semantics against the in-memory cache. Each scenario mirrors a
// behavioral expectation of the subgraph's Matchstick suite / CLAUDE.md:
// registry lifecycle, the factory -> CreateMech hand-off, the on-chain
// marketplace request/delivery flow with its double-count guards, the
// direct-to-mech path, off-chain signed batches, karma, and foreign
// emitters on the address-less mech subscription.
import { beforeEach, describe, expect, it } from "vitest";
import * as h from "../src/handlers";
import {
  AtaTransaction,
  CreateMech,
  CreateMultisigWithAgents,
  Deliver,
  DeliverForMarketplace,
  Global,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceRequest,
  Mech,
  Metadata,
  Request,
  RequestToMarketplace,
  RequestsPerAgent,
  Sender,
  Service,
  Transfer,
} from "../src/model";
import {
  PAYMENT_TYPE_FIXED_PRICE_NATIVE,
  PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC,
} from "../src/constants";
import {
  FACTORY_NATIVE,
  FACTORY_USDC,
  InMemoryCache,
  MARKETPLACE,
  meta,
  newBatch,
  payload32,
  resetTxCounter,
  rid,
} from "./inMemoryCache";

const MECH_A = "0x00000000000000000000000000000000000000a1"; // service 1, native
const MECH_B = "0x00000000000000000000000000000000000000b2"; // service 2, USDG
const MULTISIG_1 = "0x0000000000000000000000000000000000000011";
const MULTISIG_1B = "0x000000000000000000000000000000000000001b";
const MULTISIG_2 = "0x0000000000000000000000000000000000000022";
const REQUESTER_EOA = "0x00000000000000000000000000000000000000e0";
const OWNER = "0x0000000000000000000000000000000000000abc";
const HASH = "0x" + "11".repeat(32);
const HASH2 = "0x" + "22".repeat(32);

let cache: InMemoryCache;
let ctx: h.Ctx;

beforeEach(() => {
  resetTxCounter();
  cache = new InMemoryCache();
  ctx = newBatch(cache);
});

async function global(): Promise<Global> {
  return (await cache.get(Global, ""))!;
}

async function createService(serviceId: bigint, multisig: string, agentId = 25n) {
  await h.handleCreateService(ctx, meta(), { serviceId, configHash: HASH });
  await h.handleRegisterInstance(ctx, meta(), {
    operator: OWNER,
    serviceId,
    agentInstance: "0x" + "77".repeat(20),
    agentId,
  });
  await h.handleCreateMultisigWithAgents(ctx, meta(), { serviceId, multisig });
}

/** Factory event then marketplace CreateMech, same tx, as on-chain. */
async function createMech(
  serviceId: bigint,
  mech: string,
  factory: string,
  rate: bigint,
  c: h.Ctx = ctx
) {
  const m = meta({ txFrom: OWNER });
  h.handleMechFactoryCreate(c, { ...m, logIndex: 0 }, { mech, serviceId, maxDeliveryRate: rate });
  await h.handleCreateMech(c, { ...m, logIndex: 1 }, { mech, serviceId, mechFactory: factory });
}

describe("ServiceRegistryL2", () => {
  it("creates the service, tracks agents and multisigs (write-once lookup)", async () => {
    await createService(1n, MULTISIG_1);
    const s = (await cache.get(Service, "1"))!;
    expect(s.serviceId).toBe(1n);
    expect(s.configHash).toBe(HASH);
    expect(s.agentIds).toEqual([25]);
    expect(s.latestMultisig).toBe(MULTISIG_1);
    expect(s.historicalMultisigs).toEqual([MULTISIG_1]);
    expect(s.totalRequests).toBe(0n);

    // duplicate agent id is not appended
    await h.handleRegisterInstance(ctx, meta(), {
      operator: OWNER,
      serviceId: 1n,
      agentInstance: "0x" + "78".repeat(20),
      agentId: 25n,
    });
    expect((await cache.get(Service, "1"))!.agentIds).toEqual([25]);

    // a second multisig moves latest and grows history
    await h.handleCreateMultisigWithAgents(ctx, meta(), { serviceId: 1n, multisig: MULTISIG_1B });
    const s2 = (await cache.get(Service, "1"))!;
    expect(s2.latestMultisig).toBe(MULTISIG_1B);
    expect(s2.historicalMultisigs).toEqual([MULTISIG_1, MULTISIG_1B]);

    // the lookup row is write-once: re-emitting for the same multisig with
    // another service id keeps the first mapping
    await h.handleCreateMultisigWithAgents(ctx, meta(), { serviceId: 9n, multisig: MULTISIG_1 });
    expect((await cache.get(CreateMultisigWithAgents, MULTISIG_1))!.serviceId).toBe(1n);

    await h.handleTerminateService(ctx, meta(), { serviceId: 1n });
    expect((await cache.get(Service, "1"))!.agentIds).toEqual([]);
  });

  it("is a no-op for services it has not seen created", async () => {
    await h.handleCreateMultisigWithAgents(ctx, meta(), { serviceId: 5n, multisig: MULTISIG_2 });
    expect(await cache.get(Service, "5")).toBeUndefined();
    // ...but the lookup row still exists, so requests from it attribute
    expect((await cache.get(CreateMultisigWithAgents, MULTISIG_2))!.serviceId).toBe(5n);
  });

  it("UpdateService and Transfer propagate to the Mech", async () => {
    await createService(1n, MULTISIG_1);
    await createMech(1n, MECH_A, FACTORY_NATIVE, 10n ** 15n);
    await h.handleUpdateService(ctx, meta(), { serviceId: 1n, configHash: HASH2 });
    expect((await cache.get(Service, "1"))!.configHash).toBe(HASH2);
    expect((await cache.get(Mech, "1"))!.configHash).toBe(HASH2);

    const newOwner = "0x" + "99".repeat(20);
    await h.handleServiceTransfer(ctx, meta(), { from: OWNER, to: newOwner, id: 1n });
    expect((await cache.get(Mech, "1"))!.owner).toBe(newOwner);
    expect(cache.all(Transfer)[0].serviceId).toBe(1n);
  });

  it("ComplementaryMetadata links service and mech address", async () => {
    await createService(1n, MULTISIG_1);
    await h.handleComplementaryMetadataUpdated(ctx, meta(), { serviceId: 1n, hash: HASH2 });
    let md = (await cache.get(Metadata, "1"))!;
    expect(md.metadata).toBe(HASH2);
    expect(md.service?.id).toBe("1");
    expect(md.mech).toBeNull();
    await createMech(1n, MECH_A, FACTORY_NATIVE, 10n ** 15n);
    await h.handleComplementaryMetadataUpdated(ctx, meta(), { serviceId: 1n, hash: HASH });
    md = (await cache.get(Metadata, "1"))!;
    expect(md.metadata).toBe(HASH);
    expect(md.mech).toBe(MECH_A);
  });
});

describe("CreateMech", () => {
  it("picks up maxDeliveryRate from the factory event and prices it", async () => {
    await createService(1n, MULTISIG_1);
    await createMech(1n, MECH_A, FACTORY_NATIVE, 10n ** 16n); // 0.01 ETH

    const mech = (await cache.get(Mech, "1"))!;
    expect(mech.address).toBe(MECH_A);
    expect(mech.mechFactory).toBe(FACTORY_NATIVE);
    expect(mech.owner).toBe(OWNER); // tx.from
    expect(mech.configHash).toBe(HASH); // copied from the Service
    expect(mech.service?.id).toBe("1");
    expect(mech.paymentType).toBe(PAYMENT_TYPE_FIXED_PRICE_NATIVE);
    expect(mech.maxDeliveryRate).toBe(10n ** 16n);
    expect(mech.maxDeliveryRateUSD!.toString()).toBe("20"); // $2,000 * 0.01
    expect(mech.karma).toBe(0n);

    const cm = (await cache.get(CreateMech, MECH_A))!;
    expect(cm.serviceId).toBe(1n);
    expect(cm.source).toBe("MARKETPLACE");
    expect((await global()).totalMechs).toBe(1n);
    expect(ctx.pendingMechRates.size).toBe(0); // consumed
  });

  it("USDG factory mech is priced at 1:1 / 6 decimals", async () => {
    await createService(2n, MULTISIG_2);
    await createMech(2n, MECH_B, FACTORY_USDC, 250_000n); // 0.25 USDG
    const mech = (await cache.get(Mech, "2"))!;
    expect(mech.paymentType).toBe(PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
    expect(mech.maxDeliveryRateUSD!.toString()).toBe("0.25");
  });

  it("without the factory event the rate is null and a warning is logged", async () => {
    await createService(1n, MULTISIG_1);
    await h.handleCreateMech(ctx, meta({ txFrom: OWNER }), {
      mech: MECH_A,
      serviceId: 1n,
      mechFactory: FACTORY_NATIVE,
    });
    const mech = (await cache.get(Mech, "1"))!;
    expect(mech.maxDeliveryRate).toBeNull();
    expect(mech.maxDeliveryRateUSD).toBeNull();
    expect(cache.warnings.some((w) => /PendingMechData not found/.test(w))).toBe(true);
  });

  it("throws on a factory the chain table does not know (subgraph parity)", async () => {
    await expect(
      h.handleCreateMech(ctx, meta(), {
        mech: MECH_A,
        serviceId: 1n,
        mechFactory: "0x" + "de".repeat(20),
      })
    ).rejects.toThrow(/Unknown mech factory/);
  });

  it("a second mech for the same service overwrites the Mech in place", async () => {
    await createService(1n, MULTISIG_1);
    await createMech(1n, MECH_A, FACTORY_NATIVE, 10n ** 16n);
    await createMech(1n, MECH_B, FACTORY_USDC, 250_000n);
    const mech = (await cache.get(Mech, "1"))!;
    expect(mech.address).toBe(MECH_B);
    expect(mech.paymentType).toBe(PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
    // both addresses still resolve to service 1
    expect((await cache.get(CreateMech, MECH_A))!.serviceId).toBe(1n);
    expect((await cache.get(CreateMech, MECH_B))!.serviceId).toBe(1n);
    expect((await global()).totalMechs).toBe(2n);
  });
});

describe("on-chain marketplace request -> delivery", () => {
  const RATE = 10n ** 16n; // 0.01 ETH = $20

  beforeEach(async () => {
    await createService(1n, MULTISIG_1, 25n); // requester service (agent 25)
    await createService(2n, MULTISIG_2, 40n); // mech service
    await createMech(2n, MECH_A, FACTORY_NATIVE, RATE);
  });

  /** One marketplace tx: mech Request logs, then MarketplaceRequest. */
  async function marketplaceRequest(requester: string, ids: string[], c = ctx) {
    const m = meta({ marketplaceTx: true, txFrom: requester });
    let li = 0;
    for (const id of ids) {
      await h.handleMechRequest(
        c,
        { ...m, address: MECH_A, logIndex: li++ },
        { requestId: id, data: payload32(Number(id)) }
      );
    }
    await h.handleMarketplaceRequest(
      c,
      { ...m, address: MARKETPLACE, logIndex: li },
      {
        priorityMech: MECH_A,
        requester,
        numRequests: BigInt(ids.length),
        requestIds: ids,
      }
    );
    return m;
  }

  /** One marketplace tx: MarketplaceDelivery, then the mech's Deliver logs. */
  async function marketplaceDelivery(ids: string[], delivered: boolean[], rate = RATE, c = ctx) {
    const m = meta({ marketplaceTx: true, txFrom: MULTISIG_2 });
    await h.handleMarketplaceDelivery(
      c,
      { ...m, address: MARKETPLACE, logIndex: 0 },
      {
        deliveryMech: MECH_A,
        numDeliveries: BigInt(delivered.filter(Boolean).length),
        requestIds: ids,
        deliveredRequests: delivered,
      }
    );
    let li = 1;
    for (let i = 0; i < ids.length; i++) {
      if (!delivered[i]) continue;
      await h.handleMechDeliver(
        c,
        { ...m, address: MECH_A, logIndex: li++ },
        {
          mechServiceMultisig: MULTISIG_2,
          requestId: ids[i],
          deliveryRate: rate,
          data: payload32(900 + i),
        }
      );
    }
    return m;
  }

  it("MarketplaceRequest creates requests with locked fees and bumps every counter once", async () => {
    const ids = [rid(1), rid(2)];
    const m = await marketplaceRequest(MULTISIG_1, ids);

    const r1 = (await cache.get(Request, rid(1)))!;
    expect(r1.sender.id).toBe(MULTISIG_1);
    expect(r1.mech).toBe(MECH_A);
    expect(r1.priorityMech).toBe(MECH_A);
    expect(r1.service?.id).toBe("1");
    expect(r1.isDelivered).toBe(false);
    expect(r1.feeRaw).toBe(RATE);
    expect(r1.feeUnit).toBe("NATIVE");
    expect(r1.feeUSD!.toString()).toBe("20");
    expect(r1.finalFeeUSD).toBeUndefined();

    // the payload from the mech's Request log landed on the marker
    const rtm = (await cache.get(RequestToMarketplace, rid(1)))!;
    expect(rtm.isMarketplace).toBe(true);
    expect(rtm.isOffChain).toBe(false);
    expect(rtm.ipfsHashBytes).toBe(payload32(1));
    expect(rtm.request.id).toBe(rid(1));
    expect(ctx.pendingRequestPayloads.size).toBe(0);

    // the mech-side Request handler did NOT create/alter Request fields on
    // the marketplace path (sender stays the requester, not tx.from)
    expect(cache.count(Request)).toBe(2);

    expect((await cache.get(Service, "1"))!.totalRequests).toBe(2n); // demand side
    expect((await cache.get(Service, "2"))!.totalRequests).toBe(0n);
    expect((await cache.get(Mech, "2"))!.receivedRequests).toBe(2n);

    const sender = (await cache.get(Sender, MULTISIG_1))!;
    expect(sender.totalLegacyRequests).toBe(2n);
    expect(sender.totalLegacyTransactions).toBe(1n);
    expect(sender.totalMarketplaceRequests).toBe(1n);
    expect(sender.totalLegacyAtaTransactions).toBe(1n);

    const g = await global();
    expect(g.totalMarketplaceRequests).toBe(1n); // per event
    expect(g.totalRequests).toBe(2n); // per request
    expect(g.totalTransactions).toBe(1n);
    expect(g.totalAtaTransactions).toBe(1n);
    expect(await cache.get(AtaTransaction, m.txHash)).toBeDefined();
    expect((await cache.get(RequestsPerAgent, "25"))!.requestsCount).toBe(2n);
    expect(cache.count(MarketplaceRequest)).toBe(1);
  });

  it("a non-multisig requester gets no service, no ATA, no per-agent count", async () => {
    await marketplaceRequest(REQUESTER_EOA, [rid(3)]);
    const r = (await cache.get(Request, rid(3)))!;
    expect(r.service).toBeUndefined();
    expect((await global()).totalAtaTransactions).toBe(0n);
    expect(cache.count(AtaTransaction)).toBe(0);
    expect(cache.count(RequestsPerAgent)).toBe(0);
    expect((await cache.get(Sender, REQUESTER_EOA))!.totalLegacyRequests).toBe(1n);
  });

  it("MarketplaceDelivery + mech Deliver: delivered once, fee finalized once", async () => {
    const ids = [rid(1), rid(2)];
    await marketplaceRequest(MULTISIG_1, ids);
    const dm = await marketplaceDelivery(ids, [true, false], 8n * 10n ** 15n); // 0.008 ETH = $16

    const r1 = (await cache.get(Request, rid(1)))!;
    expect(r1.isDelivered).toBe(true);
    expect(r1.deliveredByMech).toBe(MECH_A);
    expect(r1.finalFeeUSD!.toString()).toBe("16");
    expect(r1.feeUSD!.toString()).toBe("20"); // estimate untouched
    const r2 = (await cache.get(Request, rid(2)))!;
    expect(r2.isDelivered).toBe(false);
    expect(r2.finalFeeUSD).toBeUndefined();

    // fees accumulate finalFeeUSD only
    expect((await cache.get(Sender, MULTISIG_1))!.totalFeesPaidUSD.toString()).toBe("16");
    expect((await global()).totalFeesPaidUSD.toString()).toBe("16");

    // priority mech == delivery mech -> self-delivered
    const mech = (await cache.get(Mech, "2"))!;
    expect(mech.selfDeliveredFromReceived).toBe(1n);
    expect(mech.deliveredByOthersFromReceived).toBe(0n);
    expect(mech.totalDeliveriesTransactions).toBe(1n);
    // observed rate differs from stored max -> self-heal + reprice
    expect(mech.maxDeliveryRate).toBe(8n * 10n ** 15n);
    expect(mech.maxDeliveryRateUSD!.toString()).toBe("16");

    // supply-side counter on the mech's service, exactly once
    expect((await cache.get(Service, "2"))!.totalDeliveries).toBe(1n);
    expect((await cache.get(Service, "1"))!.totalDeliveries).toBe(0n);

    // Deliver row from the mech log, linked to the request; DFM merged from
    // both handlers
    const delivers = cache.all(Deliver);
    expect(delivers).toHaveLength(1);
    expect(delivers[0].id).toBe(`${dm.txHash}-1`);
    expect(delivers[0].request?.id).toBe(rid(1));
    expect(delivers[0].service?.id).toBe("2");
    expect(delivers[0].sender).toBe(MULTISIG_2);
    const dfm = (await cache.get(DeliverForMarketplace, rid(1)))!;
    expect(dfm.isMarketplace).toBe(true);
    expect(dfm.isOffChain).toBe(false);
    expect(dfm.deliveryRate).toBe(8n * 10n ** 15n);
    expect(dfm.mechServiceMultisig).toBe(MULTISIG_2);
    expect(dfm.deliver?.id).toBe(delivers[0].id);
    expect(dfm.ipfsHashBytes).toBe(payload32(900));
    expect(await cache.get(DeliverForMarketplace, rid(2))).toBeUndefined();

    const g = await global();
    expect(g.totalDeliveries).toBe(1n); // only the successful one
    expect(g.totalMarketplaceDeliveries).toBe(1n);
    expect(g.totalTransactions).toBe(2n); // request tx + delivery tx
    expect(g.totalAtaTransactions).toBe(2n); // one per tx
    expect(cache.count(MarketplaceDelivery)).toBe(1);
  });

  it("re-delivering an already delivered request is a no-op", async () => {
    const ids = [rid(1)];
    await marketplaceRequest(MULTISIG_1, ids);
    await marketplaceDelivery(ids, [true]);
    await marketplaceDelivery(ids, [true]);
    expect((await cache.get(Service, "2"))!.totalDeliveries).toBe(1n);
    expect((await cache.get(Mech, "2"))!.totalDeliveriesTransactions).toBe(1n);
    expect((await cache.get(Sender, MULTISIG_1))!.totalFeesPaidUSD.toString()).toBe("20");
    const g = await global();
    expect(g.totalDeliveries).toBe(1n);
    expect(g.totalMarketplaceDeliveries).toBe(2n); // the event still counts
  });

  it("delivery by another mech counts as delivered-by-others on the priority mech", async () => {
    await createService(3n, "0x" + "33".repeat(20), 41n);
    await createMech(3n, MECH_B, FACTORY_USDC, 100_000n);
    await marketplaceRequest(MULTISIG_1, [rid(1)]);
    const m = meta({ marketplaceTx: true });
    await h.handleMarketplaceDelivery(ctx, { ...m, address: MARKETPLACE }, {
      deliveryMech: MECH_B,
      numDeliveries: 1n,
      requestIds: [rid(1)],
      deliveredRequests: [true],
    });
    expect((await cache.get(Mech, "2"))!.deliveredByOthersFromReceived).toBe(1n);
    expect((await cache.get(Mech, "2"))!.selfDeliveredFromReceived).toBe(0n);
    expect((await cache.get(Mech, "3"))!.totalDeliveriesTransactions).toBe(1n);
    expect((await cache.get(Service, "3"))!.totalDeliveries).toBe(1n);
    expect((await cache.get(Service, "2"))!.totalDeliveries).toBe(0n);
  });

  it("request and delivery in the SAME tx add one ATA transaction", async () => {
    const ids = [rid(1)];
    const m = await marketplaceRequest(MULTISIG_1, ids);
    await h.handleMarketplaceDelivery(ctx, { ...m, address: MARKETPLACE, logIndex: 5 }, {
      deliveryMech: MECH_A,
      numDeliveries: 1n,
      requestIds: ids,
      deliveredRequests: [true],
    });
    expect((await global()).totalAtaTransactions).toBe(1n);
  });

  it("survives a second batch (state read back, pending maps empty)", async () => {
    const ids = [rid(1)];
    await marketplaceRequest(MULTISIG_1, ids);
    const ctx2 = newBatch(cache);
    await marketplaceDelivery(ids, [true], RATE, ctx2);
    expect((await cache.get(Request, rid(1)))!.finalFeeUSD!.toString()).toBe("20");
    expect((await cache.get(Service, "2"))!.totalDeliveries).toBe(1n);
  });
});

describe("direct (non-marketplace) mech path", () => {
  beforeEach(async () => {
    await createService(1n, MULTISIG_1, 25n);
    await createService(2n, MULTISIG_2, 40n);
    await createMech(2n, MECH_A, FACTORY_NATIVE, 10n ** 16n);
  });

  it("Request populates the entity from tx.from but bumps no counters", async () => {
    await h.handleMechRequest(ctx, meta({ address: MECH_A, txFrom: MULTISIG_1 }), {
      requestId: rid(7),
      data: payload32(7),
    });
    const r = (await cache.get(Request, rid(7)))!;
    expect(r.sender.id).toBe(MULTISIG_1);
    expect(r.service?.id).toBe("2"); // the MECH's service on this path
    expect(r.mech).toBe(MECH_A);
    expect(r.priorityMech).toBe(MECH_A);
    const rtm = (await cache.get(RequestToMarketplace, rid(7)))!;
    expect(rtm.ipfsHashBytes).toBe(payload32(7));
    expect(rtm.isMarketplace).toBeUndefined();
    expect((await cache.get(Service, "1"))!.totalRequests).toBe(0n);
    expect((await cache.get(Mech, "2"))!.receivedRequests).toBe(0n);
    const g = await global(); // exists from createMech (totalMechs)
    expect(g.totalRequests).toBe(0n);
    expect(g.totalTransactions).toBe(0n);
    expect(g.totalAtaTransactions).toBe(0n);
    expect(cache.count(AtaTransaction)).toBe(0);
  });

  it("Deliver counts the service delivery and one ATA, no fee (not a marketplace request)", async () => {
    await h.handleMechRequest(ctx, meta({ address: MECH_A, txFrom: MULTISIG_1 }), {
      requestId: rid(7),
      data: payload32(7),
    });
    const dm = meta({ address: MECH_A, txFrom: MULTISIG_2 });
    await h.handleMechDeliver(ctx, dm, {
      mechServiceMultisig: MULTISIG_2,
      requestId: rid(7),
      deliveryRate: 10n ** 16n,
      data: "0x1234", // not an IPFS digest
    });
    const r = (await cache.get(Request, rid(7)))!;
    expect(r.isDelivered).toBe(true);
    expect(r.finalFeeUSD).toBeUndefined(); // scope guard: not isMarketplace
    expect((await cache.get(Service, "2"))!.totalDeliveries).toBe(1n);
    expect((await cache.get(Mech, "2"))!.selfDeliveredFromReceived).toBe(1n);
    const g = await global();
    expect(g.totalAtaTransactions).toBe(1n);
    expect(g.totalDeliveries).toBe(0n); // subgraph parity: direct path adds none
    const dfm = (await cache.get(DeliverForMarketplace, rid(7)))!;
    expect(dfm.ipfsHashBytes).toBeUndefined();
    expect(dfm.isMarketplace).toBe(true); // parity quirk
    expect(cache.warnings.some((w) => /Deliver payload has length 2/.test(w))).toBe(true);
    expect(cache.all(Deliver)[0].id).toBe(`${dm.txHash}-0`);
  });

  it("non-32-byte request payloads are stored nowhere, with a warning", async () => {
    await h.handleMechRequest(ctx, meta({ address: MECH_A }), { requestId: rid(8), data: "0xabcd" });
    expect(await cache.get(RequestToMarketplace, rid(8))).toBeUndefined();
    expect(cache.warnings.some((w) => /payload of length 2/.test(w))).toBe(true);
  });

  it("MaxDeliveryRateUpdated re-prices the mech", async () => {
    await h.handleMaxDeliveryRateUpdated(ctx, meta({ address: MECH_A }), {
      maxDeliveryRate: 5n * 10n ** 16n,
    });
    const mech = (await cache.get(Mech, "2"))!;
    expect(mech.maxDeliveryRate).toBe(5n * 10n ** 16n);
    expect(mech.maxDeliveryRateUSD!.toString()).toBe("100");
  });
});

describe("off-chain signed deliveries", () => {
  beforeEach(async () => {
    await createService(1n, MULTISIG_1, 25n);
    await createService(2n, MULTISIG_2, 40n);
    await createMech(2n, MECH_A, FACTORY_NATIVE, 10n ** 16n);
  });

  /** One tx: per-request marketplace Deliver logs, then the batch event. */
  async function signedBatch(requester: string, ids: string[]) {
    const m = meta({ marketplaceTx: true, txFrom: MULTISIG_2 });
    let li = 0;
    for (const id of ids) {
      await h.handleDeliverWithSignatures(ctx, { ...m, address: MARKETPLACE, logIndex: li++ }, {
        mech: MECH_A,
        mechServiceMultisig: MULTISIG_2,
        requestId: id,
        deliveryRate: 10n ** 16n,
        deliveryData: payload32(Number(id)),
      });
    }
    await h.handleMarketplaceDeliveryWithSignatures(
      ctx,
      { ...m, address: MARKETPLACE, logIndex: li },
      { deliveryMech: MECH_A, requester, numDeliveries: BigInt(ids.length), requestIds: ids }
    );
    return m;
  }

  it("records a Deliver per request, no Request, and counts both sides", async () => {
    const ids = [rid(1), rid(2), rid(3)];
    const m = await signedBatch(MULTISIG_1, ids);

    expect(cache.count(Request)).toBe(0);
    const delivers = cache.all(Deliver);
    expect(delivers).toHaveLength(3);
    expect(delivers[0].id).toBe(`${m.txHash}-${rid(1)}`);
    expect(delivers[0].request).toBeNull();
    expect(delivers[0].sender).toBe(MECH_A);
    expect(delivers[0].service?.id).toBe("2");

    const dfm = (await cache.get(DeliverForMarketplace, rid(1)))!;
    expect(dfm.isOffChain).toBe(true);
    expect(dfm.isMarketplace).toBe(true);
    expect(dfm.deliveryRate).toBe(10n ** 16n); // from the per-request log, kept by the batch log
    expect(dfm.mechServiceMultisig).toBe(MULTISIG_2);
    expect(dfm.ipfsHashBytes).toBe(payload32(1));
    expect(dfm.deliver?.id).toBe(delivers[0].id);

    const mech = (await cache.get(Mech, "2"))!;
    expect(mech.totalDeliveriesTransactions).toBe(3n);
    expect(mech.receivedRequests).toBe(3n);
    expect(mech.selfDeliveredFromReceived).toBe(3n);

    const sender = (await cache.get(Sender, MULTISIG_1))!;
    expect(sender.totalOffChainRequests).toBe(3n);
    expect(sender.totalLegacyRequests).toBe(3n);
    expect(sender.totalLegacyTransactions).toBe(1n);
    expect(sender.totalLegacyAtaTransactions).toBe(1n);
    expect(sender.totalMarketplaceRequests).toBe(0n);

    const g = await global();
    expect(g.totalRequests).toBe(3n);
    expect(g.totalDeliveries).toBe(3n);
    expect(g.totalMarketplaceDeliveriesWithSignatures).toBe(1n);
    expect(g.totalTransactions).toBe(2n);
    expect(g.totalAtaTransactions).toBe(2n); // mech + requester multisig
    expect(g.totalFeesPaidUSD.toString()).toBe("0"); // no on-chain request -> no fee
    expect((await cache.get(RequestsPerAgent, "25"))!.requestsCount).toBe(3n);
    // Service.totalDeliveries is NOT incremented on the signed path
    expect((await cache.get(Service, "2"))!.totalDeliveries).toBe(0n);
    expect(cache.count(MarketplaceDeliveryWithSignatures)).toBe(1);
  });

  it("an EOA requester adds only the mech's ATA", async () => {
    await signedBatch(REQUESTER_EOA, [rid(1)]);
    expect((await global()).totalAtaTransactions).toBe(1n);
    expect((await cache.get(Sender, REQUESTER_EOA))!.totalLegacyAtaTransactions).toBe(0n);
    expect(cache.count(RequestsPerAgent)).toBe(0);
  });

  it("a signed delivery of an on-chain marketplace request finalizes its fee once", async () => {
    const m = meta({ marketplaceTx: true, txFrom: MULTISIG_1 });
    await h.handleMarketplaceRequest(ctx, { ...m, address: MARKETPLACE }, {
      priorityMech: MECH_A,
      requester: MULTISIG_1,
      numRequests: 1n,
      requestIds: [rid(1)],
    });
    await signedBatch(MULTISIG_1, [rid(1)]);
    const r = (await cache.get(Request, rid(1)))!;
    expect(r.finalFeeUSD!.toString()).toBe("20");
    expect(r.isDelivered).toBe(false); // the signed path does not flip it (parity)
    expect((await cache.get(Sender, MULTISIG_1))!.totalFeesPaidUSD.toString()).toBe("20");
  });
});

describe("karma and foreign emitters", () => {
  beforeEach(async () => {
    await createService(2n, MULTISIG_2, 40n);
    await createMech(2n, MECH_A, FACTORY_NATIVE, 10n ** 16n);
  });

  it("accumulates karma deltas, including negative ones", async () => {
    await h.handleMechKarmaChanged(ctx, meta(), { mech: MECH_A, karmaChange: 5n });
    await h.handleMechKarmaChanged(ctx, meta(), { mech: MECH_A, karmaChange: -7n });
    expect((await cache.get(Mech, "2"))!.karma).toBe(-2n);
  });

  it("skips karma for an unknown mech with a warning", async () => {
    await h.handleMechKarmaChanged(ctx, meta(), { mech: MECH_B, karmaChange: 5n });
    expect(cache.warnings.some((w) => /Could not find serviceId for mech/.test(w))).toBe(true);
  });

  it("ignores mech-topic logs from addresses without a CreateMech row", async () => {
    const foreign = "0x" + "f0".repeat(20);
    expect(
      await h.handleMechRequest(ctx, meta({ address: foreign }), { requestId: rid(1), data: payload32(1) })
    ).toBe(false);
    expect(
      await h.handleMechDeliver(ctx, meta({ address: foreign }), {
        mechServiceMultisig: MULTISIG_2,
        requestId: rid(1),
        deliveryRate: 1n,
        data: payload32(1),
      })
    ).toBe(false);
    expect(
      await h.handleMaxDeliveryRateUpdated(ctx, meta({ address: foreign }), { maxDeliveryRate: 1n })
    ).toBe(false);
    expect(cache.count(Request)).toBe(0);
    expect(cache.count(Deliver)).toBe(0);
    expect(cache.count(DeliverForMarketplace)).toBe(0);
    expect(cache.count(RequestToMarketplace)).toBe(0);
    const g = await global();
    expect(g.totalAtaTransactions).toBe(0n);
    expect(g.totalDeliveries).toBe(0n);
  });
});
