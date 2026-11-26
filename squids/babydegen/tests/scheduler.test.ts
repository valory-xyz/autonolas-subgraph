// Snapshots fire on polling blocks (every 1800 from 47,163,056), after
// that block's events, on UTC-day crossings, including poll blocks the
// stream never delivers.

import { describe, expect, it } from "vitest";
import * as erc20 from "../src/abi/ERC20Detailed/events";
import * as safe from "../src/abi/GnosisSafe/events";
import * as registry from "../src/abi/ServiceRegistryL2/events";
import { processBlock, type StreamState } from "../src/block";
import { SERVICE_REGISTRY, USDC_NATIVE } from "../src/constants";
import type { RawLog } from "../src/dispatch";
import { AgentPortfolio, AgentPortfolioSnapshot, DailyPopulationMetric, Service, ServiceRegistry } from "../src/model";
import { dailyPopulationMetricId } from "../src/globalMetrics";
import { SERVICE_REGISTRY_ID } from "../src/ids";
import { ensureAgentPortfolio, snapshotId } from "../src/portfolio";
import { earliestDuePoll, firstPollAtOrAfter, isPollBlock, POLL_START } from "../src/scheduler";
import { addr, hash, setup, tx } from "./helpers";


const OPERATOR = addr(0x0a);
const SAFE = addr(0x5a);
const EOA = addr(0xe0);
const AGENT = addr(0xa1);
const TX = hash(0x77);

const log = (logIndex: number, address: string, e: { topics: string[]; data: string }): RawLog => ({
  address, logIndex, transactionHash: TX, topics: e.topics, data: e.data, transaction: tx(),
});
const registerInstance = (i: number) =>
  log(i, SERVICE_REGISTRY, registry.RegisterInstance.encode({ operator: OPERATOR, serviceId: 607n, agentInstance: AGENT, agentId: 115n }));
const createMultisig = (i: number) => log(i, SERVICE_REGISTRY, registry.CreateMultisigWithAgents.encode({ serviceId: 607n, multisig: SAFE }));
const usdcIn = (i: number, value: bigint) => log(i, USDC_NATIVE, erc20.Transfer.encode({ from: EOA, to: SAFE, value }));
const ethIn = (i: number, value: bigint) => log(i, SAFE, safe.SafeReceived.encode({ sender: EOA, value }));

/** Synthetic: block POLL_START at 10:13:20 UTC, 2 s blocks after it. */
const T0 = 1_781_000_000n;
const ts = (n: bigint) => T0 + (n - POLL_START) * 2n;
/** Synthetic stand-in for Base's 2 s -> 200 ms switch (really at 53,556,128): five blocks per second after it, so several share a timestamp. */
const SWITCH = POLL_START + 1_000_000n;
const tsFast = (n: bigint) => (n < SWITCH ? ts(n) : ts(SWITCH) + (n - SWITCH) / 5n);
const poll = (k: number) => POLL_START + 1800n * BigInt(k);
const header = (n: bigint, t: bigint) => ({ number: Number(n), hash: hash(Number(n)), timestamp: Number(t) * 1000 });

function world() {
  const w = setup();
  w.chain.timestampOf = ts;
  // The safes are already subscribed, so nothing is fetched mid-block.
  const stream: StreamState = { serviceSafes: new Set([SAFE]), safeHosts: new Set([SAFE, OPERATOR]) };
  const run = (n: bigint, logs: RawLog[]) => processBlock(w.ctx, { header: header(n, w.chain.timestampOf(n)), logs }, stream, async () => []);
  const snapshots = () => new Map(w.cache.all(AgentPortfolioSnapshot).map((x) => [x.id, x]));
  return { ...w, run, snapshots };
}

describe("poll blocks", () => {
  it("are every 1800 blocks from the start block (graph-node: (n - start) % every == 0)", () => {
    expect(POLL_START).toBe(47_163_056n);
    expect([poll(0), poll(1), poll(2)].every(isPollBlock)).toBe(true);
    expect([POLL_START - 1800n, poll(1) - 1n, poll(1) + 1n, 47_200_000n].some(isPollBlock)).toBe(false);
    expect([firstPollAtOrAfter(0n), firstPollAtOrAfter(poll(1)), firstPollAtOrAfter(poll(1) + 1n)]).toEqual([poll(0), poll(1), poll(2)]);
  });
});

