// Service lifecycle against the ported handlers + in-memory cache:
// create -> register (two agents, different days) -> multisig -> Safe
// executions (daily aggregates, global counters) -> ERC-8004 link / wallet /
// metadata -> terminate. Mirrors the behaviour of the subgraph's mapping.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCache } from "./inMemoryCache";
import * as h from "../src/handlers";
import { EventMeta, blockTimestampSeconds, dayTimestamp, mostRecentAgentId } from "../src/logic";
import {
  AgentPerformance,
  AgentRegistration,
  Creator,
  DailyActiveMultisig,
  DailyActiveMultisigs,
  DailyAgentMultisig,
  DailyAgentPerformance,
  DailyServiceActivity,
  DailyUniqueAgent,
  DailyUniqueAgents,
  ERC8004Agent,
  ERC8004Metadata,
  Global,
  Multisig,
  Operator,
  Service,
} from "../src/model";
import { GLOBAL_ID } from "../src/constants";

const OPERATOR = "0x00000000000000000000000000000000000000aa";
const OPERATOR_2 = "0x00000000000000000000000000000000000000bb";
const CREATOR = "0x00000000000000000000000000000000000000cc";
const SAFE = "0x1000000000000000000000000000000000000001";
const CONFIG_HASH = `0x${"ab".repeat(32)}`;

// Two distinct UTC days.
const DAY1_TS = 1_788_900_000n;
const DAY2_TS = DAY1_TS + 86_400n;
const DAY1 = dayTimestamp(DAY1_TS);
const DAY2 = dayTimestamp(DAY2_TS);

let txCounter = 0;
function meta(blockTimestamp: bigint): EventMeta {
  txCounter += 1;
  return {
    blockNumber: 58_664_000n + BigInt(txCounter),
    blockTimestamp,
    txHash: `0x${String(txCounter).padStart(64, "0")}`,
    logIndex: 0,
  };
}

const utf8ToHex = (s: string) => `0x${Buffer.from(s, "utf8").toString("hex")}`;

let cache: InMemoryCache;

beforeEach(() => {
  cache = new InMemoryCache();
  txCounter = 0;
});

/** create service 1, register agent 5 on day 1 and agent 7 on day 2. */
async function seedService() {
  await h.handleCreateService(cache, meta(DAY1_TS), {
    serviceId: 1n,
    configHash: CONFIG_HASH,
  });
  await h.handleRegisterInstance(cache, meta(DAY1_TS), {
    operator: OPERATOR,
    serviceId: 1n,
    agentId: 5n,
  });
  await h.handleRegisterInstance(cache, meta(DAY2_TS), {
    operator: OPERATOR_2,
    serviceId: 1n,
    agentId: 7n,
  });
}

describe("service lifecycle", () => {
  it("creates the service with its config hash and creation time", async () => {
    await h.handleCreateService(cache, meta(DAY1_TS), {
      serviceId: 1n,
      configHash: CONFIG_HASH,
    });
    const s = (await cache.get(Service, "1"))!;
    expect(s.configHash).toBe(CONFIG_HASH);
    expect(s.creationTimestamp).toBe(DAY1_TS);
    expect(s.agentIds).toEqual([]);
    expect(s.multisig).toBeNull();
  });

  it("updates the config hash only for known services", async () => {
    await h.handleUpdateService(cache, meta(DAY1_TS), {
      serviceId: 9n,
      configHash: CONFIG_HASH,
    });
    expect(await cache.get(Service, "9")).toBeUndefined();

    await seedService();
    const NEW = `0x${"cd".repeat(32)}`;
    await h.handleUpdateService(cache, meta(DAY2_TS), {
      serviceId: 1n,
      configHash: NEW,
    });
    expect((await cache.get(Service, "1"))!.configHash).toBe(NEW);
  });

  it("registration appends agents once, records timestamps and counts unique operators", async () => {
    await seedService();
    // duplicate registration of agent 5 by the same operator
    await h.handleRegisterInstance(cache, meta(DAY2_TS), {
      operator: OPERATOR,
      serviceId: 1n,
      agentId: 5n,
    });
    const s = (await cache.get(Service, "1"))!;
    expect(s.agentIds).toEqual([5, 7]);

    const reg5 = (await cache.get(AgentRegistration, "1-5"))!;
    expect(reg5.registrationTimestamp).toBe(DAY2_TS); // latest wins
    const reg7 = (await cache.get(AgentRegistration, "1-7"))!;
    expect(reg7.registrationTimestamp).toBe(DAY2_TS);

    expect(cache.all(Operator).map((o) => o.id).sort()).toEqual(
      [OPERATOR, OPERATOR_2].sort(),
    );
    expect((await cache.get(Global, GLOBAL_ID))!.totalOperators).toBe(2);
  });

  it("a service first seen at registration gets creationTimestamp 0 (parity)", async () => {
    await h.handleRegisterInstance(cache, meta(DAY1_TS), {
      operator: OPERATOR,
      serviceId: 3n,
      agentId: 5n,
    });
    expect((await cache.get(Service, "3"))!.creationTimestamp).toBe(0n);
  });
});

