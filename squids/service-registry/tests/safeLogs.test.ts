// graph-node template semantics for chain-wide Safe logs (src/safeLogs.ts):
// a Safe first registered in a block also gets its EARLIER logs in that
// block, in log order; a reused Safe is not counted twice; foreign Safes are
// dropped; a stale known-multisig set (after a reorg) does not lose logs.
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCache } from "./inMemoryCache";
import * as h from "../src/handlers";
import { BlockSafeLogs } from "../src/safeLogs";
import { EventMeta, dailyAgentPerformanceId } from "../src/logic";
import { DailyAgentPerformance, Global, Multisig } from "../src/model";
import { GLOBAL_ID } from "../src/constants";
import { dayTimestamp } from "@olas/squid-shared";

const SAFE = "0x1000000000000000000000000000000000000001";
const SAFE_B = "0x3000000000000000000000000000000000000003";
const FOREIGN = "0x2000000000000000000000000000000000000002";
const CREATOR = "0x00000000000000000000000000000000000000cc";
const TS = 1_788_900_000n;

let cache: InMemoryCache;
let router: BlockSafeLogs;
/** Every log the router hands to the handler, in call order. */
let handled: { address: string; logIndex: number }[];

const meta = (block: number, logIndex: number): EventMeta => ({
  blockNumber: BigInt(block),
  blockTimestamp: TS + BigInt(block),
  txHash: `0x${String(block).padStart(64, "0")}`,
  logIndex,
});
const txCount = async () => (await cache.get(Global, GLOBAL_ID))!.txCount;
const agentTxCount = async (agentId: number) =>
  (await cache.get(DailyAgentPerformance, dailyAgentPerformanceId(dayTimestamp(TS), agentId)))
    ?.txCount ?? 0;
const createMultisig = (block: number, logIndex: number, safe = SAFE, serviceId = 1n) =>
  router.createMultisig(safe, () =>
    h.handleCreateMultisig(cache, meta(block, logIndex), {
      serviceId,
      multisig: safe,
      txFrom: CREATOR,
    }),
  );

beforeEach(async () => {
  cache = new InMemoryCache();
  handled = [];
  router = new BlockSafeLogs(cache, async (c, m, p) => {
    handled.push({ address: p.address, logIndex: m.logIndex });
    await h.handleSafeExecution(c, m, p);
  });
  // Service 1 runs agent 7, service 2 runs agent 8.
  for (const [serviceId, agentId] of [[1n, 7n], [2n, 8n]] as const) {
    await h.handleCreateService(cache, meta(1, 0), { serviceId, configHash: "0x" });
    await h.handleRegisterInstance(cache, meta(1, 1), {
      operator: CREATOR,
      serviceId,
      agentId,
    });
  }
  await router.endBlock();
});

describe("BlockSafeLogs", () => {
  it("counts a new Safe's logs from BEFORE its CreateMultisigWithAgents in the same block, in log order", async () => {
    // e.g. GnosisSafeSameAddressMultisig: execTransaction, then the registry event.
    await router.safeLog(SAFE, meta(10, 3));
    await createMultisig(10, 5);
    await router.safeLog(SAFE, meta(10, 8));
    expect(await txCount()).toBe(0n); // deferred to the end of the block
    await router.endBlock();
    expect(await txCount()).toBe(2n);
    expect(handled).toEqual([
      { address: SAFE, logIndex: 3 },
      { address: SAFE, logIndex: 8 },
    ]);
    expect((await cache.get(Multisig, SAFE))!.agentIds).toEqual([7]);
    expect(cache.warnings).toEqual([]);
  });

  it("counts a known Safe in log order, once, crediting the service it belongs to at each log", async () => {
    await createMultisig(10, 5);
    await router.endBlock();
    await router.safeLog(SAFE, meta(20, 1)); // still service 1's Safe
    await createMultisig(20, 2, SAFE, 2n); // reused by service 2, same block
    await router.safeLog(SAFE, meta(20, 3)); // now service 2's
    expect(await txCount()).toBe(2n);
    await router.endBlock();
    expect(await txCount()).toBe(2n);
    expect(await agentTxCount(7)).toBe(1);
    expect(await agentTxCount(8)).toBe(1);
    expect(handled.map((x) => x.logIndex)).toEqual([1, 3]);
  });

  it("replays only the Safe registered in the block, never a foreign one parked beside it", async () => {
    await router.safeLog(FOREIGN, meta(10, 1));
    await router.safeLog(SAFE_B, meta(10, 2));
    await createMultisig(10, 3, SAFE_B, 2n);
    await router.endBlock();
    expect(handled).toEqual([{ address: SAFE_B, logIndex: 2 }]);
    expect(await txCount()).toBe(1n);
    expect(cache.warnings).toEqual([]);
  });

  it("does not resurrect logs from earlier blocks on a later registration", async () => {
    await router.safeLog(SAFE, meta(11, 1));
    await router.endBlock();
    await createMultisig(12, 1);
    await router.endBlock();
    expect(handled).toEqual([]);
    expect(await txCount()).toBe(0n);
  });

  it("after a reorg left the Safe in the known set without its row, re-registration still counts its earlier logs", async () => {
    // The process-wide set is append-only and survives a hot-block rollback.
    cache.known.add(SAFE);
    await router.safeLog(SAFE, meta(30, 1));
    await createMultisig(30, 2);
    await router.safeLog(SAFE, meta(30, 3));
    await router.endBlock();
    expect(handled.map((x) => x.logIndex)).toEqual([1, 3]);
    expect(await txCount()).toBe(2n);
    expect(cache.warnings).toEqual([]);
  });

  it("a stale known-set entry with no row and no re-registration is dropped without a warning", async () => {
    cache.known.add(SAFE);
    await router.safeLog(SAFE, meta(30, 1));
    await router.endBlock();
    expect(handled).toEqual([]);
    expect(cache.warnings).toEqual([]);
  });
});
