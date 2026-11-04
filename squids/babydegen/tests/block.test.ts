import { describe, expect, it } from "vitest";
import { assertFlushOrderIsFkSafe, owningRelations } from "@olas/squid-shared";
import { getMetadataArgsStorage } from "typeorm";
import * as erc20 from "../src/abi/ERC20Detailed/events";
import * as safe from "../src/abi/GnosisSafe/events";
import * as registry from "../src/abi/ServiceRegistryL2/events";
import { addressTopic, fetchMissingLogs, processBlock, type StreamState } from "../src/block";
import { SERVICE_REGISTRY, TRACKED_TOKENS, USDC_NATIVE } from "../src/constants";
import { dispatch, type RawLog } from "../src/dispatch";
import { FLUSH_ORDER } from "../src/entityCache";
import { ETH_ADDRESS, tokenBalanceId } from "../src/ids";
import { FundingBalance, SafeDataSource, Service, ServiceRegistration, TokenBalance } from "../src/model";
import { cutAtSpawn, emptyTracked, firstSpawnIndex, logQueries, serviceIdFromKey, type Tracked } from "../src/sources";
import { addr, hash, meta, setup } from "./helpers";

const OPERATOR = addr(0x0a);
const SAFE = addr(0x5a);
const EOA = addr(0xe0);
const TX = hash(0x77);

const log = (logIndex: number, address: string, e: { topics: string[]; data: string }, transaction?: RawLog["transaction"]): RawLog => ({
  address,
  logIndex,
  transactionHash: TX,
  topics: e.topics,
  data: e.data,
  ...(transaction === undefined ? {} : { transaction }),
});
const registerInstance = (i: number, serviceId = 607n, agentId = 115n) =>
  log(i, SERVICE_REGISTRY, registry.RegisterInstance.encode({ operator: OPERATOR, serviceId, agentInstance: EOA, agentId }));
const createMultisig = (i: number, serviceId = 607n, multisig = SAFE) =>
  log(i, SERVICE_REGISTRY, registry.CreateMultisigWithAgents.encode({ serviceId, multisig }));
const usdcTransfer = (i: number, from: string, to: string, value: bigint) =>
  log(i, USDC_NATIVE, erc20.Transfer.encode({ from, to, value }));
const safeReceived = (i: number, at: string, sender: string, value: bigint) =>
  log(i, at, safe.SafeReceived.encode({ sender, value }));

const header = { number: 47_200_000, hash: hash(0xb1), timestamp: 1_781_000_000_000 };
const emptyStream = (): StreamState => ({ serviceSafes: new Set(), safeHosts: new Set() });

describe("encoders used by these tests", () => {
  it("produce the subgraph's topic layout", () => {
    const t = usdcTransfer(0, EOA, SAFE, 1n);
    expect(t.topics).toEqual([erc20.Transfer.topic, addressTopic(EOA), addressTopic(SAFE)]);
  });
});

