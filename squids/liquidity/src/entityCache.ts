import { assertFlushOrderExhaustive, type EntityClass } from "@olas/squid-shared";
import * as models from "./model";
import { BPTTransfer, DailyFees, IndexerStatus, PoolMetrics, PriceData } from "./model";

/** FK-safe write order: referenced entities before referencing ones. */
export const FLUSH_ORDER: EntityClass<any>[] = [
  PoolMetrics,
  PriceData,
  DailyFees, // -> PoolMetrics
  BPTTransfer, // -> PoolMetrics
  IndexerStatus,
];

assertFlushOrderExhaustive(models, FLUSH_ORDER);
