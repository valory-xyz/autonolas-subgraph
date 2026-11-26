// PortfolioScheduler (studio portfolioScheduler.ts). graph-node polls at
// n >= start && (n - start) % 1800 == 0, after the block's events; skipped
// poll blocks run before the next streamed block. Never derive time from
// block numbers (Base's block time changes): bisect poll-block headers.

import { CHAIN } from "./constants";
import { calculateGlobalMetrics } from "./globalMetrics";
import { AgentPortfolio, Service, ServiceRegistry } from "./model";
import { SERVICE_REGISTRY_ID } from "./ids";
import { calculatePortfolioMetrics, refreshAllUSDValues } from "./portfolio";
import type { PosCtx } from "./positions";
import type { At } from "./pricing";
import { refreshAllActivePositions } from "./refresh";
import type { BlockHeader, BlockRef } from "./rpc";

export const POLL_START = BigInt(CHAIN.startBlock);
export const POLL_EVERY = 1800n;
const ONE_DAY = 86400n;

export const isPollBlock = (n: bigint) => n >= POLL_START && (n - POLL_START) % POLL_EVERY === 0n;

/** The last poll block strictly before `n`, or null. */
export function lastPollBefore(n: bigint): bigint | null {
  if (n <= POLL_START) return null;
  return POLL_START + ((n - 1n - POLL_START) / POLL_EVERY) * POLL_EVERY;
}

/** The first poll block at or after `n`. */
export function firstPollAtOrAfter(n: bigint): bigint {
  if (n <= POLL_START) return POLL_START;
  return POLL_START + ((n - POLL_START + POLL_EVERY - 1n) / POLL_EVERY) * POLL_EVERY;
}

/** getDayTimestamp: UTC midnight of the timestamp's day. */
export const dayTimestamp = (ts: bigint) => (ts / ONE_DAY) * ONE_DAY;

async function registeredServices(ctx: PosCtx): Promise<string[]> {
  return (await ctx.cache.get(ServiceRegistry, SERVICE_REGISTRY_ID))?.serviceAddresses ?? [];
}

/** isSnapshotDue: a portfolio with no snapshot yet, or one whose last snapshot is on an earlier UTC day. */
function isSnapshotDue(portfolio: AgentPortfolio | undefined, timestamp: bigint): boolean {
  if (portfolio == null) return false;
  if (portfolio.lastSnapshotTimestamp === 0n) return true;
  return dayTimestamp(timestamp) > dayTimestamp(portfolio.lastSnapshotTimestamp);
}

/**
 * calculatePortfolioMetrics(serviceSafe, block, true). The subgraph runs
 * ensureAgentPortfolio between the Service check and the refreshes; it is a
 * no-op here because only a service with a portfolio is due.
 */
export async function snapshotPortfolio(ctx: PosCtx, serviceSafe: string, at: At): Promise<void> {
  if ((await ctx.cache.get(Service, serviceSafe)) == null) return;
  await refreshAllActivePositions(ctx, serviceSafe, at, false);
  await refreshAllUSDValues(ctx, serviceSafe, at);
  await calculatePortfolioMetrics(ctx, serviceSafe, at, true);
}

/**
 * handleBlock (checkServicesForSnapshot). Call only on a poll block.
 * After the snapshots, if any was taken, calculateGlobalMetrics. Returns
 * whether any snapshot was taken.
 */
export async function handleSchedulerBlock(ctx: PosCtx, at: At): Promise<boolean> {
  let created = false;
  for (const address of await registeredServices(ctx)) {
    if (!isSnapshotDue(await ctx.cache.get(AgentPortfolio, address), at.blockTimestamp)) continue;
    await snapshotPortfolio(ctx, address, at);
    // updateSnapshotTracking
    const portfolio = await ctx.cache.get(AgentPortfolio, address);
    if (portfolio != null) {
      portfolio.lastSnapshotTimestamp = at.blockTimestamp;
      portfolio.lastSnapshotBlock = at.blockNumber;
      ctx.cache.set(AgentPortfolio, portfolio);
    }
    created = true;
  }
  if (created) await calculateGlobalMetrics(ctx, at);
  return created;
}

