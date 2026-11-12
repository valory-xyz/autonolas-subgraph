// Decode one log and route it to its handler, with graph-node's matching
// rules: a Safe-template event only reaches an address that has a Safe
// instance, and a log whose topics do not fit the handler's signature is
// skipped ("the event parameters do not match the event signature"), not
// an error.

import { lc, type EventMeta } from "@olas/squid-shared";
import * as erc20 from "./abi/ERC20Detailed/events";
import * as safe from "./abi/GnosisSafe/events";
import * as registry from "./abi/ServiceRegistryL2/events";
import { SERVICE_REGISTRY, TOKENS } from "./constants";
import * as h from "./handlers";
import { SafeDataSource } from "./model";

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
