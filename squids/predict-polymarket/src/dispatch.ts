// Decode-and-dispatch for one log, testable without starting the processor.
// STUB: to be implemented (main.ts's loop body moves here and main.ts calls
// it), adding Protocol V2 routing for ExchangeV3 and PositionManager.
import { IEntityCache } from "./entityCache";

export type DispatchBlock = { number: number; timestamp: number };
export type DispatchLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  logIndex: number;
};

export async function dispatchLog(
  _cache: IEntityCache,
  _block: DispatchBlock,
  _log: DispatchLog,
): Promise<void> {
  throw new Error("not implemented");
}
