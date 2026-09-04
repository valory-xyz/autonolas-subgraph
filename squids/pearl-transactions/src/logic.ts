// Pure functions — no store, no RPC, no SQD types. Everything here is a
// total function of its arguments so it can be unit-tested directly
// (tests/logic.test.ts). The store-touching half lives in handlers.ts.

import { FundsCategory } from "./model";
import {
  ROLE_AGENT,
  ROLE_AGENT_EOA,
  ROLE_MASTER,
  ROLE_MASTER_EOA,
  ROLE_STAKING,
  DAY_SECONDS,
} from "./constants";

// --- ID helpers -------------------------------------------------------
//
// The subgraph concatenated Bytes (`tx.hash.concatI32(logIndex)`); ids here
// are strings, so the same components are joined with "-". Every id is
// lowercase because SQD lowercases addresses and tx hashes.

export function eventId(txHash: string, logIndex: number): string {
  return `${txHash}-${logIndex}`;
}

/** ServicesEvicted is one event affecting many services — needs a sub-index.
 * The slot is a separate segment, not `logIndex + i`: the latter would
 * collide with any other event in the same tx whose logIndex falls in
 * [logIndex+1, logIndex+K-1] and silently overwrite its row. */
export function evictionRowId(
  txHash: string,
  logIndex: number,
  slot: number
): string {
  return `${txHash}-${logIndex}-${slot}`;
}

/** SAFE_DEPLOYED is synthetic (no log of its own) — one per Master Safe. */
export function safeDeployedId(masterSafe: string): string {
  return `safe-deployed-${masterSafe}`;
}

export function serviceEntityId(serviceId: bigint): string {
  return serviceId.toString();
}

export function dailyServiceFundsId(serviceId: bigint, day: bigint): string {
  return `${serviceId.toString()}-${day.toString()}`;
}

export function tokenBalanceId(safe: string, token: string): string {
  return `${safe}-${token}`;
}

export function agentFundingEventId(
  txHash: string,
  masterSafeId: string,
  serviceId: string
): string {
  return `${txHash}-${masterSafeId}-${serviceId}`;
}

// --- Day bucketing ----------------------------------------------------

/** UTC midnight, matching the subgraph's `timestamp / 86400 * 86400`. */
export function dayTimestamp(timestamp: bigint): bigint {
  return (timestamp / DAY_SECONDS) * DAY_SECONDS;
}

// --- classifyTransfer -------------------------------------------------

/** A row of the tracked-address table, as classify() needs to see it. */
export interface TrackedInfo {
  id: string;
  role: string;
  masterSafeId: string | null;
  serviceId: string | null;
}

export interface ClassifyInput {
  fromTracked: TrackedInfo | null;
  toTracked: TrackedInfo | null;
  fromIsSrtu: boolean;
  toIsSrtu: boolean;
  /** Whether `from` is the ServiceRegistryL2 contract itself. */
  fromIsServiceRegistry: boolean;
  /**
   * MasterSafe.setupTransferSeen for the recipient. Only consulted when
   * `to` is a MASTER and `from` is its MASTER_EOA, so callers may pass
   * `false` in every other case rather than loading the entity — that
   * guard is the whole point of the field ordering here.
   */
  toMasterSetupTransferSeen: boolean;
}

export interface ClassifyResult {
  category: FundsCategory;
  serviceId: string | null;
  masterSafeId: string | null;
  agentSafeId: string | null;
  /**
   * Set ONLY for Master Safe -> Master Safe (funds migration between Pearl
   * installs): the row belongs to the recipient, but the sender's
   * TokenBalance must be debited too.
   */
  senderMasterId: string | null;
}

function result(
  category: FundsCategory,
  serviceId: string | null,
  masterSafeId: string | null,
  agentSafeId: string | null
): ClassifyResult {
  return { category, serviceId, masterSafeId, agentSafeId, senderMasterId: null };
}

