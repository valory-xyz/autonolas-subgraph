// graph-node template semantics for chain-wide Safe logs (src/safeLogs.ts):
// a Safe first registered in a block also gets its EARLIER logs in that
// block; a reused Safe is not counted twice; foreign Safes are dropped.
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCache } from "./inMemoryCache";
import * as h from "../src/handlers";
import { BlockSafeLogs } from "../src/safeLogs";
import { EventMeta } from "../src/logic";
import { Global, Multisig } from "../src/model";
import { GLOBAL_ID } from "../src/constants";

const SAFE = "0x1000000000000000000000000000000000000001";
const FOREIGN = "0x2000000000000000000000000000000000000002";
const CREATOR = "0x00000000000000000000000000000000000000cc";
const TS = 1_788_900_000n;

let cache: InMemoryCache;
let router: BlockSafeLogs;
const meta = (block: number, logIndex: number): EventMeta => ({
  blockNumber: BigInt(block),
  blockTimestamp: TS + BigInt(block),
  txHash: `0x${String(block).padStart(64, "0")}`,
  logIndex,
});
const txCount = async () => (await cache.get(Global, GLOBAL_ID))!.txCount;
const createMultisig = (block: number, logIndex: number) =>
  router.createMultisig(SAFE, () =>
    h.handleCreateMultisig(cache, meta(block, logIndex), {
      serviceId: 1n,
      multisig: SAFE,
      txFrom: CREATOR,
    }),
  );

beforeEach(async () => {
  cache = new InMemoryCache();
  router = new BlockSafeLogs(cache);
  await h.handleCreateService(cache, meta(1, 0), { serviceId: 1n, configHash: "0x" });
  await h.handleRegisterInstance(cache, meta(1, 1), {
    operator: CREATOR,
    serviceId: 1n,
    agentId: 7n,
  });
  await router.endBlock();
});

describe("BlockSafeLogs", () => {
  it("counts a new Safe's logs from BEFORE its CreateMultisigWithAgents in the same block", async () => {
    // e.g. GnosisSafeSameAddressMultisig: execTransaction, then the registry event.
    await router.safeLog(SAFE, meta(10, 3));
    await createMultisig(10, 5);
    await router.safeLog(SAFE, meta(10, 8));
    expect(await txCount()).toBe(0n); // deferred to the end of the block
    await router.endBlock();
    expect(await txCount()).toBe(2n);
    expect((await cache.get(Multisig, SAFE))!.agentIds).toEqual([7]);
  });

  it("counts a known Safe in log order and never twice when it is re-registered", async () => {
    await createMultisig(10, 5);
    await router.endBlock();
    await router.safeLog(SAFE, meta(20, 1)); // reused Safe: execTransaction
    await createMultisig(20, 2); // second CreateMultisigWithAgents, same Safe
    await router.safeLog(SAFE, meta(20, 3));
    expect(await txCount()).toBe(2n);
    await router.endBlock();
    expect(await txCount()).toBe(2n);
  });

  it("drops foreign Safes and Safes that never get registered", async () => {
    await router.safeLog(FOREIGN, meta(10, 1));
    await router.endBlock();
    await router.safeLog(SAFE, meta(11, 1));
    await router.endBlock();
    expect(await txCount()).toBe(0n);
    // A later registration does not resurrect logs from earlier blocks.
    await createMultisig(12, 1);
    await router.endBlock();
    expect(await txCount()).toBe(0n);
  });
});
