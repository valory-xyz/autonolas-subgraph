import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { eventMeta } from "@olas/squid-shared";
import { dataSource } from "./processor";
import { EntityCache } from "./entityCache";
import { Service } from "./model";
import { CHAIN } from "./constants";
import { assertArchiveRpc, StakingReader, transport } from "./rpc";
import { dispatch } from "./dispatch";
import type { Ctx } from "./handlers";

const log = createLogger("sqd:staking");
const rpc = transport(process.env.RPC_HTTP ?? CHAIN.defaultRpc);
const reader = new StakingReader(rpc, (message) => log.warn(message));
let archiveChecked: Promise<void> | undefined;
run(
  dataSource,
  new TypeormDatabase({ supportHotBlocks: true }),
  async (ctx) => {
    archiveChecked ??= assertArchiveRpc(
      rpc,
      CHAIN.stakingFactory,
      CHAIN.startBlock,
    );
    await archiveChecked;
    // No state survives a batch: a hot-block rollback or retry reloads canonical DB state.
    const cache = new EntityCache(ctx.store);
    cache.log = log;
    const services = new Map(
      (await ctx.store.find(Service)).map((s) => [s.id, s]),
    );
    const handlerContext: Ctx = {
      cache,
      services,
      lockedOlas: reader.lockedOlas.bind(reader),
    };
    for (const block of ctx.blocks.map(augmentBlock)) {
      // Explicit log order matters for factory discovery and multiple transitions in a block.
      for (const entry of [...block.logs].sort(
        (a, b) => a.logIndex - b.logIndex,
      )) {
        await dispatch(handlerContext, eventMeta(block.header, entry), entry, reader);
      }
    }
    await cache.flush();
  },
);
