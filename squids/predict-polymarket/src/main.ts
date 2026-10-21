// Entry point: runs the batch loop. Decode-and-dispatch lives in
// src/dispatch.ts; event semantics in src/handlers.ts (unit-tested); shared
// aggregation logic in src/logic.ts.
import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { dataSource } from "./processor";
import { EntityCache } from "./entityCache";
import { dispatchLog } from "./dispatch";

// run() ctx carries no logger (unlike the old processor.run); create our own.
const logger = createLogger("sqd:processor:mapping");

run(
  dataSource,
  new TypeormDatabase({ supportHotBlocks: true, isolationLevel: 'READ COMMITTED' }),
  async (ctx) => {
    const cache = new EntityCache(ctx.store);
    cache.log = logger;

    for (const block of ctx.blocks.map(augmentBlock)) {
      for (const log of block.logs) {
        await dispatchLog(cache, block.header, log);
      }
    }

    await cache.flush();
  },
);
