import { assertFlushOrderExhaustive, type EntityClass } from "@olas/squid-shared";
import * as models from "./model";
import {
  DailyTotals,
  DrainEvent,
  DrainTotals,
  Global,
  IndexerStatus,
  Mech,
  MechDaily,
  MechModel,
  MechTransaction,
} from "./model";

/** FK-safe write order: referenced entities before referencing ones. */
export const FLUSH_ORDER: EntityClass<any>[] = [
  Global,
  Mech,
  MechModel, // -> Mech
  MechTransaction, // -> Mech
  DailyTotals,
  MechDaily, // -> Mech
  DrainTotals,
  DrainEvent,
  IndexerStatus,
];

assertFlushOrderExhaustive(models, FLUSH_ORDER);
