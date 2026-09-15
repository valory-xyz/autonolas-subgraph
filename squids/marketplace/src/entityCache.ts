import type { Store } from "@subsquid/typeorm-store";
import {
  EntityCache as SharedEntityCache,
  assertFlushOrderExhaustive,
  type EntityClass,
} from "@olas/squid-shared";
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

export type { CacheLogger, Entity, EntityClass, IEntityCache } from "@olas/squid-shared";

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

// Runs at module load (a value import in tests/entityCache.test.ts makes
// this run in CI).
assertFlushOrderExhaustive(models, FLUSH_ORDER);

/**
 * Read-through cache over the TypeORM store with deferred, FK-ordered
 * writes — the shared implementation with this squid's FLUSH_ORDER. See
 * @olas/squid-shared for the relation-loading rules.
 */
export class EntityCache extends SharedEntityCache {
  constructor(store: Store) {
    super(store, FLUSH_ORDER);
  }
}
