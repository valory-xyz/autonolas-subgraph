import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStore, meta, newBatch } from "./inMemoryStore";
import { resetTrackedIndexForTests } from "../src/entityCache";
import * as h from "../src/handlers";
import { FundsCategory, ServiceBondType } from "../src/model";
import { OLAS, ROLE_AGENT, ROLE_MASTER, SRTU } from "../src/constants";

// A Safe answers getOwners(); anything else reverts. getOrCreateMasterSafe
// goes through src/rpc.ts, so these tests stub the module rather than hit a
// network — the RPC contract itself is exercised in rpc.test.ts.
const OWNERS = new Map<string, string[]>();
vi.mock("../src/rpc", () => ({
  getSafeConfig: async (address: string) => {
    const owners = OWNERS.get(address);
    return owners == null ? null : { owners, threshold: 1n };
  },
  getStakingConfig: async () => ({
    minStakingDeposit: 10n,
    numAgentInstances: 1n,
  }),
  assertArchiveRpc: async () => {},
}));


const MASTER = "0xmaster";
const MASTER_EOA = "0xmastereoa";
const AGENT = "0xagentsafe";
const OPERATOR = "0xoperator";
const STRANGER = "0xstranger";
const USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";

let store: InMemoryStore;

beforeEach(() => {
  resetTrackedIndexForTests();
  store = new InMemoryStore();
  OWNERS.clear();
  OWNERS.set(MASTER, [MASTER_EOA]);
});

/** Discover a Master Safe by minting the service NFT to it. */
async function mintTo(ctx: any, serviceId: bigint, to: string, block = 1000n) {
  await h.handleServiceNftTransfer(
    ctx,
    meta({ blockNumber: block, txHash: `0xmint${serviceId}` }),
    { serviceId, from: "0x0000000000000000000000000000000000000000", to }
  );
}

describe("cross-batch relation loading (regression)", () => {
  it("tracks the Agent Safe when CreateMultisigWithAgents lands in a later batch", async () => {
    // Batch 1: the mint discovers the Master Safe and links the Service.
    const b1 = newBatch(store, 1000, 1000);
    await mintTo(b1, 7n, MASTER);
    await b1.cache.flush();

    expect(store.raw("Service", "7").masterSafeId).toBe(MASTER);

    // Batch 2: a fresh cache, so the Service must be re-read from the
    // store. A plain get() returns it with masterSafe === undefined, which
    // silently skips the TrackedAddress(AGENT) write below.
    const b2 = newBatch(store, 1001, 1001);
    await h.handleCreateMultisigWithAgents(
      b2,
      meta({ blockNumber: 1001n, txHash: "0xmultisig" }),
      { serviceId: 7n, multisig: AGENT }
    );
    await b2.cache.flush();

    const tracked = store.raw("TrackedAddress", AGENT);
    expect(tracked, "Agent Safe must be tracked").toBeDefined();
    expect(tracked.role).toBe(ROLE_AGENT);
    expect(tracked.masterSafeId).toBe(MASTER);
    expect(store.raw("AgentSafe", AGENT).masterSafeId).toBe(MASTER);
  });

  it("stamps masterSafe on a reward row for a service loaded from an earlier batch", async () => {
    const b1 = newBatch(store, 1000, 1000);
    await mintTo(b1, 7n, MASTER);
    await h.handleCreateMultisigWithAgents(
      b1,
      meta({ blockNumber: 1000n, txHash: "0xmultisig" }),
      { serviceId: 7n, multisig: AGENT }
    );
    await b1.cache.flush();

    // Steady state at chain head is roughly one block per batch, so the
    // reward almost always lands in a different batch from the discovery.
    const b2 = newBatch(store, 2000, 2000);
    await h.handleRewardClaimed(
      b2,
      meta({ blockNumber: 2000n, txHash: "0xreward", address: "0xproxy" }),
      { serviceId: 7n, owner: MASTER, multisig: AGENT, reward: 5n, epoch: 1n }
    );
    await b2.cache.flush();

    const row = store.all("FundsMovement").find(
      (r) => r.category === FundsCategory.STAKING_REWARD_CLAIM
    );
    expect(row, "reward row written").toBeDefined();
    // NULL here means the row vanishes from the wallet's
    // `where: { masterSafe }` query.
    expect(row.masterSafeId).toBe(MASTER);
    expect(row.agentSafeId).toBe(AGENT);
  });

  it("falls back to the event owner when the service has no resolved link", async () => {
    // A Master Safe exists, but this service was never linked to it.
    const b1 = newBatch(store, 1000, 1000);
    await mintTo(b1, 1n, MASTER);
    await b1.cache.flush();

    const b2 = newBatch(store, 2000, 2000);
    await h.handleRewardClaimed(
      b2,
      meta({ blockNumber: 2000n, txHash: "0xreward2", address: "0xproxy" }),
      { serviceId: 99n, owner: MASTER, multisig: AGENT, reward: 3n, epoch: 1n }
    );
    await b2.cache.flush();

    const row = store.all("FundsMovement").find((r) => r.transactionHash === "0xreward2");
    expect(row.masterSafeId).toBe(MASTER);
  });
});

