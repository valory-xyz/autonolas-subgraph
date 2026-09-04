import { Store } from "@subsquid/typeorm-store";
import {
  AgentFundingEvent,
  AgentSafe,
  BondMovement,
  DailyServiceFunds,
  FundsMovement,
  IndexerStatus,
  MasterSafe,
  PendingRegistration,
  Service,
  ServiceIndex,
  ServiceNftCustodyChange,
  StakingContract,
  Token,
  TokenBalance,
  TrackedAddress,
} from "./model";
import { TrackedInfo } from "./logic";

export type EntityClass<T> = { new (...args: any[]): T; name: string };
export type Entity = { id: string };
export type CacheLogger = { warn(msg: string): void; info(msg: string): void };

/**
 * FK-safe write order: referenced entities before referencing ones.
 * TypeORM enforces real foreign keys, unlike the graph-node store.
 *
 * Service and AgentSafe reference EACH OTHER (service.agent_safe_id and
 * agent_safe.service_id), and the generated FKs are immediate, not
 * DEFERRABLE — so no single ordering satisfies both. The cycle is broken in
 * flush(): Service is written first with agentSafe forced to null, then
 * AgentSafe, then Service again with the real link. Upserts are idempotent,
 * so the double write is safe; it costs one extra statement per batch that
 * touches a Service.
 */
const FLUSH_ORDER: EntityClass<any>[] = [
  MasterSafe,
  Token,
  StakingContract,
  Service, // pass 1 — agentSafe nulled (see flush)
  AgentSafe,
  // Service pass 2 is injected here by flush()
  TrackedAddress,
  ServiceIndex,
  PendingRegistration,
  AgentFundingEvent,
  FundsMovement,
  BondMovement,
  DailyServiceFunds,
  ServiceNftCustodyChange,
  TokenBalance,
  IndexerStatus,
];

/**
 * Process-lifetime tracked-address index, shared across batches.
 *
 * Rebuilding it per batch would mean a full table scan every batch, which
 * defeats the point. It is safe to carry across batches because
 * TrackedAddress is write-once and only ever grows — EXCEPT across a chain
 * reorg, where SQD rolls the database back but cannot roll back our memory.
 * `builtThroughBlock` catches that: if a batch starts at or before a block
 * we have already indexed, the store was rewound, so the index is dropped
 * and rebuilt from the (rolled-back) table.
 */
const trackedIndexSingleton: {
  index: Map<string, TrackedInfo> | null;
  builtThroughBlock: number;
} = { index: null, builtThroughBlock: -1 };

/**
 * Read-through cache over the TypeORM store with deferred, FK-ordered
 * writes. Same get/set shape as predict-polymarket's.
 */
export class EntityCache {
  private cache = new Map<string, Map<string, Entity | undefined>>();
  private dirty = new Map<string, Map<string, Entity>>();
  log: CacheLogger = console;

  /**
   * Full in-memory index of TrackedAddress.
   *
   * This is the single most important performance decision in the port.
   * classifyTransfer runs on EVERY indexed ERC-20 transfer — ~133 per block
   * on Polygon — and needs the tracked-row for both `from` and `to`. Served
   * from the store, that is two DB round trips per transfer, ~266 per block,
   * essentially all of them misses on random addresses. That is the shape of
   * cost that held the graph-node deployment to ~5 blk/s.
   *
   * The tracked set is tiny (Pearl Master/Agent Safes and their EOAs plus
   * staking proxies — thousands of rows, not millions) and only ever grows,
   * so it is loaded once at startup and kept in memory. The hot path then
   * costs two Map lookups and zero I/O.
   */
  private trackedIndex: Map<string, TrackedInfo> | null = null;

