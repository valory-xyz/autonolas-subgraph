// Entry point. Runs the SDK processor in a loop: each run subscribes to the
// safes tracked in the database, ends right after a block that registers a
// new Basius service (sources.ts), and the next run picks the new safes up
// from the block after it. Handler semantics live in handlers.ts/block.ts.

import "dotenv/config";
import { Processor } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import type { DataSource, EntityManager } from "typeorm";
import { fetchMissingLogs, processBlock, type StreamState } from "./block";
import { CHAIN, SERVICE_REGISTRY } from "./constants";
import { EntityCache } from "./entityCache";
import type { Ctx } from "./handlers";
import { buildDataSource } from "./processor";
import { assertArchiveRpc, ChainReader, transport } from "./rpc";
import { cuttingSource, serviceIdFromKey, type CutState, type Tracked } from "./sources";

const log = createLogger("sqd:babydegen");
const chain = new ChainReader(transport(process.env.RPC_HTTP ?? CHAIN.defaultRpc));

async function loadTracked(em: EntityManager): Promise<Tracked> {
  const ids = async (table: string) =>
    ((await em.query(`SELECT id FROM "${table}"`)) as { id: string }[]).map((r) => r.id);
  return {
    basiusServiceIds: new Set((await ids("service_registration")).map(serviceIdFromKey)),
    serviceSafes: new Set(await ids("service")),
    safeHosts: new Set(await ids("safe_data_source")),
  };
}

/** TypeormDatabase that reads the tracked safes once connected, before streaming starts. */
class TrackingDatabase extends TypeormDatabase {
  tracked?: Tracked;
  private dataSource?: DataSource;

  protected override async initializeDataSource(): Promise<DataSource> {
    this.dataSource = await super.initializeDataSource();
    return this.dataSource;
  }

  override async connect() {
    const state = await super.connect();
    this.tracked = await loadTracked(this.dataSource!.manager);
    return state;
  }
}

/** A source built on first use, i.e. after the processor connected the database. */
function lazySource(db: TrackingDatabase, cut: CutState) {
  let src: ReturnType<typeof buildDataSource> | undefined;
  const get = () => {
    if (db.tracked == null) throw new Error("data source used before the database connected");
    src ??= cuttingSource(buildDataSource(db.tracked), db.tracked, cut);
    return src;
  };
  return {
    getHead: () => get().getHead(),
    getFinalizedHead: () => get().getFinalizedHead(),
    getStream: (req: Parameters<ReturnType<typeof buildDataSource>["getStream"]>[0]) => get().getStream(req),
    getFinalizedStream: (req: Parameters<ReturnType<typeof buildDataSource>["getFinalizedStream"]>[0]) =>
      get().getFinalizedStream(req),
  };
}

let archiveChecked: Promise<void> | undefined;

async function runOnce(): Promise<boolean> {
  const cut: CutState = { cut: false };
  const db = new TrackingDatabase({ supportHotBlocks: true, isolationLevel: "READ COMMITTED" });
  let stream: StreamState | undefined;
  const processor = new Processor(lazySource(db, cut), db, async (ctx) => {
    archiveChecked ??= assertArchiveRpc(chain, SERVICE_REGISTRY, CHAIN.startBlock);
    await archiveChecked;
    stream ??= { serviceSafes: new Set(db.tracked!.serviceSafes), safeHosts: new Set(db.tracked!.safeHosts) };
    // No entity state survives a batch: a retry or hot-block rollback reloads it.
    const cache = new EntityCache(ctx.store);
    cache.log = log;
    const hctx: Ctx = { cache, chain, log, spawnedSafes: [], newServices: [], spawnedPools: [] };
    for (const block of ctx.blocks.map(augmentBlock)) {
      await processBlock(hctx, { header: block.header, logs: block.logs }, stream, (hash, services, hosts) =>
        fetchMissingLogs(chain, hash, services, hosts),
      );
    }
    await cache.flush();
  });
  try {
    await processor.run();
  } finally {
    await db.disconnect();
  }
  if (cut.cut) log.info("new Basius safe registered; restarting with it subscribed");
  return cut.cut;
}

async function main(): Promise<void> {
  while (await runOnce()) {
    // next run resumes from the block after the cut
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    log.fatal(err);
    process.exit(1);
  },
);