describe("bond attribution", () => {
  it("attributes a security deposit to the service from the same tx", async () => {
    const ctx = newBatch(store, 1000, 1000);
    await mintTo(ctx, 7n, MASTER);

    const m = meta({ txHash: "0xbond", logIndex: 3, address: SRTU });
    // SRTU fires first (ServiceManager calls it before the registry).
    await h.handleTokenDeposit(ctx, m, {
      account: MASTER,
      token: OLAS,
      amount: 100n,
    });
    await h.handleActivateRegistration(
      ctx,
      meta({ txHash: "0xbond", logIndex: 4 }),
      { serviceId: 7n }
    );
    await ctx.cache.flush();

    const bond = store.raw("BondMovement", "0xbond-3");
    expect(bond.category).toBe(FundsCategory.SERVICE_BOND_DEPOSIT);
    expect(bond.bondType).toBe(ServiceBondType.SECURITY_DEPOSIT);
    expect(bond.serviceId).toBe("7");
    // Bond leaves the Master Safe, so its balance is debited exactly once
    // (the raw Master<->SRTU transfer is suppressed in classifyTransfer).
    expect(store.raw("TokenBalance", `${MASTER}-${OLAS}`).balance).toBe(-100n);
  });

  it("attributes an agent bond only once however many instances register", async () => {
    const ctx = newBatch(store, 1000, 1000);
    await mintTo(ctx, 7n, MASTER);

    await h.handleTokenDeposit(
      ctx,
      meta({ txHash: "0xagentbond", logIndex: 1, address: SRTU }),
      { account: MASTER, token: OLAS, amount: 50n }
    );
    // registerAgentsTokenDeposit emits ONE deposit for the combined bond,
    // but RegisterInstance fires per agent instance.
    for (const li of [2, 3, 4]) {
      await h.handleRegisterInstance(
        ctx,
        meta({ txHash: "0xagentbond", logIndex: li }),
        { serviceId: 7n, agentId: 40n, operator: OPERATOR }
      );
    }
    await ctx.cache.flush();

    expect(store.count("BondMovement")).toBe(1);
    expect(store.raw("BondMovement", "0xagentbond-1").bondType).toBe(
      ServiceBondType.AGENT_BOND
    );
    // agentIds/operators deduped despite three events
    expect(store.raw("Service", "7").agentIds).toEqual([40]);
    expect(store.raw("Service", "7").operators).toEqual([OPERATOR]);
  });

  it("leaves a bond unattributed when no registry event follows", async () => {
    const ctx = newBatch(store, 1000, 1000);
    await h.handleTokenDeposit(
      ctx,
      meta({ txHash: "0xorphan", logIndex: 0, address: SRTU }),
      { account: MASTER, token: OLAS, amount: 10n }
    );
    await ctx.cache.flush();

    const bond = store.raw("BondMovement", "0xorphan-0");
    expect(bond.bondType).toBeNull();
    expect(bond.amount).toBe(10n); // amount preserved regardless
  });
});

