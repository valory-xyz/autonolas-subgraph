// Entry point: decode-and-dispatch only. Event semantics live in
// src/handlers.ts (unit-tested); pricing in src/pricing.ts; data sources in
// src/processor.ts.
import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { EntityCache, Rpc, eventMeta, lastBlock, lc } from "@olas/squid-shared";
import { dataSource } from "./processor";
import { FLUSH_ORDER } from "./entityCache";
import * as tracker from "./abi/BalanceTrackerFixedPriceNative/events";
import * as h from "./handlers";
import { makePricing, makeSources } from "./pricing";
import { IndexerStatus } from "./model";
import { CHAIN, INDEXER_STATUS_ID, START_BLOCK, type Model } from "./constants";
import type { Ctx } from "./handlers";

const logger = createLogger("sqd:processor:mapping");
const log = {
  warn: (m: string) => logger.warn(m),
  info: (m: string) => logger.info(m),
  error: (m: string) => logger.error(m),
};

const rpc = Rpc.fromEnv(CHAIN.defaultRpc, log);
const { native, olasQuote } = makeSources(rpc, log);
const pricing = makePricing(CHAIN, native, olasQuote, log);
const modelByTracker = new Map<string, Model>(CHAIN.trackers.map((t) => [t.address, t.model]));

// Informational: says once whether RPC_HTTP can serve historical state.
const probed =
  CHAIN.nativeUsdFeed == null
    ? Promise.resolve()
    : rpc.probeArchive(CHAIN.nativeUsdFeed as `0x${string}`, BigInt(START_BLOCK));

run(dataSource, new TypeormDatabase({ supportHotBlocks: true }), async (sqd) => {
  await probed;
  const cache = new EntityCache(sqd.store, FLUSH_ORDER);
  cache.log = log;
  const ctx: Ctx = { cache, chain: CHAIN, pricing, log };

  for (const block of sqd.blocks.map(augmentBlock)) {
    for (const rawLog of block.logs) {
      const meta = eventMeta(block.header, {
        address: rawLog.address,
        transactionHash: rawLog.transactionHash,
        logIndex: rawLog.logIndex,
      });
      const model = modelByTracker.get(meta.address);
      if (model == null) continue;
      const topic0 = rawLog.topics[0];

      if (topic0 === tracker.MechBalanceAdjusted.topic) {
        const e = tracker.MechBalanceAdjusted.decode(rawLog);
        await h.handleMechBalanceAdjusted(ctx, meta, model, {
          mech: lc(e.mech),
          deliveryRate: e.deliveryRate,
          balance: e.balance,
          rateDiff: e.rateDiff,
        });
      } else if (topic0 === tracker.Withdraw.topic) {
        const e = tracker.Withdraw.decode(rawLog);
        await h.handleWithdraw(ctx, meta, model, { account: lc(e.account), amount: e.amount });
      } else if (topic0 === tracker.Drained.topic) {
        const e = tracker.Drained.decode(rawLog);
        await h.handleDrained(ctx, meta, model, { token: lc(e.token), collectedFees: e.collectedFees });
      }
    }
  }

  const last = lastBlock(sqd.blocks);
  if (last != null) {
    cache.set(
      IndexerStatus,
      new IndexerStatus({ id: INDEXER_STATUS_ID, blockNumber: last.number, blockTimestamp: last.timestamp })
    );
  }
  await cache.flush();
});
