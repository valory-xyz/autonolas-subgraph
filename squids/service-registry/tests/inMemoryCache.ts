// In-memory implementation of IEntityCache for unit tests: the shared
// in-memory cache plus the known-multisig set. Relations are held as live
// object references, which mirrors how they behave inside a real batch.
import { InMemoryCache as SharedInMemoryCache } from "@olas/squid-shared";
import type { Entity, EntityClass, IEntityCache } from "../src/entityCache";

export class InMemoryCache extends SharedInMemoryCache implements IEntityCache {
  known = new Set<string>();

  override set<T extends Entity>(cls: EntityClass<T>, entity: T): void {
    if (entity.constructor !== cls) {
      throw new Error(`set(${cls.name}) called with a ${entity.constructor.name} instance`);
    }
    super.set(cls, entity);
  }

  async isKnownMultisig(address: string): Promise<boolean> {
    return this.known.has(address);
  }

  async addKnownMultisig(address: string): Promise<void> {
    this.known.add(address);
  }
}
