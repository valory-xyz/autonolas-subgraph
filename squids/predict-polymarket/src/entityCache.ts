import { Store } from "@subsquid/typeorm-store";
import {
  AgentInstance,
  Bet,
  DailyProfitStatistic,
  DepositWallet,
  Global,
  MarketMetadata,
  MarketParticipant,
  MarketParticipated,
  PayoutRedemptionEntity,
  Question,
  QuestionIdToConditionId,
  QuestionResolution,
  TokenRegistry,
  TraderAgent,
  TraderService,
} from "./model";

type EntityClass<T> = { new (...args: any[]): T; name: string };
type Entity = { id: string };

// FK-safe write order: referenced entities before referencing ones.
// (TypeORM enforces real foreign keys, unlike graph-node/Envio stores.)
const FLUSH_ORDER: EntityClass<any>[] = [
  Global,
  TraderService,
  AgentInstance,
  TraderAgent,
  MarketMetadata,
  Question,
  QuestionIdToConditionId,
  TokenRegistry,
  DepositWallet,
  MarketParticipated,
  MarketParticipant,
  DailyProfitStatistic,
  QuestionResolution,
  Bet,
  PayoutRedemptionEntity,
];

/**
 * Read-through cache over the TypeORM store with deferred, FK-ordered writes.
 * Gives the batch handlers the same get/set semantics the Envio port's
 * context had. Writes are flushed:
 *  - before any cross-entity query (settlement's find-by-question), and
 *  - at the end of every batch.
 */
export class EntityCache {
  private cache = new Map<string, Map<string, Entity | undefined>>();
  private dirty = new Map<string, Map<string, Entity>>();

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

  /**
   * DepositWallet lookup with the traderAgent relation loaded. TypeORM does
   * not load relations on plain get(), so a DW fetched from the DB (created
   * in an earlier batch) would have `traderAgent` undefined — the v2 order
   * handler needs it to resolve the agent behind the maker.
   */
  async getDepositWallet(id: string): Promise<DepositWallet | undefined> {
    const bucket = this.bucket(this.cache, DepositWallet);
    if (bucket.has(id)) return bucket.get(id) as DepositWallet | undefined;
    const fromDb = await this.store.findOne(DepositWallet, {
      where: { id },
      relations: { traderAgent: true },
    });
    bucket.set(id, fromDb);
    return fromDb;
  }

  /** Settlement query: all participants of a market, with traderAgent loaded. */
  async participantsByQuestion(conditionId: string): Promise<MarketParticipant[]> {
    await this.flush();
    const rows = await this.store.find(MarketParticipant, {
      where: { question: { id: conditionId } },
      relations: { traderAgent: true },
    });
    // refresh cache with the DB view (post-flush it is authoritative)
    const bucket = this.bucket(this.cache, MarketParticipant);
    for (const row of rows) bucket.set(row.id, row);
    return rows;
  }

  /** Settlement query: all bets belonging to a participant. */
  async betsByParticipant(participantId: string): Promise<Bet[]> {
    await this.flush();
    const rows = await this.store.find(Bet, {
      where: { marketParticipant: { id: participantId } },
    });
    const bucket = this.bucket(this.cache, Bet);
    for (const row of rows) bucket.set(row.id, row);
    return rows;
  }
}
