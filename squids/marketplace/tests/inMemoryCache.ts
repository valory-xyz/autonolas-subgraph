// In-memory implementation of IEntityCache for unit tests: plain Maps, no
// Postgres. `get()` hands back the live object regardless of `relations`,
// which mirrors how entities behave inside one batch (the production
// cache's relation-loading path is exercised against a real store, not
// here).
import {
  CacheLogger,
  Entity,
  EntityClass,
  IEntityCache,
} from "../src/entityCache";
import { Ctx, newBatchState } from "../src/handlers";
import { NO_PRICE_SOURCE, NativePriceSource } from "../src/fee";
import { EventMeta } from "../src/logic";

export class InMemoryCache implements IEntityCache {
  store = new Map<string, Map<string, Entity>>();
  warnings: string[] = [];
  errors: string[] = [];
  log: CacheLogger = {
    warn: (msg: string) => this.warnings.push(msg),
    info: () => {},
    error: (msg: string) => this.errors.push(msg),
  };

  private bucket(name: string): Map<string, Entity> {
    let b = this.store.get(name);
    if (b == null) {
      b = new Map();
      this.store.set(name, b);
    }
    return b;
  }

  async get<T extends Entity>(
    cls: EntityClass<T>,
    id: string,
    _relations?: string[]
  ): Promise<T | undefined> {
    return this.bucket(cls.name).get(id) as T | undefined;
  }

  set<T extends Entity>(cls: EntityClass<T>, entity: T): void {
    this.bucket(cls.name).set(entity.id, entity);
  }

  async flush(): Promise<void> {}

  all<T extends Entity>(cls: EntityClass<T>): T[] {
    return [...this.bucket(cls.name).values()] as T[];
  }

  count(cls: EntityClass<any>): number {
    return this.bucket(cls.name).size;
  }
}

/** A fixed price: $2,000.00 per native unit, 8-decimal feed. */
export const TWO_K_USD: NativePriceSource = {
  usdPerNative: async () => ({ answer: 200_000_000_000n, decimals: 8 }),
};

/**
 * A fresh handler context — i.e. a new batch — over a cache. Reusing the
 * cache across calls simulates "written by an earlier batch"; the per-batch
 * pending maps start empty each time.
 */
export function newBatch(
  cache: InMemoryCache,
  price: NativePriceSource = TWO_K_USD
): Ctx {
  return { cache, log: cache.log, price, ...newBatchState() };
}

export const MARKETPLACE = "0xa45e64d13a30a51b91ae0eb182e88a40e9b18ed8";
export const FACTORY_NATIVE = "0x04b0007b2afb398015b76e5f22993a1fddf83644";
export const FACTORY_USDC = "0x7fd1f4b764fa41d19fe3f63c85d12bf64d2bbf68";

let txCounter = 0;
export function resetTxCounter(): void {
  txCounter = 0;
}

/** EventMeta with a fresh tx hash per call unless `txHash` is given. */
export function meta(
  over: Partial<EventMeta> & { marketplaceTx?: boolean } = {}
): EventMeta {
  const { marketplaceTx, ...rest } = over;
  if (rest.txHash == null) txCounter += 1;
  return {
    blockNumber: 59_600_000n + BigInt(txCounter),
    blockTimestamp: 1_789_000_000n + BigInt(txCounter),
    txHash: `0x${String(txCounter).padStart(64, "0")}`,
    logIndex: 0,
    txFrom: "0xfeed000000000000000000000000000000000001",
    txTo: marketplaceTx ? MARKETPLACE : "0x0000000000000000000000000000000000000dad",
    address: "0x0000000000000000000000000000000000c0ffee",
    ...rest,
  };
}

export const rid = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
export const payload32 = (n: number) => `0x${n.toString(16).padStart(64, "a")}`;
