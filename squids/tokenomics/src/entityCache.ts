import type { Store } from "@subsquid/typeorm-store";
import {
  EntityCache as SharedEntityCache,
  assertFlushOrderExhaustive,
  type EntityClass,
} from "@olas/squid-shared";
import * as models from "./model";
import { Token, TokenHolder, Transfer } from "./model";

export const FLUSH_ORDER: EntityClass<{ id: string }>[] = [
  Token,
  TokenHolder,
  Transfer,
];
assertFlushOrderExhaustive(models, FLUSH_ORDER);

export class EntityCache extends SharedEntityCache {
  constructor(store: Store) {
    super(store, FLUSH_ORDER);
  }
}
