import type { Store } from "@subsquid/typeorm-store";
import {
  EntityCache as SharedEntityCache,
  assertFlushOrderExhaustive,
  type EntityClass,
  type IEntityCache as SharedIEntityCache,
} from "@olas/squid-shared";
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

export type { CacheLogger, Entity, EntityClass } from "@olas/squid-shared";

/**
 * The surface handlers depend on: the shared cache plus the chain-wide Safe
 * filter. `EntityCache` is the production implementation (TypeORM store);
 * tests substitute an in-memory one.
 */
export interface IEntityCache extends SharedIEntityCache {
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

// Runs at module load (a value import in tests/entityCache.test.ts makes
// this run in CI).
assertFlushOrderExhaustive(models, FLUSH_ORDER);

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

export class EntityCache extends SharedEntityCache implements IEntityCache {
  constructor(store: Store) {
    super(store, FLUSH_ORDER);
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