describe("processBlock: a Basius service registered mid-block", () => {
  it("runs the new safe's Transfers in log order and its Safe events, earlier ones included, after the block", async () => {
    const { ctx, cache } = setup();
    const fetched: string[] = [];
    const missing = [
      safeReceived(1, SAFE, EOA, 10n ** 18n), // BEFORE the registration: deferred, still counted
      usdcTransfer(3, EOA, SAFE, 1n), // before CreateMultisig: Service does not exist yet
      usdcTransfer(6, EOA, SAFE, 7_000_000n), // after: funding
    ];
    const stream = emptyStream();
    await processBlock(ctx, { header, logs: [registerInstance(2), createMultisig(5), usdcTransfer(9, EOA, OPERATOR, 1n)] }, stream, async (h, services, hosts) => {
      fetched.push(`${h}:${services}:${hosts}`);
      return missing;
    });
    expect(fetched).toEqual([`${header.hash}:${SAFE}:${SAFE},${OPERATOR}`]);
    expect(stream.serviceSafes.has(SAFE) && stream.safeHosts.has(OPERATOR)).toBe(true);
    const fb = (await cache.get(FundingBalance, SAFE))!;
    expect(fb.totalInUsd.toFixed()).toBe("3007"); // 7 USDC (log 6) + 1 ETH @ $3000 (log 1, deferred)
    expect(fb.fundingInTxs).toEqual([TX, TX]);
    expect((await cache.get(TokenBalance, tokenBalanceId(SAFE, USDC_NATIVE)))!.balance.toFixed()).toBe("7");
    expect((await cache.get(TokenBalance, tokenBalanceId(SAFE, ETH_ADDRESS)))!.balance.toFixed()).toBe("1");
  });

  it("fetches nothing when the stream already carries the safes", async () => {
    const { ctx, cache } = setup();
    const stream: StreamState = { serviceSafes: new Set([SAFE]), safeHosts: new Set([SAFE, OPERATOR]) };
    let calls = 0;
    await processBlock(ctx, { header, logs: [registerInstance(1), createMultisig(2)] }, stream, async () => {
      calls++;
      return [];
    });
    expect(calls).toBe(0);
    expect(await cache.get(Service, SAFE)).toBeDefined();
  });

  it("replays a new host's earlier Safe event when a hot-block rollback left it in the stream", async () => {
    const { ctx, cache } = setup();
    const stream: StreamState = { serviceSafes: new Set([SAFE]), safeHosts: new Set([SAFE, OPERATOR]) };
    const logs = [safeReceived(1, SAFE, EOA, 10n ** 18n), registerInstance(2), createMultisig(5)];
    await processBlock(ctx, { header, logs }, stream, async () => []);
    expect((await cache.get(FundingBalance, SAFE))!.totalInUsd.toFixed()).toBe("3000");
    expect((await cache.get(TokenBalance, tokenBalanceId(SAFE, ETH_ADDRESS)))!.balance.toFixed()).toBe("1");
  });

  it("fetches the transaction for Safe executions only", async () => {
    const { chain } = setup();
    chain.logs = [
      { ...safeReceived(1, SAFE, EOA, 1n), transactionIndex: 0 },
      { ...log(2, SAFE, safe.ExecutionSuccess.encode({ txHash: hash(1), payment: 0n })), transactionIndex: 0 },
    ];
    chain.txs.set(TX, { hash: TX, from: EOA, to: SAFE, value: 5n });
    const got = await fetchMissingLogs(chain as any, header.hash, [], [SAFE]);
    expect(got.find((l) => l.logIndex === 1)!.transaction).toBeUndefined();
    expect(got.find((l) => l.logIndex === 2)!.transaction).toMatchObject({ to: SAFE, value: 5n });
  });

  it("fetchMissingLogs asks for Transfers both ways plus the hosts' Safe events, with their transactions", async () => {
    const { chain } = setup();
    chain.logs = [
      { ...usdcTransfer(1, EOA, SAFE, 1n), transactionIndex: 0 },
      { ...usdcTransfer(2, SAFE, EOA, 1n), transactionIndex: 0 },
      { ...usdcTransfer(3, EOA, EOA, 1n), transactionIndex: 0 },
      { ...log(4, SAFE, safe.ExecutionSuccess.encode({ txHash: hash(1), payment: 0n })), transactionIndex: 0 },
    ];
    chain.txs.set(TX, { hash: TX, from: EOA, to: SAFE, value: 5n });
    const got = await fetchMissingLogs(chain as any, header.hash, [SAFE], [SAFE]);
    expect(got.map((l) => l.logIndex).sort()).toEqual([1, 2, 4]);
    expect(got.find((l) => l.logIndex === 4)!.transaction).toMatchObject({ to: SAFE, value: 5n });
  });
});

