import { Store } from "@subsquid/typeorm-store";
import * as models from "./model";
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
} from "./model";

export type EntityClass<T> = { new (...args: any[]): T; name: string };
export type Entity = { id: string };
export type CacheLogger = { warn(msg: string): void; info(msg: string): void };

/**
 * The surface handlers depend on. `EntityCache` is the production
 * implementation (TypeORM store); tests substitute an in-memory one.
 */
export interface IEntityCache {
  log: CacheLogger;
  get<T extends Entity>(cls: EntityClass<T>, id: string): Promise<T | undefined>;
  set<T extends Entity>(cls: EntityClass<T>, entity: T): void;
  flush(): Promise<void>;
  /** Is this (lowercase) address a service multisig we have seen created? */
  isKnownMultisig(address: string): Promise<boolean>;
  addKnownMultisig(address: string): Promise<void>;
}

/**
 * FK-safe write order: referenced entities before referencing ones.
 * TypeORM enforces real foreign keys, unlike the graph-node store.
 */
const FLUSH_ORDER: EntityClass<any>[] = [
  Global,
  Operator,
  Creator,
  AgentPerformance,
  ERC8004Agent,
  Service, // -> Creator, ERC8004Agent
  Multisig,
  AgentRegistration,
  ERC8004Metadata, // -> ERC8004Agent
  DailyServiceActivity, // -> Service
  DailyUniqueAgents,
  DailyUniqueAgent, // -> DailyUniqueAgents, AgentPerformance
  DailyAgentPerformance,
  DailyAgentMultisig, // -> DailyAgentPerformance, Multisig
  DailyActiveMultisigs,
  DailyActiveMultisig, // -> DailyActiveMultisigs, Multisig
];

// flush() only visits what is listed, while set() accepts any entity class,
// so an entity missing from FLUSH_ORDER would be cached in memory, never
// written, and never error. Assert exhaustiveness at module load (a value
// import in tests/entityCache.test.ts makes this run in CI).
{
  const names = Object.values(models)
    .filter(
      (v): v is EntityClass<any> =>
        typeof v === "function" &&
        typeof (v as any).prototype?.constructor === "function",
    )
    .map((c) => c.name);
  const listed = new Set(FLUSH_ORDER.map((c) => c.name));
  const missing = names.filter((n) => !listed.has(n));
  const unknown = [...listed].filter((n) => !names.includes(n));
  if (missing.length || unknown.length || listed.size !== FLUSH_ORDER.length) {
    throw new Error(
      `FLUSH_ORDER is not exhaustive: missing [${missing.join(", ")}], ` +
        `unknown [${unknown.join(", ")}], duplicates ${FLUSH_ORDER.length - listed.size}. ` +
        `An entity absent from FLUSH_ORDER is silently never persisted.`,
    );
  }
}

/**
 * Process-lifetime set of service multisig addresses, shared across batches.
 *
 * This is what replaces the graph-node GnosisSafe template: the processor
 * receives every ExecutionSuccess / ExecutionFromModuleSuccess on the chain
 * and this set is the one lookup that keeps ours and drops the rest. Loaded
 * from the Multisig table on first use, then maintained as multisigs are
 * created. The subgraph never deletes a Multisig (termination clears the
 * Service side only), so membership is append-only.
 *
 * Hot blocks are on, so a reorg can roll the Multisig row back while the
 * address stays in this set: it may drift to a superset of the table, never
 * a subset. That is safe only because handleSafeExecution re-reads the
 * Multisig row and returns on a miss — never trust this set alone.
 */
const knownMultisigSingleton: { set: Set<string> | null } = { set: null };

/** Test hook: forget the process-wide set between tests. */
export function resetKnownMultisigsForTests(): void {
  knownMultisigSingleton.set = null;
}

/**
 * Read-through cache over the TypeORM store with deferred, FK-ordered writes.
 * Gives the handlers get/set semantics close to graph-node's load/save.
 */
export class EntityCache implements IEntityCache {
  private cache = new Map<string, Map<string, Entity | undefined>>();
  private dirty = new Map<string, Map<string, Entity>>();
  log: CacheLogger = console;

  constructor(private store: Store) {}

  private bucket(map: Map<string, Map<string, any>>, cls: EntityClass<any>) {
    let b = map.get(cls.name);
    if (b == null) {
      b = new Map();
      map.set(cls.name, b);
    }
    return b;
  }

  async get<T extends Entity>(
    cls: EntityClass<T>,
    id: string,
  ): Promise<T | undefined> {
    const bucket = this.bucket(this.cache, cls);
    if (bucket.has(id)) return bucket.get(id) as T | undefined;
    const fromDb = await this.store.get(cls, id);
    bucket.set(id, fromDb);
    return fromDb;
  }

  set<T extends Entity>(cls: EntityClass<T>, entity: T): void {
    // EntityClass<T> is structural; a mismatched token would file the row in
    // the wrong FLUSH_ORDER bucket.
    if (entity.constructor !== cls) {
      throw new Error(
        `set(${cls.name}) called with a ${entity.constructor.name} instance`,
      );
    }
    this.bucket(this.cache, cls).set(entity.id, entity);
    this.bucket(this.dirty, cls).set(entity.id, entity);
  }

  async flush(): Promise<void> {
    for (const cls of FLUSH_ORDER) {
      const bucket = this.dirty.get(cls.name);
      if (bucket == null || bucket.size === 0) continue;
      await this.store.upsert([...bucket.values()]);
      bucket.clear();
    }
  }

  private async knownMultisigs(): Promise<Set<string>> {
    if (knownMultisigSingleton.set != null) return knownMultisigSingleton.set;
    const rows = await this.store.find(Multisig, {});
    const set = new Set(rows.map((r) => r.id));
    this.log.info(`known-multisig set loaded: ${set.size} rows`);
    knownMultisigSingleton.set = set;
    return set;
  }

  /** Hot path: one Set lookup per Safe log on the chain. */
  async isKnownMultisig(address: string): Promise<boolean> {
    return (await this.knownMultisigs()).has(address);
  }

  async addKnownMultisig(address: string): Promise<void> {
    (await this.knownMultisigs()).add(address);
  }
}
