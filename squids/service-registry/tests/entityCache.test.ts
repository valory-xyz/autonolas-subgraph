// The production EntityCache against a fake TypeORM store: the load-time
// FLUSH_ORDER guard (value import), the class-token assert, the chain-wide
// Safe filter loaded from the Multisig table, cross-batch accumulation of
// the daily counters, and an ERC-8004 agent shared across batches.
import { beforeEach, describe, expect, it } from "vitest";
import type { Store } from "@subsquid/typeorm-store";
import { EntityCache, resetKnownMultisigsForTests } from "../src/entityCache";
import * as h from "../src/handlers";
import { EventMeta, dailyAgentPerformanceId, dayTimestamp } from "../src/logic";
import {
  AgentPerformance,
  Creator,
  DailyAgentPerformance,
  ERC8004Agent,
  Global,
  Multisig,
  Operator,
  Service,
} from "../src/model";
import { GLOBAL_ID } from "../src/constants";

// Rows are shallow-copied on read so every batch gets a fresh instance,
// like a real store. Relations are kept on read, which TypeORM's plain
// get() does NOT do — nothing here reads a relation off a loaded row, and
// the fake must not be trusted for a test that would.
class FakeStore {
  tables = new Map<string, Map<string, any>>();
  private table(cls: { name: string }) {
    let t = this.tables.get(cls.name);
    if (t == null) this.tables.set(cls.name, (t = new Map()));
    return t;
  }
  private copy(cls: any, row: any) {
    return row == null ? undefined : Object.assign(new cls(), row);
  }
  async get(cls: any, id: string) {
    return this.copy(cls, this.table(cls).get(id));
  }
  async find(cls: any) {
    return [...this.table(cls).values()].map((r) => this.copy(cls, r));
  }
  async upsert(entities: any[]) {
    for (const e of entities) this.table(e.constructor).set(e.id, { ...e });
  }
}

const OPERATOR = "0x00000000000000000000000000000000000000aa";
const CREATOR = "0x00000000000000000000000000000000000000cc";
const SAFE = "0x1000000000000000000000000000000000000001";
const FOREIGN = "0x2000000000000000000000000000000000000002";
const DAY_TS = 1_788_900_000n;
const DAY = dayTimestamp(DAY_TS);

let n = 0;
const meta = (blockTimestamp: bigint): EventMeta => ({
  blockNumber: 58_664_000n + BigInt(++n),
  blockTimestamp,
  txHash: `0x${String(n).padStart(64, "0")}`,
  logIndex: 0,
});

const quiet = { warn() {}, info() {} };
let store: FakeStore;
const batch = () => {
  const c = new EntityCache(store as unknown as Store);
  c.log = quiet;
  return c;
};

async function deployInOneBatch(): Promise<void> {
  const c = batch();
  await h.handleCreateService(c, meta(DAY_TS), { serviceId: 1n, configHash: "0x01" });
  await h.handleRegisterInstance(c, meta(DAY_TS), { operator: OPERATOR, serviceId: 1n, agentId: 7n });
  await h.handleCreateMultisig(c, meta(DAY_TS), { serviceId: 1n, multisig: SAFE, txFrom: CREATOR });
  await c.flush();
}

beforeEach(() => {
  store = new FakeStore();
  resetKnownMultisigsForTests();
  n = 0;
});

describe("EntityCache", () => {
  it("FLUSH_ORDER guard ran at module load", () => {
    expect(EntityCache).toBeDefined();
  });

  it("rejects an instance of another entity class", () => {
    const c = batch();
    expect(() => c.set(Operator, new Creator({ id: CREATOR }))).toThrow(/Creator/);
    expect(() => c.set(AgentPerformance, new Global({ id: GLOBAL_ID }))).toThrow(/Global/);
  });

  it("loads the known-multisig set from the table in a later process", async () => {
    await deployInOneBatch();
    resetKnownMultisigsForTests(); // as if the processor restarted
    const c = batch();
    expect(await c.isKnownMultisig(SAFE)).toBe(true);
    expect(await c.isKnownMultisig(FOREIGN)).toBe(false);
  });

  it("accumulates daily counters across batch boundaries", async () => {
    await deployInOneBatch();

    let c = batch();
    await h.handleSafeExecution(c, meta(DAY_TS + 10n), { address: SAFE });
    await h.handleSafeExecution(c, meta(DAY_TS + 20n), { address: SAFE });
    await c.flush();

    c = batch();
    await h.handleSafeExecution(c, meta(DAY_TS + 30n), { address: SAFE });
    await c.flush();

    const perf = await store.get(DailyAgentPerformance, dailyAgentPerformanceId(DAY, 7));
    expect(perf.txCount).toBe(3);
    expect(perf.activeMultisigCount).toBe(1);
    expect((await store.get(Global, GLOBAL_ID)).txCount).toBe(3n);
    expect(store.tables.get("DailyAgentMultisig")!.size).toBe(1);
  });

  it("links the same agent from two services across batches without touching the first", async () => {
    await deployInOneBatch();
    let c = batch();
    await h.handleCreateService(c, meta(DAY_TS), { serviceId: 2n, configHash: "0x02" });
    await h.handleServiceAgentLinked(c, meta(DAY_TS), { serviceId: 1n, agentId: 77n });
    await c.flush();

    // A later batch: service 1 is only in the store, not in this cache.
    c = batch();
    await h.handleServiceAgentLinked(c, meta(DAY_TS), { serviceId: 2n, agentId: 77n });
    await c.flush();

    expect((await store.get(Service, "1")).erc8004Agent?.id).toBe("77");
    expect((await store.get(Service, "2")).erc8004Agent?.id).toBe("77");
    expect(store.tables.get("ERC8004Agent")!.size).toBe(1);
    expect(await store.get(Multisig, SAFE)).toBeDefined();
  });
});