describe("dispatch", () => {
  it("skips a Safe 1.4.1 ExecutionSuccess (indexed txHash: two topics), as graph-node does with this ABI", async () => {
    const { ctx, cache } = setup();
    for (const l of [registerInstance(1), createMultisig(2)]) await dispatch(ctx, meta({ address: l.address }), l);
    const v13 = log(3, SAFE, safe.ExecutionSuccess.encode({ txHash: hash(1), payment: 0n }), { to: EOA, value: 10n ** 18n });
    const v141: RawLog = { ...v13, logIndex: 4, topics: [v13.topics[0], hash(1)], data: "0x" + "00".repeat(32) };
    await dispatch(ctx, meta({ address: SAFE, logIndex: 4 }), v141);
    expect(await cache.get(FundingBalance, SAFE)).toBeUndefined();
    await dispatch(ctx, meta({ address: SAFE, logIndex: 3 }), v13);
    expect((await cache.get(FundingBalance, SAFE))!.totalOutUsd.toFixed()).toBe("3000");
  });

  it("ignores Safe events from an address without a Safe instance", async () => {
    const { ctx, cache } = setup();
    cache.set(Service, new Service({ id: SAFE, operatorSafe: OPERATOR }));
    await dispatch(ctx, meta({ address: SAFE }), safeReceived(1, SAFE, EOA, 1n));
    expect(cache.all(TokenBalance)).toHaveLength(0);
    cache.set(SafeDataSource, new SafeDataSource({ id: SAFE, createdAtBlock: 1n }));
    await dispatch(ctx, meta({ address: SAFE }), safeReceived(1, SAFE, EOA, 1n));
    expect(cache.all(TokenBalance)).toHaveLength(1);
  });
});

