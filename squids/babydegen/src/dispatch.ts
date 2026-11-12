// Decode one log and route it to its handler, with graph-node's matching
// rules: a Safe-template event only reaches an address that has a Safe
// instance, and a log whose topics do not fit the handler's signature is
// skipped ("the event parameters do not match the event signature"), not
// an error.

import { lc, type EventMeta } from "@olas/squid-shared";
import * as gaugeManager from "./abi/AeroGaugeManager/events";
import * as aeroNfpm from "./abi/AeroPositionNFTManager/events";
import * as aeroPool from "./abi/AeroV2Pool/events";
import * as aeroFactory from "./abi/AeroV2PoolFactory/events";
import * as erc20 from "./abi/ERC20Detailed/events";
import * as safe from "./abi/GnosisSafe/events";
import * as lifi from "./abi/LiFiDiamond/events";
import * as poolFactory from "./abi/PoolFactory/events";
import * as registry from "./abi/ServiceRegistryL2/events";
import * as nfpm from "./abi/VelodromePositionNFTManager/events";
import * as v2Pool from "./abi/VelodromeV2Pool/events";
import * as cl from "./cl";
import {
  AERO_GAUGE_MANAGER,
  AERO_NFT_MANAGER,
  AERO_V2_STABLE_FACTORY,
  AERO_V2_VOLATILE_FACTORY,
  LIFI_DIAMOND,
  SERVICE_REGISTRY,
  START_BLOCKS,
  TOKENS,
  VELO_NFT_MANAGER,
  VELO_V2_FACTORY,
} from "./constants";
import * as h from "./handlers";
import { SafeDataSource, V2PoolVenue, VeloV2PoolDataSource } from "./model";
import { handleLiFiGenericSwapCompleted } from "./swaps";
import * as v2 from "./v2";

/** The top-level transaction, as the stream or eth_getTransactionByHash gives it. */
export interface RawTransaction {
  from?: string;
  to?: string | null;
  value?: bigint;
  input?: string;
}

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  transactionHash: string;
  /** Present for Transfer and Safe-topic logs (`include: {transaction: true}` or fetched). */
  transaction?: RawTransaction | null;
  /**
   * Every log of the transaction (graph-node's `event.receipt`), for the
   * handlers that set `receipt: true`: token Transfers and ExecutionSuccess.
   */
  receipt?: h.ReceiptLog[] | null;
}

export const TRANSFER_TOPIC = erc20.Transfer.topic;

/**
 * Safe topics, with the subgraph's signatures. `ExecutionSuccess(bytes32,
 * uint256)` is the Safe <=1.3.0 layout with nothing indexed; Safe 1.4.1
 * indexes `txHash`, so its log has two topics and graph-node skips it. The
 * squid skips it too (topic-count check), keeping the subgraph's numbers.
 */
export const SAFE_TOPICS = [safe.SafeReceived.topic, safe.ExecutionSuccess.topic, safe.ExecutionFromModuleSuccess.topic];

export const isSafeTopic = (log: { topics: string[] }) => SAFE_TOPICS.includes(log.topics[0]);

/** Topics of the VeloV2Pool / AeroV2Pool template handlers. */
const POOL_TOPICS = [v2Pool.Mint.topic, aeroPool.Mint.topic, v2Pool.Burn.topic, v2Pool.Transfer.topic];
export const isPoolTopic = (log: { topics: string[] }) => POOL_TOPICS.includes(log.topics[0]);

const AERO_V2_FACTORY_START: Record<string, number> = {
  [AERO_V2_STABLE_FACTORY]: START_BLOCKS.aeroV2StableFactory,
  [AERO_V2_VOLATILE_FACTORY]: START_BLOCKS.aeroV2VolatileFactory,
};

/** Logs whose handlers read `event.transaction` (from / to / value / input). */
export const needsTransaction = (log: { topics: string[] }) => isSafeTopic(log) || log.topics[0] === TRANSFER_TOPIC;

