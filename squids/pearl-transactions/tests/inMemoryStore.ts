import { EntityCache } from "../src/entityCache";
import { BondQueue } from "../src/logic";
import type { Ctx } from "../src/handlers";

/**
 * Minimal stand-in for @subsquid/typeorm-store's Store, faithful in the one
 * respect that matters for these tests: `get()` does NOT load relations and
 * `findOne({relations})` does.
 *
 * Rows are held flat — relation fields are stored as `<name>Id` strings —
 * so a `get()` can hand back an object whose relation properties are
 * genuinely `undefined`, exactly as TypeORM does for a row fetched with
 * `findOneBy`. A fake that returned fully-linked objects from `get()` would
 * make the two-batch regression test pass while the bug was present.
 */
export class InMemoryStore {
  /** entity name -> id -> flat row */
  private tables = new Map<string, Map<string, any>>();

  private table(name: string) {
    let t = this.tables.get(name);
    if (t == null) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  /** Relation-valued properties, flattened to `<name>Id` on write. */
  private static RELATIONS: Record<string, string[]> = {
    Service: ["masterSafe", "agentSafe", "currentStakingContract"],
    AgentSafe: ["masterSafe", "service"],
    TrackedAddress: ["masterSafe", "service"],
    FundsMovement: [
      "service",
      "masterSafe",
      "agentSafe",
      "stakingContract",
      "agentFundingEvent",
    ],
    BondMovement: ["service", "masterSafe", "agentSafe"],
    AgentFundingEvent: ["service", "masterSafe"],
    DailyServiceFunds: ["service"],
    ServiceNftCustodyChange: ["service"],
    TokenBalance: ["token"],
  };

  private flatten(name: string, entity: any) {
    const rels = InMemoryStore.RELATIONS[name] ?? [];
    const row: any = {};
    for (const [k, v] of Object.entries(entity)) {
      if (rels.includes(k)) row[`${k}Id`] = (v as any)?.id ?? null;
      else row[k] = v;
    }
    return row;
  }

  /** Rebuild an entity. `relations` names which links to populate. */
  private hydrate(name: string, row: any, relations: string[] = []) {
    const rels = InMemoryStore.RELATIONS[name] ?? [];
    const out: any = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.endsWith("Id") && rels.includes(k.slice(0, -2))) continue;
      out[k] = v;
    }
    for (const r of relations) {
      const id = row[`${r}Id`];
      out[r] = id == null ? null : { id };
    }
    // Relations not asked for stay absent -> `undefined` on read, which is
    // the whole point of this fake.
    return out;
  }

  async get(cls: { name: string }, id: string): Promise<any | undefined> {
    const row = this.table(cls.name).get(id);
    return row == null ? undefined : this.hydrate(cls.name, row, []);
  }

  async findOne(
    cls: { name: string },
    opts: { where: { id: string }; relations?: Record<string, boolean> }
  ): Promise<any | undefined> {
    const row = this.table(cls.name).get(opts.where.id);
    if (row == null) return undefined;
    const rels = Object.keys(opts.relations ?? {}).filter(
      (k) => (opts.relations as any)[k]
    );
    return this.hydrate(cls.name, row, rels);
  }

  async find(
    cls: { name: string },
    opts?: { relations?: Record<string, boolean> }
  ): Promise<any[]> {
    const rels = Object.keys(opts?.relations ?? {}).filter(
      (k) => (opts!.relations as any)[k]
    );
    return [...this.table(cls.name).values()].map((r) =>
      this.hydrate(cls.name, r, rels)
    );
  }

  /**
   * Rejects a reference to a row that does not exist yet, the way a
   * non-deferrable Postgres foreign key does.
   *
   * Without this the fake is an unconditional Map.set, and the Service ->
   * AgentSafe -> Service two-pass write in EntityCache.flush() could be
   * deleted outright with every test still green — the workaround exists
   * only to satisfy FKs this fake would otherwise not model, so a
   * regression in it would surface as a production flush() failure and
   * never in CI.
   */
  async upsert(entities: any | any[]): Promise<void> {
    const list = Array.isArray(entities) ? entities : [entities];
    for (const e of list) {
      const name = e.constructor?.name ?? "Unknown";
      const incoming = this.flatten(name, e);
      for (const [k, v] of Object.entries(incoming)) {
        if (!k.endsWith("Id") || v == null) continue;
        const target = FK_TARGETS[`${name}.${k}`];
        if (target == null) continue;
        if (!this.table(target).has(v as string)) {
          throw new Error(
            `FK violation: ${name}.${k} -> ${target}(${v}) does not exist. ` +
              `Write ${target} before ${name}.`
          );
        }
      }
      const t = this.table(name);
      const existing = t.get(e.id);
      // TypeORM's upsert only writes columns present on the entity, so a
      // partial write must not blank out columns it never mentioned.
      t.set(e.id, existing == null ? incoming : { ...existing, ...incoming });
    }
  }

  /** Test helper: raw row, no hydration. */
  raw(entityName: string, id: string) {
    return this.table(entityName).get(id);
  }

  count(entityName: string) {
    return this.table(entityName).size;
  }

  all(entityName: string) {
    return [...this.table(entityName).values()];
  }
}

/** `<Entity>.<column>` -> referenced table, mirroring the generated FKs. */
const FK_TARGETS: Record<string, string> = {
  "Service.masterSafeId": "MasterSafe",
  "Service.agentSafeId": "AgentSafe",
  "Service.currentStakingContractId": "StakingContract",
  "AgentSafe.masterSafeId": "MasterSafe",
  "AgentSafe.serviceId": "Service",
  "TrackedAddress.masterSafeId": "MasterSafe",
  "TrackedAddress.serviceId": "Service",
  "FundsMovement.serviceId": "Service",
  "FundsMovement.masterSafeId": "MasterSafe",
  "FundsMovement.agentSafeId": "AgentSafe",
  "FundsMovement.stakingContractId": "StakingContract",
  "FundsMovement.agentFundingEventId": "AgentFundingEvent",
  "BondMovement.serviceId": "Service",
  "BondMovement.masterSafeId": "MasterSafe",
  "BondMovement.agentSafeId": "AgentSafe",
  "AgentFundingEvent.serviceId": "Service",
  "AgentFundingEvent.masterSafeId": "MasterSafe",
  "DailyServiceFunds.serviceId": "Service",
  "ServiceNftCustodyChange.serviceId": "Service",
  "TokenBalance.tokenId": "Token",
};

const silentLog = { warn: () => {}, info: () => {} };

/**
 * A fresh handler context over a store — i.e. a new batch. Reusing the
 * store across calls is how these tests simulate "this entity was written
 * by an earlier batch and must now be re-read from the database".
 */
export function newBatch(store: InMemoryStore, firstBlock = 0, lastBlock = 0): Ctx {
  const cache = new EntityCache(store as any, firstBlock, lastBlock);
  cache.log = silentLog;
  return { cache, bondQueue: new BondQueue(), log: silentLog };
}

export function meta(over: Partial<{
  blockNumber: bigint;
  blockTimestamp: bigint;
  txHash: string;
  logIndex: number;
  address: string;
}> = {}) {
  return {
    blockNumber: 1_000n,
    blockTimestamp: 1_700_000_000n,
    txHash: "0xtx",
    logIndex: 0,
    address: "0xcontract",
    ...over,
  };
}