describe("multisig creation", () => {
  it("links creator and multisig, picks the most recently registered agent, and marks the Safe known", async () => {
    await seedService();
    await h.handleCreateMultisig(cache, meta(DAY2_TS + 10n), {
      serviceId: 1n,
      multisig: SAFE,
      txFrom: CREATOR,
    });
    const s = (await cache.get(Service, "1"))!;
    expect(s.multisig).toBe(SAFE);
    expect(s.creator?.id).toBe(CREATOR);
    expect(await cache.get(Creator, CREATOR)).toBeDefined();

    const m = (await cache.get(Multisig, SAFE))!;
    expect(m.serviceId).toBe(1);
    expect(m.creator).toBe(CREATOR);
    expect(m.agentIds).toEqual([7]); // registered on day 2, after agent 5
    expect(m.creationTimestamp).toBe(DAY2_TS + 10n);
    expect(await cache.isKnownMultisig(SAFE)).toBe(true);
  });

  it("falls back to all agents when no registration precedes the deployment", async () => {
    await seedService();
    // deploy "before" both registrations
    await h.handleCreateMultisig(cache, meta(DAY1_TS - 100n), {
      serviceId: 1n,
      multisig: SAFE,
      txFrom: CREATOR,
    });
    expect((await cache.get(Multisig, SAFE))!.agentIds).toEqual([5, 7]);
    expect(cache.warnings).toHaveLength(1);
  });

  it("ignores multisigs for unknown services", async () => {
    await h.handleCreateMultisig(cache, meta(DAY1_TS), {
      serviceId: 42n,
      multisig: SAFE,
      txFrom: CREATOR,
    });
    expect(await cache.get(Multisig, SAFE)).toBeUndefined();
    expect(await cache.isKnownMultisig(SAFE)).toBe(false);
  });
});

describe("Safe execution aggregates", () => {
  async function deployed() {
    await seedService();
    await h.handleCreateMultisig(cache, meta(DAY2_TS + 10n), {
      serviceId: 1n,
      multisig: SAFE,
      txFrom: CREATOR,
    });
  }

  it("two executions on one day count once per day-entity and twice in tx counters", async () => {
    await deployed();
    await h.handleSafeExecution(cache, meta(DAY2_TS + 20n), { address: SAFE });
    await h.handleSafeExecution(cache, meta(DAY2_TS + 30n), { address: SAFE });

    const activity = (await cache.get(
      DailyServiceActivity,
      `day-${DAY2}-service-1`,
    ))!;
    expect(activity.agentIds).toEqual([7]);
    expect(activity.dayTimestamp).toBe(DAY2);

    const unique = (await cache.get(DailyUniqueAgents, `day-${DAY2}`))!;
    expect(unique.count).toBe(1);
    expect(cache.all(DailyUniqueAgent)).toHaveLength(1);

    const perf = (await cache.get(DailyAgentPerformance, `day-${DAY2}-agent-7`))!;
    expect(perf.txCount).toBe(2);
    expect(perf.activeMultisigCount).toBe(1);
    expect(cache.all(DailyAgentMultisig)).toHaveLength(1);

    const active = (await cache.get(DailyActiveMultisigs, `day-${DAY2}`))!;
    expect(active.count).toBe(1);
    expect(cache.all(DailyActiveMultisig)).toHaveLength(1);

    expect((await cache.get(AgentPerformance, "7"))!.txCount).toBe(2n);
    const g = (await cache.get(Global, GLOBAL_ID))!;
    expect(g.txCount).toBe(2n);
    expect(g.lastUpdated).toBe(DAY2_TS + 30n);
  });

  it("a new day opens new daily entities", async () => {
    await deployed();
    await h.handleSafeExecution(cache, meta(DAY2_TS + 20n), { address: SAFE });
    const DAY3_TS = DAY2_TS + 86_400n;
    await h.handleSafeExecution(cache, meta(DAY3_TS), { address: SAFE });
    expect(cache.all(DailyUniqueAgents).map((d) => d.id).sort()).toEqual(
      [`day-${DAY2}`, `day-${dayTimestamp(DAY3_TS)}`].sort(),
    );
    expect(cache.all(DailyAgentPerformance)).toHaveLength(2);
  });

  it("does nothing for an address that is not a stored multisig", async () => {
    await deployed();
    await h.handleSafeExecution(cache, meta(DAY2_TS), {
      address: "0x2000000000000000000000000000000000000002",
    });
    // Global exists from registration (operator count) but no tx was counted.
    expect((await cache.get(Global, GLOBAL_ID))!.txCount).toBe(0n);
    expect(cache.all(DailyActiveMultisigs)).toHaveLength(0);
    expect(cache.all(DailyServiceActivity)).toHaveLength(0);
  });

  it("keeps counting after termination, as the subgraph does (Multisig row survives)", async () => {
    await deployed();
    await h.handleTerminateService(cache, meta(DAY2_TS + 40n), { serviceId: 1n });
    const s = (await cache.get(Service, "1"))!;
    expect(s.agentIds).toEqual([]);
    expect(s.multisig).toBeNull();
    expect(s.creator).toBeNull();

    await h.handleSafeExecution(cache, meta(DAY2_TS + 50n), { address: SAFE });
    expect((await cache.get(Global, GLOBAL_ID))!.txCount).toBe(1n);
  });
});