describe("restart-on-new-Safe source", () => {
  const block = (logs: RawLog[]) => ({ logs });

  it("cuts after the first block that creates a Basius Service, using DB and in-stream registrations", () => {
    const tracked = emptyTracked();
    expect(firstSpawnIndex([block([registerInstance(1)]), block([createMultisig(1)])], tracked)).toBe(1);
    expect(firstSpawnIndex([block([registerInstance(1, 9n, 9n)]), block([createMultisig(1, 9n)])], tracked)).toBe(-1);
    tracked.basiusServiceIds.add(607n);
    expect(firstSpawnIndex([block([]), block([]), block([createMultisig(1)])], tracked)).toBe(2);
    tracked.serviceSafes.add(SAFE); // re-deploy of a known multisig: no new Safe instance
    expect(firstSpawnIndex([block([createMultisig(1)])], tracked)).toBe(-1);
  });

  it("ends the stream with the spawning block", async () => {
    async function* source() {
      yield { blocks: [block([]), block([])] };
      yield { blocks: [block([registerInstance(1)]), block([createMultisig(1)]), block([])], finalizedHead: { number: 9, hash: "0x" } };
      yield { blocks: [block([])] };
    }
    const state = { cut: false };
    const sizes: number[] = [];
    for await (const b of cutAtSpawn(source(), emptyTracked(), state)) sizes.push(b.blocks.length);
    expect(sizes).toEqual([2, 2]);
    expect(state.cut).toBe(true);
  });

  it("cuts when the registration and the deploy arrive in different batches of one stream", async () => {
    async function* source() {
      yield { blocks: [block([registerInstance(1)])] };
      yield { blocks: [block([createMultisig(1)]), block([])] };
      yield { blocks: [block([])] };
    }
    const state = { cut: false };
    const sizes: number[] = [];
    for await (const b of cutAtSpawn(source(), emptyTracked(), state)) sizes.push(b.blocks.length);
    expect(sizes).toEqual([1, 1]);
    expect(state.cut).toBe(true);
  });

  it("end to end: a service registered in one batch and deployed in a later one is subscribed from its deploy block, each event once", async () => {
    // The chain, every log. Stream batches: [100], [101, 102], [103].
    const chainLogs = new Map<number, RawLog[]>([
      [100, [registerInstance(1)]],
      [101, [createMultisig(5), usdcTransfer(7, EOA, SAFE, 5_000_000n)]],
      [102, [usdcTransfer(1, EOA, SAFE, 3_000_000n), safeReceived(2, SAFE, EOA, 10n ** 18n)]],
      [103, [usdcTransfer(4, EOA, SAFE, 2_000_000n)]],
    ]);
    const batches = [[100], [101, 102], [103]];
    const matches = (tracked: Tracked, l: RawLog) =>
      logQueries(tracked).some(({ where = {} }) =>
        (!where.address || where.address.includes(l.address)) &&
        (["topic0", "topic1", "topic2"] as const).every((k, i) => !where[k] || where[k]!.includes(l.topics[i])),
      );
    const hdr = (n: number) => ({ number: n, hash: hash(n), timestamp: 1_781_000_000_000 + n * 2000 });
    const { ctx, cache } = setup();
    let from = 100;
    let runs = 0;
    for (;;) {
      runs++;
      // what main.ts loads from the database at a (re)start
      const tracked: Tracked = {
        basiusServiceIds: new Set(cache.all(ServiceRegistration).map((r) => r.serviceId)),
        serviceSafes: new Set(cache.all(Service).map((s) => s.id)),
        safeHosts: new Set(cache.all(SafeDataSource).map((s) => s.id)),
      };
      const stream: StreamState = { serviceSafes: new Set(tracked.serviceSafes), safeHosts: new Set(tracked.safeHosts) };
      async function* portal() {
        for (const nums of batches) {
          const todo = nums.filter((n) => n >= from);
          if (todo.length) yield { blocks: todo.map((n) => ({ n, logs: chainLogs.get(n)!.filter((l) => matches(tracked, l)) })) };
        }
      }
      const cut = { cut: false };
      for await (const batch of cutAtSpawn(portal(), tracked, cut)) {
        for (const b of batch.blocks) {
          await processBlock(ctx, { header: hdr(b.n), logs: b.logs }, stream, async (_h, services, hosts) =>
            chainLogs.get(b.n)!.filter(
              (l) =>
                (l.topics[0] === erc20.Transfer.topic &&
                  services.some((s) => l.topics[1] === addressTopic(s) || l.topics[2] === addressTopic(s))) ||
                (hosts.includes(l.address) && l.topics[0] !== erc20.Transfer.topic),
            ),
          );
          from = b.n + 1;
        }
      }
      if (!cut.cut) break;
    }
    expect(runs).toBe(2);
    const fb = (await cache.get(FundingBalance, SAFE))!;
    expect(fb.totalInUsd.toFixed()).toBe("3010"); // 5 + 3 + 2 USDC + 1 ETH @ $3000
    expect(fb.fundingInTxs).toHaveLength(4);
    expect((await cache.get(TokenBalance, tokenBalanceId(SAFE, USDC_NATIVE)))!.balance.toFixed()).toBe("10");
  });

  it("subscribes the registry, then Transfers both ways and Safe events for tracked safes", () => {
    expect(logQueries(emptyTracked())).toHaveLength(1);
    const tracked = emptyTracked();
    tracked.serviceSafes.add(SAFE);
    tracked.safeHosts.add(SAFE).add(OPERATOR);
    const [reg, from, to, safes] = logQueries(tracked);
    expect(reg.where!.address).toEqual([SERVICE_REGISTRY]);
    expect(from.where).toMatchObject({ address: TRACKED_TOKENS, topic0: [erc20.Transfer.topic], topic1: [addressTopic(SAFE)] });
    expect(to.where).toMatchObject({ topic2: [addressTopic(SAFE)] });
    expect(safes).toMatchObject({ where: { address: [OPERATOR, SAFE] }, include: { transaction: true } });
    expect(safes.where!.topic0).toHaveLength(3);
  });

  it("reads service ids back from ServiceRegistration ids", () => {
    expect(serviceIdFromKey("0x363037")).toBe(607n);
  });
});

it("FLUSH_ORDER writes every referenced entity first", () => {
  assertFlushOrderIsFkSafe(FLUSH_ORDER, owningRelations(getMetadataArgsStorage()));
});