/**
 * Route an ERC-20 / native transfer's (from, to) to a FundsCategory.
 *
 * Returns null only when NEITHER side is tracked (and neither is the SRTU)
 * — the ~99.99% chain-wide noise case. If one side is tracked but no
 * specific pattern matches, returns OTHER so the row is kept for the
 * forensic view rather than silently dropped.
 *
 * Ported branch-for-branch from the subgraph's classifyTransfer; the order
 * of the checks is load-bearing.
 */
export function classifyTransfer(input: ClassifyInput): ClassifyResult | null {
  const { fromTracked, toTracked, fromIsSrtu, toIsSrtu } = input;

  // Fast exit: neither side tracked (and not SRTU) -> not ours.
  if (fromTracked == null && toTracked == null && !fromIsSrtu && !toIsSrtu) {
    return null;
  }

  const fromRole = fromTracked?.role ?? "";
  const toRole = toTracked?.role ?? "";

  // Master Safe <-> SRTU transfers are the on-chain bond movement, already
  // booked as the canonical SEMANTIC BondMovement row. A second
  // RAW_TRANSFER row would double-count in any masterSafe-filtered wallet
  // query, so drop it. NB: this early return also means NO TokenBalance
  // delta is applied for these legs — the bond's balance effect is booked
  // by the SRTU handlers instead, exactly once.
  if (fromRole === ROLE_MASTER && toIsSrtu) return null;
  if (fromIsSrtu && toRole === ROLE_MASTER) return null;

  // Master Safe -> Agent Safe / Agent EOA (grouped under AgentFundingEvent).
  if (
    fromRole === ROLE_MASTER &&
    (toRole === ROLE_AGENT || toRole === ROLE_AGENT_EOA)
  ) {
    return result(
      FundsCategory.MASTER_TO_AGENT,
      toTracked!.serviceId,
      fromTracked!.masterSafeId,
      toRole === ROLE_AGENT ? toTracked!.id : null
    );
  }

  // Agent Safe -> Master Safe. The OLAS leg is re-tagged
  // AGENT_OLAS_TO_MASTER by the caller (the token is not visible here);
  // native / non-OLAS stays AGENT_TO_MASTER.
  if (fromRole === ROLE_AGENT && toRole === ROLE_MASTER) {
    return result(
      FundsCategory.AGENT_TO_MASTER,
      fromTracked!.serviceId,
      toTracked!.id,
      fromTracked!.id
    );
  }

  // Staking proxy -> Agent Safe (RAW_TRANSFER reconcile of the
  // semantically-booked reward row).
  if (fromRole === ROLE_STAKING && toRole === ROLE_AGENT) {
    return result(
      FundsCategory.STAKING_REWARD_CLAIM,
      toTracked!.serviceId,
      toTracked!.masterSafeId,
      toTracked!.id
    );
  }

  // Anything -> Master Safe (EOA deposit, app payout, another Master Safe).
  if (toRole === ROLE_MASTER) {
    // ServiceRegistryL2 sends tiny native dust to the Master Safe during
    // terminate / unbond (1-wei refunds sharing a tx with a bond refund).
    // Protocol bookkeeping, not a user deposit -> OTHER.
    if (input.fromIsServiceRegistry) {
      return result(FundsCategory.OTHER, null, toTracked!.id, null);
    }
    if (fromRole === ROLE_MASTER_EOA && !input.toMasterSetupTransferSeen) {
      // First Master EOA -> Master Safe hop after creation.
      return result(FundsCategory.SAFE_SETUP_TRANSFER, null, toTracked!.id, null);
    }
    const res = result(
      FundsCategory.MASTER_FUNDING_IN,
      null,
      toTracked!.id,
      null
    );
    // Master Safe -> Master Safe: the row belongs to the recipient, but the
    // sender's balance must be debited too. (The sender's masterSafe-filtered
    // history intentionally shows no row — same shape as the accepted
    // native-out gap.)
    if (fromRole === ROLE_MASTER) {
      res.senderMasterId = fromTracked!.id;
    }
    return res;
  }

  // Master Safe -> EOA.
  if (fromRole === ROLE_MASTER) {
    return result(FundsCategory.MASTER_WITHDRAWAL, null, fromTracked!.id, null);
  }

  // Agent Safe <-> unknown (treated as app-contract interactions).
  if (fromRole === ROLE_AGENT) {
    return result(
      FundsCategory.AGENT_TO_APP,
      fromTracked!.serviceId,
      fromTracked!.masterSafeId,
      fromTracked!.id
    );
  }
  if (toRole === ROLE_AGENT) {
    return result(
      FundsCategory.APP_TO_AGENT,
      toTracked!.serviceId,
      toTracked!.masterSafeId,
      toTracked!.id
    );
  }

  // Fallback: a tracked side that matched no specific pattern -> OTHER.
  const masterRef =
    fromTracked?.masterSafeId ?? toTracked?.masterSafeId ?? null;
  return result(FundsCategory.OTHER, null, masterRef, null);
}

