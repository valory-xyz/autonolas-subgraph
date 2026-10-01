import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { eventMeta } from "@olas/squid-shared";
import { dataSource } from "./processor";
import { EntityCache } from "./entityCache";
import { dispatch } from "./dispatch";

const logger = createLogger("sqd:tokenomics");
run(
  dataSource,
  new TypeormDatabase({ supportHotBlocks: true }),
  async (ctx) => {
    // Fresh per batch: retries and hot-block rollback reload canonical balances.
    const cache = new EntityCache(ctx.store);
    cache.log = logger;
    for (const block of ctx.blocks.map(augmentBlock)) {
      for (const log of [...block.logs].sort(
        (left, right) => left.logIndex - right.logIndex,
      )) {
        await dispatch(cache, eventMeta(block.header, log), log);
      }
    }
    await cache.flush();
  },
);