export interface SchedulerChain {
  enterBlock(block: BlockRef): void;
  getBlockHeader(number: bigint): Promise<BlockHeader>;
}

/** Header reads memoised for one search. */
class Headers {
  private readonly memo = new Map<bigint, Promise<BlockHeader>>();
  constructor(private readonly chain: SchedulerChain) {}
  get(n: bigint): Promise<BlockHeader> {
    let h = this.memo.get(n);
    if (h == null) {
      h = this.chain.getBlockHeader(n);
      this.memo.set(n, h);
    }
    return h;
  }
}

/** The first poll block in [lo, hi] (both poll blocks) whose timestamp is at least `t`, or null. */
async function firstPollAtOrAfterTime(headers: Headers, lo: bigint, hi: bigint, t: bigint): Promise<bigint | null> {
  if (lo > hi || (await headers.get(hi)).timestamp < t) return null;
  while (lo < hi) {
    const mid = lo + ((hi - lo) / POLL_EVERY / 2n) * POLL_EVERY;
    if ((await headers.get(mid)).timestamp >= t) hi = mid;
    else lo = mid + POLL_EVERY;
  }
  return lo;
}

/**
 * The earliest poll block strictly before `block` at which a registered
 * service is due, or null. Every due poll block up to the previously
 * processed block has already run, so:
 * - a portfolio with no snapshot is due at the first poll block at or
 *   after its Service's multisig block (where the portfolio was created);
 * - otherwise at the first poll block after its last snapshot whose
 *   timestamp is on a later UTC day.
 */
export async function earliestDuePoll(
  ctx: PosCtx & { chain: SchedulerChain },
  block: { number: bigint; timestamp: bigint },
  headers = new Headers(ctx.chain),
): Promise<bigint | null> {
  const last = lastPollBefore(block.number);
  if (last == null) return null;
  let earliest: bigint | null = null;
  for (const address of await registeredServices(ctx)) {
    const portfolio = await ctx.cache.get(AgentPortfolio, address);
    if (portfolio == null) continue;
    const hi = earliest == null ? last : earliest - POLL_EVERY;
    let due: bigint | null;
    if (portfolio.lastSnapshotTimestamp === 0n) {
      const service = await ctx.cache.get(Service, address);
      // Not reachable: the registry entry and the portfolio are written with the Service.
      if (service == null) continue;
      due = firstPollAtOrAfter(service.latestMultisigBlock);
      if (due > hi) due = null;
    } else {
      const nextDay = dayTimestamp(portfolio.lastSnapshotTimestamp) + ONE_DAY;
      // `block` is still on the last snapshot's day: nothing before it is due.
      if (nextDay > block.timestamp) continue;
      due = await firstPollAtOrAfterTime(headers, firstPollAtOrAfter(portfolio.lastSnapshotBlock + 1n), hi, nextDay);
    }
    if (due != null) earliest = due;
  }
  return earliest;
}

/**
 * Runs, in block order, every due poll block strictly before `block`. The
 * chain reader is left on the last poll block; the caller re-enters `block`.
 */
export async function runDuePollsBefore(ctx: PosCtx & { chain: SchedulerChain }, block: BlockHeader): Promise<number> {
  const headers = new Headers(ctx.chain);
  let ran = 0;
  for (;;) {
    const poll = await earliestDuePoll(ctx, block, headers);
    if (poll == null) return ran;
    const header = await headers.get(poll);
    ctx.chain.enterBlock(header);
    if (!(await handleSchedulerBlock(ctx, { blockNumber: header.number, blockTimestamp: header.timestamp }))) {
      throw new Error(`poll block ${poll} was due by the entities but took no snapshot`);
    }
    ran++;
  }
}
