// In-memory implementation of IEntityCache for unit tests: plain Maps, no
// Postgres. Relations are held as live object references, which mirrors how
// they behave inside a real batch.
import {
  CacheLogger,
  Entity,
  EntityClass,
  IEntityCache,
} from "../src/entityCache";
import { Service } from "../src/model";

export class InMemoryCache implements IEntityCache {
  store = new Map<string, Map<string, Entity>>();
  warnings: string[] = [];
  infos: string[] = [];
  known = new Set<string>();
  log: CacheLogger = {
    warn: (msg: string) => this.warnings.push(msg),
    info: (msg: string) => this.infos.push(msg),
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
  ): Promise<T | undefined> {
    return this.bucket(cls.name).get(id) as T | undefined;
  }

  set<T extends Entity>(cls: EntityClass<T>, entity: T): void {
    if (entity.constructor !== cls) {
      throw new Error(
        `set(${cls.name}) called with a ${entity.constructor.name} instance`,
      );
    }
    this.bucket(cls.name).set(entity.id, entity);
  }

  async findServiceByErc8004Agent(agentId: string): Promise<Service | undefined> {
    return this.all(Service).find((s) => s.erc8004Agent?.id === agentId);
  }

  async flush(): Promise<void> {}

  async isKnownMultisig(address: string): Promise<boolean> {
    return this.known.has(address);
  }

  async addKnownMultisig(address: string): Promise<void> {
    this.known.add(address);
  }

  all<T extends Entity>(cls: EntityClass<T>): T[] {
    return [...this.bucket(cls.name).values()] as T[];
  }
}
