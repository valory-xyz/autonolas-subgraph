// Entry point: decode-and-dispatch only. Event semantics live in
// src/handlers.ts (unit-tested); the data sources are in src/processor.ts.
import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import {
  BalancerPool,
  ChainlinkSource,
  EntityCache,
  Rpc,
  UniswapV2Pair,
  eventMeta,
  lastBlock,
  lc,
  type UsdPriceSource,
} from "@olas/squid-shared";
import { dataSource } from "./processor";
import { FLUSH_ORDER } from "./entityCache";
import * as pair from "./abi/UniswapV2Pair/events";
import * as vault from "./abi/BalancerV2Vault/events";
import * as h from "./handlers";
import { IndexerStatus } from "./model";
import { CHAIN, INDEXER_STATUS_ID, START_BLOCK, type PoolConfig } from "./constants";
import type { Ctx } from "./handlers";

const logger = createLogger("sqd:processor:mapping");
const log = {
  warn: (m: string) => logger.warn(m),
  info: (m: string) => logger.info(m),
  error: (m: string) => logger.error(m),
};

const rpc = Rpc.fromEnv(CHAIN.defaultRpc, log);
const price: UsdPriceSource | null =
  CHAIN.nativeUsdFeed == null ? null : new ChainlinkSource(rpc, CHAIN.nativeUsdFeed as `0x${string}`, log);

const pools = new Map<string, PoolConfig>(CHAIN.pools.map((p) => [p.address, p]));
const balancerReaders = new Map<string, BalancerPool>();
const pairReaders = new Map<string, UniswapV2Pair>();
const balancer = (pool: string) => {
  let r = balancerReaders.get(pool);
  if (r == null) {
    r = new BalancerPool(rpc, pool as `0x${string}`, CHAIN.balancerVault as `0x${string}`);
    balancerReaders.set(pool, r);
  }
  return r;
};
const pairReader = (pool: string) => {
  let r = pairReaders.get(pool);
  if (r == null) {
    r = new UniswapV2Pair(rpc, pool as `0x${string}`);
    pairReaders.set(pool, r);
  }
  return r;
};

// Informational: says once whether RPC_HTTP can serve historical state.
const probed = rpc.probeArchive(CHAIN.pools[0].address as `0x${string}`, BigInt(START_BLOCK));

run(dataSource, new TypeormDatabase({ supportHotBlocks: true }), async (sqd) => {
  await probed;
  const cache = new EntityCache(sqd.store, FLUSH_ORDER);
  cache.log = log;
  const ctx: Ctx = { cache, pools, balancer, pair: pairReader, price, chainName: CHAIN.name };

  for (const block of sqd.blocks.map(augmentBlock)) {
    for (const rawLog of block.logs) {
      // Only the fields the shared helper needs; this squid does not request
      // transactions, so the typed Log's `transaction` shape must not leak in.
      const meta = eventMeta(block.header, {
        address: rawLog.address,
        transactionHash: rawLog.transactionHash,
        logIndex: rawLog.logIndex,
      });
      const topic0 = rawLog.topics[0];

      if (pools.has(meta.address)) {
        if (topic0 === pair.Transfer.topic) {
          const e = pair.Transfer.decode(rawLog);
          await h.handleLpTransfer(ctx, meta, { from: lc(e.from), to: lc(e.to), value: e.value });
        } else if (topic0 === pair.Sync.topic) {
          const e = pair.Sync.decode(rawLog);
          await h.handleUniswapSync(ctx, meta, { reserve0: e.reserve0, reserve1: e.reserve1 });
        } else if (topic0 === pair.Swap.topic) {
          const e = pair.Swap.decode(rawLog);
          await h.handleUniswapSwap(ctx, meta, { amount0In: e.amount0In, amount1In: e.amount1In });
        }
        continue;
      }

      if (meta.address === CHAIN.balancerVault && topic0 === vault.Swap.topic) {
        const e = vault.Swap.decode(rawLog);
        await h.handleVaultSwap(ctx, meta, {
          poolId: e.poolId,
          tokenIn: lc(e.tokenIn),
          tokenOut: lc(e.tokenOut),
          amountIn: e.amountIn,
          amountOut: e.amountOut,
        });
      }
    }
  }

  const last = lastBlock(sqd.blocks);
  if (last != null) {
    cache.set(
      IndexerStatus,
      new IndexerStatus({ id: INDEXER_STATUS_ID, blockNumber: last.number, blockTimestamp: last.timestamp }),
    );
  }
  await cache.flush();
});