describe("ERC-8004 bridger", () => {
  it("links the agent with default metadata, then wallet and custom metadata", async () => {
    await seedService();
    await h.handleServiceAgentLinked(cache, meta(DAY2_TS), {
      serviceId: 1n,
      agentId: 77n,
    });
    const s = (await cache.get(Service, "1"))!;
    expect(s.erc8004Agent?.id).toBe("77");
    expect((await cache.get(ERC8004Metadata, "77-ecosystem"))!.value).toBe("Olas");
    expect((await cache.get(ERC8004Metadata, "77-serviceRegistry"))!.value).toBe("1");

    await h.handleAgentWalletSet(cache, meta(DAY2_TS), {
      agentId: 77n,
      multisig: SAFE,
    });
    expect((await cache.get(ERC8004Agent, "77"))!.agentWallet).toBe(SAFE);

    await h.handleMetadataSet(cache, meta(DAY2_TS), {
      agentId: 77n,
      metadataKey: "ecosystem",
      metadataValue: utf8ToHex("Olas v2"),
    });
    expect((await cache.get(ERC8004Metadata, "77-ecosystem"))!.value).toBe("Olas v2");
    expect(cache.all(ERC8004Metadata)).toHaveLength(2);
  });

  it("two services pointing at one agent is representable, as in the subgraph", async () => {
    await seedService();
    await h.handleCreateService(cache, meta(DAY1_TS), { serviceId: 2n, configHash: CONFIG_HASH });
    await h.handleServiceAgentLinked(cache, meta(DAY2_TS), { serviceId: 1n, agentId: 77n });
    await h.handleServiceAgentLinked(cache, meta(DAY2_TS), { serviceId: 2n, agentId: 77n });
    // No release, no warning: Service.erc8004Agent is not unique, so the
    // second link cannot fail the batch and the first is left as it was.
    expect((await cache.get(Service, "1"))!.erc8004Agent?.id).toBe("77");
    expect((await cache.get(Service, "2"))!.erc8004Agent?.id).toBe("77");
    expect(cache.warnings).toHaveLength(0);
    expect(cache.all(ERC8004Agent)).toHaveLength(1);
    // serviceRegistry metadata follows the latest link (subgraph parity).
    expect((await cache.get(ERC8004Metadata, "77-serviceRegistry"))!.value).toBe("2");
  });

  it("warns and skips a link for an unknown service, but wallet/metadata still create the agent", async () => {
    await h.handleServiceAgentLinked(cache, meta(DAY1_TS), {
      serviceId: 5n,
      agentId: 1n,
    });
    expect(cache.warnings).toHaveLength(1);
    expect(await cache.get(ERC8004Agent, "1")).toBeUndefined();

    await h.handleAgentWalletSet(cache, meta(DAY1_TS), { agentId: 1n, multisig: SAFE });
    expect((await cache.get(ERC8004Agent, "1"))!.agentWallet).toBe(SAFE);
  });
});

describe("logic", () => {
  it("blockTimestampSeconds: SQD header ms -> seconds, floored, so day buckets hold", () => {
    expect(blockTimestampSeconds(1_788_900_000_000)).toBe(1_788_900_000n);
    // 23:59:59.999 UTC must stay in its day, not round into the next one.
    const lastMsOfDay = (DAY1 + 86_400n - 1n) * 1000n + 999n;
    const secs = blockTimestampSeconds(Number(lastMsOfDay));
    expect(secs).toBe(DAY1 + 86_400n - 1n);
    expect(dayTimestamp(secs)).toBe(DAY1);
  });

  it("mostRecentAgentId: strictly later wins, ties keep the first, none -> -1", () => {
    const ts = new Map([
      [1, 100n],
      [2, 200n],
      [3, 200n],
    ]);
    const get = (id: number) => ts.get(id);
    expect(mostRecentAgentId([1, 2, 3], get, 250n)).toBe(2);
    expect(mostRecentAgentId([3, 2, 1], get, 250n)).toBe(3);
    expect(mostRecentAgentId([1, 2, 3], get, 150n)).toBe(1);
    expect(mostRecentAgentId([1, 2, 3], get, 50n)).toBe(-1);
    expect(mostRecentAgentId([9], get, 250n)).toBe(-1);
  });
});
