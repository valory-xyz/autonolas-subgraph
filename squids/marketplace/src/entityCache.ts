import { Store } from "@subsquid/typeorm-store";
import {
  AtaTransaction,
  CreateMech,
  CreateMultisigWithAgents,
  CreateService,
  Deliver,
  DeliverForMarketplace,
  Global,
  IndexerStatus,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceRequest,
  Mech,
  Metadata,
  RegisterInstance,
  Request,
  RequestToMarketplace,
  RequestsPerAgent,
  Sender,
  Service,
  TerminateService,
  Transfer,
  UpdateService,
} from "./model";
import * as models from "./model";

export type EntityClass<T> = { new (...args: any[]): T; name: string };
export type Entity = { id: string };
export type CacheLogger = {
  warn(msg: string): void;
  info(msg: string): void;
  error(msg: string): void;
};

/**
 * The surface handlers depend on. `EntityCache` is the production
 * implementation (TypeORM store); tests substitute an in-memory one.
 */
export interface IEntityCache {
  log: CacheLogger;
  /**
   * Read-through get. Pass `relations` for every relation the caller will
   * READ on the result (e.g. `request.sender.id`): `store.get()` is
   * `findOneBy({id})` with no relations loaded, so a row from an earlier
   * batch comes back with its links `undefined` — not null, undefined — and
   * reading one silently produces wrong data. A cache hit is only trusted
   * when the requested relations are present (self-heal, see below).
   */
  get<T extends Entity>(
    cls: EntityClass<T>,
    id: string,
    relations?: string[]
  ): Promise<T | undefined>;
  set<T extends Entity>(cls: EntityClass<T>, entity: T): void;
  flush(): Promise<void>;
}

/**
 * FK-safe write order: referenced entities before referencing ones.
 * TypeORM enforces real foreign keys, unlike the graph-node store.
 */
const FLUSH_ORDER: EntityClass<any>[] = [
  Global,
  Service,
  Sender,
  Mech, // -> Service
  CreateMech,
  CreateMultisigWithAgents,
  AtaTransaction,
  RequestsPerAgent,
  Metadata, // -> Service
  Request, // -> Sender, Service
  RequestToMarketplace, // -> Request
  Deliver, // -> Request, Service
  DeliverForMarketplace, // -> Deliver
  MarketplaceRequest,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  CreateService,
  UpdateService,
  RegisterInstance,
  TerminateService,
  Transfer,
  IndexerStatus,
];

// flush() only visits what is listed, while set() accepts any entity class,
// so an entity missing from FLUSH_ORDER is cached in memory, never written,
// and never errors. Assert the list is exhaustive at module load rather than
// relying on whoever adds the next entity to remember this file.
{
  const entityClasses = Object.values(models).filter(
    (v): v is EntityClass<any> =>
      typeof v === "function" &&
      typeof (v as any).prototype?.constructor === "function"
  );
  if (entityClasses.length !== FLUSH_ORDER.length) {
    const listed = new Set(FLUSH_ORDER.map((c) => c.name));
    const missing = entityClasses
      .map((c) => c.name)
      .filter((n) => !listed.has(n));
    throw new Error(
      `FLUSH_ORDER is not exhaustive: ${missing.join(", ") || "count mismatch"}. ` +
        `An entity absent from FLUSH_ORDER is silently never persisted — add it ` +
        `after everything it references.`
    );
  }
}

/**
 * Read-through cache over the TypeORM store with deferred, FK-ordered
 * writes. Same get/set shape as the sibling squids'.
 *
 * On partial writes: typeorm-store's `upsert` groups a batch by which FK
 * columns are `undefined` and omits those columns from that group's
 * statement, so re-saving an entity fetched without relations does NOT null
 * its links. Reading an unloaded link is the only hazard, and `get()` with
 * `relations` is the guard.
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
    relations?: string[]
  ): Promise<T | undefined> {
    const bucket = this.bucket(this.cache, cls);
    if (bucket.has(id)) {
      const hit = bucket.get(id) as T | undefined;
      // Self-heal: a plain get() elsewhere may have seeded the bucket with a
      // relation-less row. Only trust the hit if every relation this call
      // needs is present. A loaded-but-unlinked relation is `null`; only
      // `undefined` means "not loaded".
      if (
        hit == null ||
        relations == null ||
        relations.every((r) => (hit as any)[r] !== undefined)
      ) {
        return hit;
      }
    }
    const fromDb =
      relations == null || relations.length === 0
        ? await this.store.get(cls, id)
        : await this.store.findOne(cls, {
            where: { id } as any,
            relations: Object.fromEntries(relations.map((r) => [r, true])) as any,
          });
    // A dirty (in-memory, not yet flushed) entity must not be replaced by a
    // stale DB read — relations on it are whatever the handler set.
    const dirtyHit = this.dirty.get(cls.name)?.get(id) as T | undefined;
    if (dirtyHit != null) return dirtyHit;
    bucket.set(id, fromDb ?? undefined);
    return fromDb ?? undefined;
  }

  set<T extends Entity>(cls: EntityClass<T>, entity: T): void {
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
}