describe("transfer classification and balances", () => {
  async function discovered() {
    const ctx = newBatch(store, 1000, 1000);
    await mintTo(ctx, 7n, MASTER);
    await h.handleCreateMultisigWithAgents(
      ctx,
      meta({ blockNumber: 1000n, txHash: "0xms" }),
      { serviceId: 7n, multisig: AGENT }
    );
    await ctx.cache.flush();
    return ctx;
  }

  it("tags the first Master EOA deposit as setup, later ones as funding", async () => {
    await discovered();

    const b = newBatch(store, 1100, 1100);
    await h.handleErc20Transfer(
      b,
      meta({ blockNumber: 1100n, txHash: "0xt1", address: USDC }),
      { from: MASTER_EOA, to: MASTER, value: 100n }
    );
    await h.handleErc20Transfer(
      b,
      meta({ blockNumber: 1100n, txHash: "0xt2", address: USDC }),
      { from: MASTER_EOA, to: MASTER, value: 50n }
    );
    await b.cache.flush();

    const rows = store.all("FundsMovement");
    expect(rows.find((r) => r.transactionHash === "0xt1").category).toBe(
      FundsCategory.SAFE_SETUP_TRANSFER
    );
    expect(rows.find((r) => r.transactionHash === "0xt2").category).toBe(
      FundsCategory.MASTER_FUNDING_IN
    );
    expect(store.raw("TokenBalance", `${MASTER}-${USDC}`).balance).toBe(150n);
  });

  it("moves both balances on Master -> Agent and groups them per tx", async () => {
    await discovered();

    const b = newBatch(store, 1200, 1200);
    await h.handleErc20Transfer(
      b,
      meta({ blockNumber: 1200n, txHash: "0xfund", logIndex: 0, address: USDC }),
      { from: MASTER, to: AGENT, value: 30n }
    );
    await h.handleErc20Transfer(
      b,
      meta({ blockNumber: 1200n, txHash: "0xfund", logIndex: 1, address: OLAS }),
      { from: MASTER, to: AGENT, value: 7n }
    );
    await b.cache.flush();

    expect(store.raw("TokenBalance", `${MASTER}-${USDC}`).balance).toBe(-30n);
    expect(store.raw("TokenBalance", `${AGENT}-${USDC}`).balance).toBe(30n);
    // One funding event for the tx; only the OLAS leg bumps the OLAS total,
    // so mixed-decimal amounts are never summed together.
    expect(store.count("AgentFundingEvent")).toBe(1);
    expect(store.all("AgentFundingEvent")[0].totalOlasAmount).toBe(7n);
    expect(store.all("AgentFundingEvent")[0].totalNativeAmount).toBe(0n);
  });

  it("splits OLAS agent->master into its own category", async () => {
    await discovered();
    const b = newBatch(store, 1300, 1300);
    await h.handleErc20Transfer(
      b,
      meta({ blockNumber: 1300n, txHash: "0xsweep", address: OLAS }),
      { from: AGENT, to: MASTER, value: 9n }
    );
    await h.handleErc20Transfer(
      b,
      meta({ blockNumber: 1300n, txHash: "0xret", address: USDC }),
      { from: AGENT, to: MASTER, value: 4n }
    );
    await b.cache.flush();

    const rows = store.all("FundsMovement");
    expect(rows.find((r) => r.transactionHash === "0xsweep").category).toBe(
      FundsCategory.AGENT_OLAS_TO_MASTER
    );
    expect(rows.find((r) => r.transactionHash === "0xret").category).toBe(
      FundsCategory.AGENT_TO_MASTER
    );
  });

  it("ignores transfers between two untracked addresses", async () => {
    await discovered();
    const b = newBatch(store, 1400, 1400);
    await h.handleErc20Transfer(
      b,
      meta({ blockNumber: 1400n, txHash: "0xnoise", address: USDC }),
      { from: STRANGER, to: "0xother", value: 1n }
    );
    await b.cache.flush();
    expect(
      store.all("FundsMovement").find((r) => r.transactionHash === "0xnoise")
    ).toBeUndefined();
  });
});

describe("master safe discovery", () => {
  it("skips a non-Safe NFT recipient without creating a MasterSafe", async () => {
    const ctx = newBatch(store, 1000, 1000);
    await mintTo(ctx, 7n, STRANGER); // no owners registered -> not a Safe
    await ctx.cache.flush();

    expect(store.count("MasterSafe")).toBe(0);
    expect(store.raw("Service", "7").masterSafeId).toBeNull();
    // The custody trail is still recorded.
    expect(store.count("ServiceNftCustodyChange")).toBe(1);
  });

  it("emits one SAFE_DEPLOYED anchor and tracks the Safe and its EOA", async () => {
    const ctx = newBatch(store, 1000, 1000);
    await mintTo(ctx, 7n, MASTER);
    await ctx.cache.flush();

    const anchors = store
      .all("FundsMovement")
      .filter((r) => r.category === FundsCategory.SAFE_DEPLOYED);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].amount).toBe(0n);
    expect(store.raw("TrackedAddress", MASTER).role).toBe(ROLE_MASTER);
    expect(store.raw("TrackedAddress", MASTER_EOA)).toBeDefined();
    expect(store.raw("MasterSafe", MASTER).historyFloorBlock).toBe(1000n);
  });
});