describe("the scheduler over a log-filtered stream", () => {
  it("runs the poll blocks the stream skipped: the first one after registration, then the first of each UTC day", async () => {
    const w = world();
    const registeredAt = POLL_START + 100n;
    await w.run(registeredAt, [registerInstance(1), createMultisig(2)]);
    expect(w.snapshots().size).toBe(0);

    // Next streamed block, 40 polls later. Day 1 starts 49,600 s after T0,
    // so poll 14 (T0 + 50,400 s) is its first; day 2's is poll 38.
    const next = poll(40) + 5n;
    await w.run(next, []);
    expect([...w.snapshots().keys()].sort()).toEqual([poll(1), poll(14), poll(38)].map((n) => snapshotId(SAFE, ts(n))).sort());
    // Headers are bisected, not read for every poll block in between.
    expect(new Set(w.chain.headerReads).size).toBeLessThan(20);
    expect(w.chain.entered.map((b) => b.number)).toEqual([registeredAt, poll(1), poll(14), poll(38), next]);
    const p = (await w.cache.get(AgentPortfolio, SAFE))!;
    expect([p.lastSnapshotBlock, p.lastSnapshotTimestamp]).toEqual([poll(38), ts(poll(38))]);
    expect(await earliestDuePoll(w.ctx, { number: next, timestamp: ts(next) })).toBeNull();
  });

  it("runs on a streamed poll block after its events and before the events of Safes created in it", async () => {
    const w = world();
    // Registered in poll block 1. The new Safe's SafeReceived is deferred to
    // the end of the block (graph-node re-scans for the new data source).
    await w.run(poll(1), [registerInstance(1), createMultisig(2), usdcIn(3, 7_000_000n), ethIn(4, 10n ** 18n)]);
    expect(w.chain.headerReads).toEqual([]);
    const snap = (await w.cache.get(AgentPortfolioSnapshot, snapshotId(SAFE, ts(poll(1)))))!;
    expect(snap.block).toBe(poll(1));
    expect(snap.initialValue.toFixed()).toBe("7"); // the USDC funding (log 3) is in
    expect(snap.uninvestedValue.toFixed()).toBe("7"); // the deferred ETH is not
    const p = (await w.cache.get(AgentPortfolio, SAFE))!;
    expect(p.uninvestedValue.toFixed()).toBe("3007"); // it runs after the snapshot
  });

  it("writes the day's DailyPopulationMetric after a poll block that took a snapshot", async () => {
    const w = world();
    await w.run(POLL_START + 100n, [registerInstance(1), createMultisig(2)]);
    await w.run(poll(1) + 5n, []); // first snapshot at poll 1 (day 0)
    const day0 = (ts(poll(1)) / 86400n) * 86400n;
    const m = (await w.cache.get(DailyPopulationMetric, dailyPopulationMetricId(day0)))!;
    expect(m).toBeDefined();
    expect([m.block, m.totalAgents]).toEqual([poll(1), 1]);
  });

  it("takes nothing on a streamed poll block when no service is due", async () => {
    const w = world();
    await w.run(poll(1), [registerInstance(1), createMultisig(2)]);
    await w.run(poll(2), [usdcIn(1, 1_000_000n)]); // same UTC day
    expect(w.snapshots().size).toBe(1);
  });

  it("runs the due poll blocks up to a pinned end block that carries no log", async () => {
    const w = world();
    await w.run(POLL_START + 100n, [registerInstance(1), createMultisig(2)]);
    await w.run(poll(14), []); // processor.ts includes the end block in the stream
    expect([...w.snapshots().keys()].sort()).toEqual([poll(1), poll(14)].map((n) => snapshotId(SAFE, ts(n))).sort());
  });

  it("skips the search when no poll block lies since the last processed block, and searches again after a rollback", async () => {
    const w = world();
    await w.run(POLL_START + 100n, [registerInstance(1), createMultisig(2)]);
    await w.run(poll(1) + 5n, []); // first snapshot at poll 1
    // Day 1 starts at block +24,800 (between polls 13 and 14): the last
    // snapshot's day is over, but no poll block of day 1 precedes these.
    const b1 = POLL_START + 24_900n;
    await w.run(b1, []);
    const reads = w.chain.headerReads.length;
    expect(reads).toBeGreaterThan(0); // searched: poll 13 is new since poll 1 + 5
    await w.run(b1 + 50n, []);
    expect(w.chain.headerReads).toHaveLength(reads); // nothing new to search
    await w.run(b1, []); // a hot-block rollback replays b1
    expect(w.chain.headerReads.length).toBeGreaterThan(reads);
    expect(w.cache.all(AgentPortfolioSnapshot)).toHaveLength(1);
  });

  it("runs several services' due poll blocks in block order: an earlier one found after a later one wins", async () => {
    const w = world();
    const [A, B, C] = [addr(0x5a1), addr(0x5b1), addr(0x5c1)];
    const service = (id: string, multisigBlock: bigint) =>
      w.cache.set(Service, new Service({ id, positionIds: [], agentInstances: [], latestRegistrationTimestamp: T0, latestMultisigBlock: multisigBlock }));
    // B first in the registry: due at poll 6 (no snapshot yet, created after poll 5).
    // A and C: last snapshot on day 0 (polls 1 and 2), both due at poll 14, day 1's first.
    w.cache.set(ServiceRegistry, new ServiceRegistry({ id: SERVICE_REGISTRY_ID, serviceAddresses: [B, A, C] }));
    service(A, POLL_START);
    service(B, poll(5) + 10n);
    service(C, POLL_START);
    for (const [id, k] of [[A, 1], [C, 2]] as const) {
      const p = await ensureAgentPortfolio(w.ctx, id, T0);
      [p.lastSnapshotTimestamp, p.lastSnapshotBlock] = [ts(poll(k)), poll(k)];
    }
    await ensureAgentPortfolio(w.ctx, B, ts(poll(5) + 10n));

    const next = poll(20) + 3n;
    expect(await earliestDuePoll(w.ctx, { number: next, timestamp: ts(next) })).toBe(poll(6));
    await w.run(next, []);
    const taken = w.cache
      .all(AgentPortfolioSnapshot)
      .map((x) => `${x.portfolio.id}@${x.block - POLL_START}`)
      .sort();
    expect(taken).toEqual([`${A}@${poll(14) - POLL_START}`, `${B}@${poll(14) - POLL_START}`, `${B}@${poll(6) - POLL_START}`, `${C}@${poll(14) - POLL_START}`].sort());
    expect(w.chain.entered.map((b) => b.number)).toEqual([poll(6), poll(14), next]);
  });

  it("takes a poll block whose timestamp is exactly UTC midnight as that day's first", async () => {
    const w = world();
    // Poll 14 lands exactly on a midnight (polls are 3600 s apart here).
    const D = 1_781_049_600n;
    const tsMid = (n: bigint) => D - 14n * 3600n + (n - POLL_START) * 2n;
    w.chain.timestampOf = tsMid;
    expect(tsMid(poll(14)) % 86400n).toBe(0n);
    await w.run(POLL_START + 100n, [registerInstance(1), createMultisig(2)]);
    await w.run(poll(20) + 5n, []);
    const blocks = w.cache.all(AgentPortfolioSnapshot).map((x) => x.block).sort((a, b) => (a < b ? -1 : 1));
    expect(blocks).toEqual([poll(1), poll(14)]);
  });

  it("finds each day's first poll block from headers when the block time changes (2 s, then 200 ms)", async () => {
    const w = world();
    w.chain.timestampOf = tsFast;
    await w.run(POLL_START + 100n, [registerInstance(1), createMultisig(2)]);
    // Ten days later in the 200 ms era: 240 poll blocks a day.
    const tEnd = tsFast(SWITCH) + 10n * 86400n;
    const end = SWITCH + (tEnd - tsFast(SWITCH)) * 5n;
    await w.run(end, []);

    // Reference: every poll block before `end`, first one per UTC day after the first snapshot.
    const expected: bigint[] = [];
    let lastDay = -1n;
    for (let n = poll(1); n < end; n += 1800n) {
      const day = tsFast(n) / 86400n;
      if (day > lastDay) {
        expected.push(n);
        lastDay = day;
      }
    }
    const blocks = w.cache.all(AgentPortfolioSnapshot).map((x) => x.block).sort((a, b) => (a < b ? -1 : 1));
    expect(blocks).toEqual(expected);
    expect(blocks.length).toBeGreaterThan(20);
    const snap = (await w.cache.get(AgentPortfolioSnapshot, snapshotId(SAFE, tsFast(blocks[blocks.length - 1]))))!;
    expect(snap.timestamp % 86400n).toBeLessThan(400n); // within a poll interval (360 s) of midnight
  });
});
