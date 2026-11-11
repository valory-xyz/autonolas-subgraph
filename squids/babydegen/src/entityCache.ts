import * as models from "./model";
import type { Store } from "@subsquid/typeorm-store";
import {
  EntityCache as SharedEntityCache,
  InMemoryCache,
  assertFlushOrderExhaustive,
  type EntityClass,
  type IEntityCache,
} from "@olas/squid-shared";
import {
  AddressType,
  AeroGauge,
  AgentPortfolio,
  AgentSwapBuffer,
  ClaimableRewardBeforeBlock,
  CreditedRewardClaim,
  FundingBalance,
  NFTPositionMapping,
  PendingMintPosition,
  PriceSource,
  PriceUpdate,
  ProtocolPosition,
  SafeDataSource,
  Service,
  ServiceIndex,
  ServiceRegistration,
  ServiceRegistry,
  SwapTransaction,
  Token,
  TokenBalance,
  UncollectedPrincipal,
  V2PoolVenue,
  VeloV2PoolDataSource,
} from "./model";

/** Referenced entities first: Postgres enforces the FKs at upsert. */
export const FLUSH_ORDER: EntityClass<{ id: string }>[] = [
  Service,
  ServiceRegistration,
  ServiceIndex,
  ServiceRegistry,
  SafeDataSource,
  AddressType,
  FundingBalance,
  AgentPortfolio,
  TokenBalance,
  Token,
  PriceSource,
  PriceUpdate,
  ProtocolPosition,
  PendingMintPosition,
  SwapTransaction,
  AgentSwapBuffer,
  NFTPositionMapping,
  UncollectedPrincipal,
  ClaimableRewardBeforeBlock,
  CreditedRewardClaim,
  AeroGauge,
  V2PoolVenue,
  VeloV2PoolDataSource,
];
assertFlushOrderExhaustive(models, FLUSH_ORDER);

/** IEntityCache plus graph-node's `store.remove`. */
export interface Cache extends IEntityCache {
  remove<T extends { id: string }>(cls: EntityClass<T>, id: string): void;
}

type Removable = { remove(cls: EntityClass<any>, ids: string[]): Promise<void> };

export class EntityCache extends SharedEntityCache implements Cache {
  /** class name -> ids removed since the last flush (and not set again). */
  private removed = new Map<string, { cls: EntityClass<any>; ids: Set<string> }>();

  constructor(private readonly typeormStore: Store) {
    super(typeormStore, FLUSH_ORDER);
  }

  override async get<T extends { id: string }>(cls: EntityClass<T>, id: string, relations?: string[]): Promise<T | undefined> {
    if (this.removed.get(cls.name)?.ids.has(id)) return undefined;
    return super.get(cls, id, relations);
  }

  override set<T extends { id: string }>(cls: EntityClass<T>, entity: T): void {
    this.removed.get(cls.name)?.ids.delete(entity.id);
    super.set(cls, entity);
  }

  remove<T extends { id: string }>(cls: EntityClass<T>, id: string): void {
    let entry = this.removed.get(cls.name);
    if (entry == null) {
      entry = { cls, ids: new Set() };
      this.removed.set(cls.name, entry);
    }
    entry.ids.add(id);
  }

  /** Upserts first (a row set and then removed in the batch is written), then deletes. */
  override async flush(): Promise<void> {
    await super.flush();
    for (const { cls, ids } of this.removed.values()) {
      if (ids.size > 0) await (this.typeormStore as unknown as Removable).remove(cls, [...ids]);
      ids.clear();
    }
  }
}

/** InMemoryCache with `remove`, for tests. */
export class TestCache extends InMemoryCache implements Cache {
  remove<T extends { id: string }>(cls: EntityClass<T>, id: string): void {
    this.bucket(cls.name).delete(id);
  }
}
