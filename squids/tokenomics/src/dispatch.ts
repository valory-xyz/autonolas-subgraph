import type { EventMeta, IEntityCache } from "@olas/squid-shared";
import * as olas from "./abi/OLAS/events";
import { CHAIN } from "./constants";
import { handleTransfer } from "./handlers";

type Log = { topics: string[]; data: string };

export async function dispatch(
  cache: IEntityCache,
  meta: EventMeta,
  log: Log,
): Promise<void> {
  if (meta.address !== CHAIN.olas || log.topics[0] !== olas.Transfer.topic)
    return;
  await handleTransfer(cache, meta, olas.Transfer.decode(log));
}