  /**
   * @param firstBlock first block of this batch — used to detect a rollback
   *   and invalidate the shared tracked-address index.
   * @param lastBlock  last block of this batch.
   */
  constructor(
    private store: Store,
    private firstBlock = -1,
    private lastBlock = -1
  ) {
    if (
      trackedIndexSingleton.index != null &&
      firstBlock >= 0 &&
      firstBlock <= trackedIndexSingleton.builtThroughBlock
    ) {
      // Rewound: drop the index rather than trust rolled-back rows.
      trackedIndexSingleton.index = null;
      trackedIndexSingleton.builtThroughBlock = -1;
    }
    this.trackedIndex = trackedIndexSingleton.index;
  }

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
    id: string
  ): Promise<T | undefined> {
    const bucket = this.bucket(this.cache, cls);
    if (bucket.has(id)) return bucket.get(id) as T | undefined;
    const fromDb = await this.store.get(cls, id);
    bucket.set(id, fromDb);
    return fromDb;
  }

  set<T extends Entity>(cls: EntityClass<T>, entity: T): void {
    this.bucket(this.cache, cls).set(entity.id, entity);
    this.bucket(this.dirty, cls).set(entity.id, entity);
  }

  // --- TrackedAddress index -------------------------------------------

  /** Load the whole tracked-address table once. Idempotent. */
  private async ensureTrackedIndex(): Promise<Map<string, TrackedInfo>> {
    if (this.trackedIndex != null) return this.trackedIndex;
    if (trackedIndexSingleton.index != null) {
      this.trackedIndex = trackedIndexSingleton.index;
      return this.trackedIndex;
    }
    const idx = new Map<string, TrackedInfo>();
    const rows = await this.store.find(TrackedAddress, {
      relations: { masterSafe: true, service: true },
    });
    for (const r of rows) {
      idx.set(r.id, {
        id: r.id,
        role: r.role,
        masterSafeId: r.masterSafe?.id ?? null,
        serviceId: r.service?.id ?? null,
      });
    }
    this.log.info(`tracked-address index loaded: ${idx.size} rows`);
    this.trackedIndex = idx;
    trackedIndexSingleton.index = idx;
    return idx;
  }

  /** Hot path. In-memory after the first call; never hits the store. */
  async tracked(address: string): Promise<TrackedInfo | null> {
    const idx = await this.ensureTrackedIndex();
    return idx.get(address) ?? null;
  }

  /**
   * Write-once, mirroring the subgraph's immutable TrackedAddress: an
   * existing row is never modified. First-write-wins is load-bearing — an
   * AGENT_EOA shared across services keeps the first service it was seen
   * with, and writing a Master Safe as AGENT_EOA before its MASTER row
   * landed would permanently misroute that user's whole history.
   */
  async upsertTracked(
    address: string,
    role: string,
    masterSafeId: string | null,
    serviceId: string | null,
    blockNumber: bigint
  ): Promise<void> {
    const idx = await this.ensureTrackedIndex();
    if (idx.has(address)) return;

    const row = new TrackedAddress({
      id: address,
      role,
      masterSafe: masterSafeId ? new MasterSafe({ id: masterSafeId }) : null,
      service: serviceId ? new Service({ id: serviceId }) : null,
      firstTrackedBlock: blockNumber,
    });
    this.set(TrackedAddress, row);
    idx.set(address, { id: address, role, masterSafeId, serviceId });
  }

  // --- Flush -----------------------------------------------------------

  async flush(): Promise<void> {
    const serviceBucket = this.dirty.get(Service.name);
    const agentSafeBucket = this.dirty.get(AgentSafe.name);
    const cycle =
      serviceBucket != null &&
      serviceBucket.size > 0 &&
      agentSafeBucket != null &&
      agentSafeBucket.size > 0;

    // Snapshot the real agentSafe links, then null them for pass 1.
    const deferredLinks = new Map<string, AgentSafe | null | undefined>();
    if (cycle) {
      for (const svc of serviceBucket!.values() as Iterable<Service>) {
        if (svc.agentSafe != null) {
          deferredLinks.set(svc.id, svc.agentSafe);
          svc.agentSafe = null;
        }
      }
    }

    for (const cls of FLUSH_ORDER) {
      const bucket = this.dirty.get(cls.name);
      if (bucket == null || bucket.size === 0) continue;
      await this.store.upsert([...bucket.values()]);
      if (cls === AgentSafe && deferredLinks.size > 0) {
        // Pass 2: AgentSafe rows now exist, so the links satisfy the FK.
        const services: Service[] = [];
        for (const [id, link] of deferredLinks) {
          const svc = serviceBucket!.get(id) as Service | undefined;
          if (svc == null) continue;
          svc.agentSafe = link ?? null;
          services.push(svc);
        }
        if (services.length > 0) await this.store.upsert(services);
        deferredLinks.clear();
      }
      bucket.clear();
    }
    // The in-memory index is now consistent with what the store holds
    // through this batch.
    if (trackedIndexSingleton.index != null && this.lastBlock >= 0) {
      trackedIndexSingleton.builtThroughBlock = this.lastBlock;
    }
  }
}
