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

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  transactionHash: string;
  /** Present for Safe-topic logs (`include: {transaction: true}` or fetched). */
  transaction?: { to?: string | null; value?: bigint } | null;
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

export async function dispatch(ctx: h.Ctx, meta: EventMeta, log: RawLog): Promise<void> {
  const topic = log.topics[0];
  if (meta.address === SERVICE_REGISTRY) {
    if (topic === registry.RegisterInstance.topic) {
      const e = registry.RegisterInstance.decode(log);
      await h.handleRegisterInstance(ctx, meta, { operator: lc(e.operator), serviceId: e.serviceId, agentId: e.agentId });
    } else if (topic === registry.CreateMultisigWithAgents.topic) {
      const e = registry.CreateMultisigWithAgents.decode(log);
      await h.handleCreateMultisigWithAgents(ctx, meta, { serviceId: e.serviceId, multisig: lc(e.multisig) });
    }
    return;
  }

  if (topic === TRANSFER_TOPIC && TOKENS.has(meta.address)) {
    const e = tryDecode(ctx, meta, erc20.Transfer, log);
    if (e != null) await h.handleERC20Transfer(ctx, meta, { from: lc(e.from), to: lc(e.to), value: e.value });
    return;
  }

  if (!isSafeTopic(log)) return;
  if ((await ctx.cache.get(SafeDataSource, meta.address)) == null) return;
  if (topic === safe.SafeReceived.topic) {
    const e = tryDecode(ctx, meta, safe.SafeReceived, log);
    if (e != null) await h.handleSafeReceived(ctx, meta, { sender: lc(e.sender), value: e.value });
    return;
  }
  const decoded =
    topic === safe.ExecutionSuccess.topic
      ? tryDecode(ctx, meta, safe.ExecutionSuccess, log)
      : tryDecode(ctx, meta, safe.ExecutionFromModuleSuccess, log);
  if (decoded == null) return;
  const tx = log.transaction;
  if (tx == null || tx.value === undefined) {
    // Cannot happen with the field selection in processor.ts or a fetched
    // transaction; guard so a selection regression is loud, not $0.
    throw new Error(`Safe execution log ${meta.txHash}-${meta.logIndex} has no transaction to/value`);
  }
  await h.handleSafeExecution(ctx, meta, { to: tx.to == null ? null : lc(tx.to), value: tx.value });
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
