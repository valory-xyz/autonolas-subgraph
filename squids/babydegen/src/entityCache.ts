import * as models from "./model";
import type { Store } from "@subsquid/typeorm-store";
import { EntityCache as SharedEntityCache, assertFlushOrderExhaustive, type EntityClass } from "@olas/squid-shared";
import {
  AddressType,
  AgentPortfolio,
  FundingBalance,
  PriceSource,
  PriceUpdate,
  SafeDataSource,
  Service,
  ServiceIndex,
  ServiceRegistration,
  ServiceRegistry,
  Token,
  TokenBalance,
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
];
assertFlushOrderExhaustive(models, FLUSH_ORDER);

export class EntityCache extends SharedEntityCache {
  constructor(store: Store) {
    super(store, FLUSH_ORDER);
  }
}