// --- Dedup helpers ----------------------------------------------------

/** Append `value` if absent. Mirrors the subgraph's manual dedupe loops. */
export function pushUnique<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list : [...list, value];
}

export function mergeUnique<T>(target: T[], extra: T[]): T[] {
  const out = [...target];
  for (const v of extra) if (!out.includes(v)) out.push(v);
  return out;
}

// --- Bond attribution queue (per-transaction, in memory) --------------
//
// The SRTU TokenDeposit / TokenRefund events carry no serviceId, so a bond
// movement can only be tied to a service via same-tx event order. On-chain
// the SRTU event always fires BEFORE its ServiceRegistryL2 counterpart
// (ServiceManager calls *TokenDeposit / *TokenRefund before the registry
// call in every path), so the SRTU handler is the PRODUCER — it creates the
// BondMovement row and enqueues its id — and the registry handler is the
// CONSUMER, dequeuing the oldest pending row.
//
// The subgraph needed three Postgres tables for this (PendingBondCounter,
// PendingBondRow, AgentBondAttributionGuard) because graph-node handlers
// cannot share memory across a transaction's events. A SQD batch handler
// sees a whole block at once and SQD never splits a block across batches,
// so this is a plain Map keyed by tx hash.

export class BondQueue {
  private rows = new Map<string, { bondMovementId: string; done: boolean }[]>();
  /** (txHash, serviceId) pairs whose AGENT_BOND row is already attributed. */
  private agentBondGuard = new Set<string>();

  enqueue(txHash: string, bondMovementId: string): void {
    const q = this.rows.get(txHash);
    if (q == null) this.rows.set(txHash, [{ bondMovementId, done: false }]);
    else q.push({ bondMovementId, done: false });
  }

  /**
   * Pop the oldest not-yet-attributed row for this tx, or null when the
   * queue is empty — a registry event fired without a matching prior
   * TokenDeposit / TokenRefund (e.g. a natively-secured service that never
   * touches SRTU). Not an error: there is simply no row to attribute.
   */
  dequeue(txHash: string): string | null {
    const q = this.rows.get(txHash);
    if (q == null) return null;
    for (const entry of q) {
      if (!entry.done) {
        entry.done = true;
        return entry.bondMovementId;
      }
    }
    return null;
  }

  /**
   * Like dequeue, but at most once per (txHash, serviceId).
   * RegisterInstance fires once per agent instance, while
   * registerAgentsTokenDeposit emits a single TokenDeposit for the combined
   * agent bond — so only one row exists to attribute.
   */
  dequeueAgentBondOnce(txHash: string, serviceId: bigint): string | null {
    const key = `${txHash}-${serviceId.toString()}`;
    if (this.agentBondGuard.has(key)) return null;
    this.agentBondGuard.add(key);
    return this.dequeue(txHash);
  }

  /** Drop state for transactions no longer in flight (end of batch). */
  clear(): void {
    this.rows.clear();
    this.agentBondGuard.clear();
  }
}