/** Logs whose handlers read `event.receipt`. */
export const needsReceipt = (log: { topics: string[] }) =>
  log.topics[0] === TRANSFER_TOPIC || log.topics[0] === safe.ExecutionSuccess.topic;

function txOf(meta: EventMeta, log: RawLog): h.Tx {
  const tx = log.transaction;
  if (tx == null || tx.from == null || tx.value === undefined || tx.input == null) {
    // Cannot happen with the field selection in processor.ts or a fetched
    // transaction; guard so a selection regression is loud, not silent.
    throw new Error(`log ${meta.txHash}-${meta.logIndex} has no transaction from/to/value/input`);
  }
  return { from: lc(tx.from), to: tx.to == null ? null : lc(tx.to), value: tx.value, input: tx.input };
}

export async function dispatch(ctx: h.Ctx, meta: EventMeta, log: RawLog): Promise<void> {
  const topic = log.topics[0];
  if (meta.address === SERVICE_REGISTRY) {
    if (topic === registry.RegisterInstance.topic) {
      const e = tryDecode(ctx, meta, registry.RegisterInstance, log);
      if (e == null) return;
      await h.handleRegisterInstance(ctx, meta, {
        operator: lc(e.operator),
        serviceId: e.serviceId,
        agentInstance: lc(e.agentInstance),
        agentId: e.agentId,
      });
    } else if (topic === registry.CreateMultisigWithAgents.topic) {
      const e = tryDecode(ctx, meta, registry.CreateMultisigWithAgents, log);
      if (e == null) return;
      await h.handleCreateMultisigWithAgents(ctx, meta, { serviceId: e.serviceId, multisig: lc(e.multisig) });
    }
    return;
  }

  if (topic === TRANSFER_TOPIC && TOKENS.has(meta.address)) {
    const e = tryDecode(ctx, meta, erc20.Transfer, log);
    if (e == null) return;
    await h.handleERC20Transfer(ctx, meta, { from: lc(e.from), to: lc(e.to), value: e.value }, txOf(meta, log), log.receipt ?? null);
    return;
  }

  if (await dispatchPosition(ctx, meta, log)) return;

  if (!isSafeTopic(log)) return;
  if ((await ctx.cache.get(SafeDataSource, meta.address)) == null) return;
  if (topic === safe.SafeReceived.topic) {
    const e = tryDecode(ctx, meta, safe.SafeReceived, log);
    if (e != null) await h.handleSafeReceived(ctx, meta, { sender: lc(e.sender), value: e.value }, txOf(meta, log));
    return;
  }
  if (topic === safe.ExecutionSuccess.topic) {
    if (tryDecode(ctx, meta, safe.ExecutionSuccess, log) == null) return;
    await h.handleExecutionSuccess(ctx, meta, txOf(meta, log), log.receipt ?? null);
    return;
  }
  const e = tryDecode(ctx, meta, safe.ExecutionFromModuleSuccess, log);
  if (e != null) await h.handleExecutionFromModuleSuccess(ctx, meta, { module: lc(e.module) });
}

/**
 * The part-2 data sources: both NFPMs, the v2 factories, the GaugeManager,
 * the LiFi Diamond and the pool templates. True when the log was theirs.
 * Static data sources ignore logs before their startBlock.
 */
