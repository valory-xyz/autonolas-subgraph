// Read-through cache over the TypeORM store with deferred, FK-ordered writes.
// Every squid builds one per batch; handlers depend on `IEntityCache` only,
// so tests substitute `InMemoryCache` (no Postgres).

export type EntityClass<T> = { new (...args: any[]): T; name: string };

/**
 * The slice of @subsquid/typeorm-store's `Store` the cache uses, typed
 * structurally so this package does not pin the consumer's typeorm-store
 * version (each squid has its own node_modules; a nominal import would make
 * two copies of `Store` incompatible).
 */
export interface StoreLike {
  get<T extends Entity>(cls: EntityClass<T>, id: string): Promise<T | undefined>;
  findOne<T extends Entity>(cls: EntityClass<T>, options: any): Promise<T | undefined>;
  find<T extends Entity>(cls: EntityClass<T>, options?: any): Promise<T[]>;
  upsert<T extends Entity>(entities: T[]): Promise<void>;
}
export type Entity = { id: string };
export type CacheLogger = {
  warn(msg: string): void;
  info(msg: string): void;
  error(msg: string): void;
};

export interface IEntityCache {
  log: CacheLogger;
  /**
   * Read-through get. Pass `relations` for every relation the caller will
   * READ on the result (e.g. `request.sender.id`): `store.get()` is
   * `findOneBy({id})` with no relations loaded, so a row from an earlier
   * batch comes back with its links `undefined` — not null, undefined — and
   * reading one silently produces wrong data. A cache hit is only trusted
   * when the requested relations are present.
   */
  get<T extends Entity>(cls: EntityClass<T>, id: string, relations?: string[]): Promise<T | undefined>;
  set<T extends Entity>(cls: EntityClass<T>, entity: T): void;
  flush(): Promise<void>;
}

/**
 * Assert a FLUSH_ORDER lists every entity class exported by `models`.
 * flush() only visits what is listed, while set() accepts any class, so an
 * entity missing from the order is cached in memory, never written, and
 * never errors. Call at module load.
 */
export function assertFlushOrderExhaustive(
  models: Record<string, unknown>,
  flushOrder: EntityClass<any>[]
): void {
  const names = Object.values(models)
    .filter(
      (v): v is EntityClass<any> =>
        typeof v === "function" && typeof (v as any).prototype?.constructor === "function"
    )
    .map((c) => c.name);
  const listed = new Set(flushOrder.map((c) => c.name));
  const missing = names.filter((n) => !listed.has(n));
  const unknown = [...listed].filter((n) => !names.includes(n));
  if (missing.length || unknown.length || listed.size !== flushOrder.length) {
    throw new Error(
      `FLUSH_ORDER is not exhaustive: missing [${missing.join(", ")}], ` +
        `unknown [${unknown.join(", ")}], duplicates ${flushOrder.length - listed.size}. ` +
        `An entity absent from FLUSH_ORDER is silently never persisted — add it ` +
        `after everything it references.`
    );
  }
}

/**
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

  constructor(
    protected readonly store: StoreLike,
    private readonly flushOrder: EntityClass<any>[]
  ) {}

  private bucket(map: Map<string, Map<string, any>>, cls: EntityClass<any>) {
    let b = map.get(cls.name);
    if (b == null) {
      b = new Map();
      map.set(cls.name, b);
    }
    return b;
  }

  async get<T extends Entity>(cls: EntityClass<T>, id: string, relations?: string[]): Promise<T | undefined> {
    const bucket = this.bucket(this.cache, cls);
    if (bucket.has(id)) {
      const hit = bucket.get(id) as T | undefined;
      // Self-heal: a plain get() elsewhere may have seeded the bucket with a
      // relation-less row. Only trust the hit if every relation this call
      // needs is present. A loaded-but-unlinked relation is `null`; only
      // `undefined` means "not loaded".
      if (hit == null || relations == null || relations.every((r) => (hit as any)[r] !== undefined)) {
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
    // EntityClass<T> is structural; a mismatched token would file the row in
    // the wrong FLUSH_ORDER bucket.
    if (entity.constructor !== cls) {
      throw new Error(`set(${cls.name}) called with a ${entity.constructor.name} instance`);
    }
    this.bucket(this.cache, cls).set(entity.id, entity);
    this.bucket(this.dirty, cls).set(entity.id, entity);
  }

  async flush(): Promise<void> {
    for (const cls of this.flushOrder) {
      const bucket = this.dirty.get(cls.name);
      if (bucket == null || bucket.size === 0) continue;
      await this.store.upsert([...bucket.values()]);
      bucket.clear();
    }
  }
}

/**
 * In-memory IEntityCache for unit tests: plain Maps, no Postgres. `get()`
 * hands back the live object regardless of `relations`, which mirrors how
 * entities behave inside one batch.
 */
export class InMemoryCache implements IEntityCache {
  store = new Map<string, Map<string, Entity>>();
  warnings: string[] = [];
  infos: string[] = [];
  errors: string[] = [];
  log: CacheLogger = {
    warn: (msg: string) => this.warnings.push(msg),
    info: (msg: string) => this.infos.push(msg),
    error: (msg: string) => this.errors.push(msg),
  };

  protected bucket(name: string): Map<string, Entity> {
    let b = this.store.get(name);
    if (b == null) {
      b = new Map();
      this.store.set(name, b);
    }
    return b;
  }

  async get<T extends Entity>(cls: EntityClass<T>, id: string, _relations?: string[]): Promise<T | undefined> {
    return this.bucket(cls.name).get(id) as T | undefined;
  }

  set<T extends Entity>(cls: EntityClass<T>, entity: T): void {
    this.bucket(cls.name).set(entity.id, entity);
  }

  async flush(): Promise<void> {}

  all<T extends Entity>(cls: EntityClass<T>): T[] {
    return [...this.bucket(cls.name).values()] as T[];
  }
}
