// In-memory implementation of IEntityCache for unit tests: plain Maps, no
// Postgres. The two settlement queries filter in JS over live object
// references, which mirrors how relations behave inside a real batch.
import {
  Entity,
  EntityClass,
  IEntityCache,
  CacheLogger,
} from "../src/entityCache";
import { Bet, DepositWallet, MarketParticipant } from "../src/model";

export class InMemoryCache implements IEntityCache {
  store = new Map<string, Map<string, Entity>>();
  warnings: string[] = [];
  log: CacheLogger = { warn: (msg: string) => this.warnings.push(msg) };

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
    this.bucket(cls.name).set(entity.id, entity);
  }

  async flush(): Promise<void> {}

  async getDepositWallet(id: string): Promise<DepositWallet | undefined> {
    return this.get(DepositWallet, id);
  }

  async participantsByQuestion(conditionId: string): Promise<MarketParticipant[]> {
    return [...this.bucket(MarketParticipant.name).values()].filter(
      (p) => (p as MarketParticipant).question?.id === conditionId,
    ) as MarketParticipant[];
  }

  async betsByParticipant(participantId: string): Promise<Bet[]> {
    return [...this.bucket(Bet.name).values()].filter(
      (b) => (b as Bet).marketParticipant?.id === participantId,
    ) as Bet[];
  }

  all<T extends Entity>(cls: EntityClass<T>): T[] {
    return [...this.bucket(cls.name).values()] as T[];
  }
}