async function dispatchPosition(ctx: h.Ctx, meta: EventMeta, log: RawLog): Promise<boolean> {
  const at = meta.address;
  const topic = log.topics[0];
  const block = Number(meta.blockNumber);

  if (at === VELO_NFT_MANAGER || (at === AERO_NFT_MANAGER && block >= START_BLOCKS.aeroNftManager)) {
    const increase = at === AERO_NFT_MANAGER ? aeroNfpm.IncreaseLiquidity : nfpm.IncreaseLiquidity;
    if (topic === increase.topic) {
      const e = tryDecode(ctx, meta, increase, log);
      if (e != null) await cl.handleIncreaseLiquidity(ctx, meta, e);
    } else if (topic === nfpm.DecreaseLiquidity.topic) {
      const e = tryDecode(ctx, meta, nfpm.DecreaseLiquidity, log);
      if (e != null) await cl.handleDecreaseLiquidity(ctx, meta, e);
    } else if (topic === nfpm.Collect.topic) {
      const e = tryDecode(ctx, meta, nfpm.Collect, log);
      if (e != null) await cl.handleCollect(ctx, meta, { ...e, recipient: lc(e.recipient) });
    } else if (topic === nfpm.Transfer.topic) {
      const e = tryDecode(ctx, meta, nfpm.Transfer, log);
      if (e != null) await cl.handleNFTTransfer(ctx, meta, { from: lc(e.from), to: lc(e.to), tokenId: e.tokenId });
    }
    return true;
  }

  if (at === VELO_V2_FACTORY) {
    const e = tryDecode(ctx, meta, poolFactory.PoolCreated, log);
    if (e != null) await v2.handleVeloV2PoolCreated(ctx, meta, { token0: lc(e.token0), token1: lc(e.token1), pool: lc(e.pool) });
    return true;
  }

  const factoryStart = AERO_V2_FACTORY_START[at];
  if (factoryStart !== undefined) {
    if (block < factoryStart) return true;
    const e = tryDecode(ctx, meta, aeroFactory.PoolCreated, log);
    if (e != null) await v2.handleAeroV2PoolCreated(ctx, meta, { token0: lc(e.token0), token1: lc(e.token1), pool: lc(e.pool) });
    return true;
  }

  if (at === AERO_GAUGE_MANAGER) {
    if (block < START_BLOCKS.aeroGaugeManager) return true;
    const e = tryDecode(ctx, meta, gaugeManager.GaugeCreated, log);
    if (e != null) await v2.handleAeroGaugeCreated(ctx, meta, { target: lc(e._target), gauge: lc(e._gauge) });
    return true;
  }

  if (at === LIFI_DIAMOND) {
    const e = tryDecode(ctx, meta, lifi.LiFiGenericSwapCompleted, log);
    if (e != null) {
      await handleLiFiGenericSwapCompleted(ctx, meta, {
        transactionId: lc(e.transactionId),
        integrator: e.integrator,
        receiver: lc(e.receiver),
        fromAssetId: lc(e.fromAssetId),
        toAssetId: lc(e.toAssetId),
        fromAmount: e.fromAmount,
        toAmount: e.toAmount,
      });
    }
    return true;
  }

  if (!isPoolTopic(log)) return false;
  // A pool can only be in one template set (each set comes from its own factories).
  const velo = (await ctx.cache.get(VeloV2PoolDataSource, at)) != null;
  const aero = !velo && (await ctx.cache.get(V2PoolVenue, at)) != null;
  if (!velo && !aero) return false;
  if (topic === v2Pool.Transfer.topic) {
    const e = tryDecode(ctx, meta, v2Pool.Transfer, log);
    if (e != null) await v2.handleVeloV2Transfer(ctx, meta, { from: lc(e.from), to: lc(e.to), value: e.value });
  } else if (topic === v2Pool.Burn.topic) {
    const e = tryDecode(ctx, meta, v2Pool.Burn, log);
    if (e != null) await v2.handleVeloV2Burn(ctx, meta, { sender: lc(e.sender), to: lc(e.to), amount0: e.amount0, amount1: e.amount1 });
  } else {
    const mint = velo ? v2Pool.Mint : aeroPool.Mint;
    const e = topic === mint.topic ? tryDecode(ctx, meta, mint, log) : null;
    if (e != null) await v2.handleV2Mint(ctx, meta, e);
  }
  return true;
}

function tryDecode<T>(
  ctx: h.Ctx,
  meta: EventMeta,
  event: { is(log: RawLog): boolean; decode(log: RawLog): T },
  log: RawLog,
): T | null {
  if (!event.is(log)) return null;
  try {
    return event.decode(log);
  } catch (err) {
    ctx.log.warn(`skipping undecodable log ${meta.txHash}-${meta.logIndex} from ${meta.address}: ${(err as Error).message}`);
    return null;
  }
}
