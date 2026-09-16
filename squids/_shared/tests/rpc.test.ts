// The read's fallback chain, with viem stubbed: primary pinned to the block
// -> fallback pinned -> primary at `latest` (warned once per block) -> throw.
// A revert anywhere is null. ChainlinkSource memoizes successful reads per block.
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

type Call = { url: string; fn: string; blockNumber?: bigint };
const state = vi.hoisted(() => ({
  calls: [] as Call[],
  script: new Map<string, (blockNumber?: bigint) => Promise<bigint>>(),
  /** Successive decimals() results; a thrown value simulates an RPC failure. */
  decimals: [] as (number | Error)[],
  roundId: 1n,
  answeredInRound: 1n,
}));

vi.mock("viem", () => ({
  http: (url: string) => ({ url }),
  createPublicClient: ({ transport }: { transport: { url: string } }) => ({
    async readContract(args: { functionName: string; blockNumber?: bigint }) {
      state.calls.push({ url: transport.url, fn: args.functionName, blockNumber: args.blockNumber });
      if (args.functionName === "decimals") {
        const next = state.decimals.shift();
        if (next instanceof Error) throw next;
        return next ?? 8;
      }
      const h = state.script.get(transport.url);
      if (h == null) throw new Error(`no script for ${transport.url}`);
      const answer = await h(args.blockNumber);
      return [state.roundId, answer, 0n, 0n, state.answeredInRound] as const;
    },
    async getCode() {
      return "0x60";
    },
  }),
}));

import { Rpc, isRevert } from "../src/rpc";
import { ChainlinkSource } from "../src/price";

const PRIMARY = "http://primary";
const FALLBACK = "http://fallback";
const FEED = "0x00000000000000000000000000000000000000fe" as const;
const revert = () => Object.assign(new Error("execution reverted"), { name: "ContractFunctionRevertedError" });
const wrappedRevert = () =>
  Object.assign(new Error("call failed"), {
    name: "ContractFunctionExecutionError",
    cause: Object.assign(new Error("0x"), { name: "ContractFunctionZeroDataError" }),
  });
const pruned = () => new Error("metadata is not found, 58667230");

function make(withFallback: boolean) {
  const warnings: string[] = [];
  const log = { warn: (m: string) => warnings.push(m), info: () => {} };
  const rpc = new Rpc({ primaryUrl: PRIMARY, fallbackUrl: withFallback ? FALLBACK : null }, log);
  return { rpc, src: new ChainlinkSource(rpc, FEED, log), warnings };
}

beforeEach(() => {
  state.calls.length = 0;
  state.script.clear();
  state.decimals.length = 0;
  state.roundId = 1n;
  state.answeredInRound = 1n;
});

describe("isRevert", () => {
  it("walks the cause chain and ignores transport errors", () => {
    expect(isRevert(revert())).toBe(true);
    expect(isRevert(wrappedRevert())).toBe(true);
    expect(isRevert(pruned())).toBe(false);
    expect(isRevert(new Error("HTTP 429"))).toBe(false);
  });
});

describe("ChainlinkSource over Rpc", () => {
  it("reads at the pinned block and memoizes per block", async () => {
    const { src } = make(false);
    state.script.set(PRIMARY, async () => 200_000_000_000n);
    expect(await src.usdAt(100n)).toEqual({ answer: 200_000_000_000n, decimals: 8 });
    expect(await src.usdAt(100n)).toEqual({ answer: 200_000_000_000n, decimals: 8 });
    expect(state.calls.filter((c) => c.fn === "latestRoundData")).toEqual([
      { url: PRIMARY, fn: "latestRoundData", blockNumber: 100n },
    ]);
    expect(state.calls.filter((c) => c.fn === "decimals")).toHaveLength(1);
  });

  it("returns null on a revert, no fallback attempted", async () => {
    const { src } = make(true);
    state.script.set(PRIMARY, async () => {
      throw wrappedRevert();
    });
    state.script.set(FALLBACK, async () => 1n);
    expect(await src.usdAt(100n)).toBeNull();
    expect(state.calls.filter((c) => c.url === FALLBACK)).toHaveLength(0);
  });

  it("uses the fallback at the same block on a non-revert primary failure", async () => {
    const { src, warnings } = make(true);
    state.script.set(PRIMARY, async () => {
      throw pruned();
    });
    state.script.set(FALLBACK, async (b) => (b === 100n ? 123n : 0n));
    expect(await src.usdAt(100n)).toEqual({ answer: 123n, decimals: 8 });
    expect(warnings).toHaveLength(0);
  });

  it("falls back to `latest`, warned once per block, when every pinned read fails", async () => {
    const { src, warnings } = make(true);
    state.script.set(PRIMARY, async (b) => {
      if (b != null) throw pruned();
      return 777n;
    });
    state.script.set(FALLBACK, async () => {
      throw pruned();
    });
    expect(await src.usdAt(100n)).toEqual({ answer: 777n, decimals: 8 });
    expect(state.calls.filter((c) => c.fn === "latestRoundData" && c.blockNumber == null)).toEqual([
      { url: PRIMARY, fn: "latestRoundData", blockNumber: undefined },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/reading at "latest"/);
  });

  it("propagates a transport failure of the `latest` read (batch retry)", async () => {
    const { src } = make(false);
    state.script.set(PRIMARY, async () => {
      throw pruned();
    });
    await expect(src.usdAt(100n)).rejects.toThrow(/metadata is not found/);
  });

  it("falls back at `latest` when the primary is down, not just non-archival", async () => {
    const { src, warnings } = make(true);
    state.script.set(PRIMARY, async () => {
      throw pruned();
    });
    state.script.set(FALLBACK, async (b) => {
      if (b != null) throw pruned();
      return 555n;
    });
    // Without the fallback leg on the unpinned retry, a fully unreachable
    // primary would retry the batch forever with a healthy fallback configured.
    expect(await src.usdAt(100n)).toEqual({ answer: 555n, decimals: 8 });
    expect(warnings.some((w) => /reading at "latest"/.test(w))).toBe(true);
  });

  it("refuses a non-positive answer rather than recording it as a price", async () => {
    // Zero is what a feed returns for a block predating its first round;
    // negative would decrement the running USD totals rather than skip.
    for (const answer of [0n, -1n]) {
      const { src, warnings } = make(false);
      state.script.set(PRIMARY, async () => answer);
      expect(await src.usdAt(100n)).toBeNull();
      expect(warnings.some((w) => /not a usable price/.test(w))).toBe(true);
    }
  });

  it("skips a round that has not been answered yet", async () => {
    // A round in progress carries the previous round's answer; recording it
    // ships a stale figure that looks plausible.
    const { src, warnings } = make(false);
    state.roundId = 9n;
    state.answeredInRound = 8n;
    state.script.set(PRIMARY, async () => 200_000_000_000n);
    expect(await src.usdAt(100n)).toBeNull();
    expect(warnings.some((w) => /not yet answered/.test(w))).toBe(true);
  });

  it("does not pin the assumed decimals after a failed read", async () => {
    // One hiccup during a cold backfill must not fix an 18-decimal feed at 8
    // for the life of the process and mis-scale every later price by 1e10.
    const { src } = make(false);
    state.decimals.push(pruned(), 18);
    state.script.set(PRIMARY, async () => 1n);

    expect(await src.usdAt(100n)).toEqual({ answer: 1n, decimals: 8 });
    expect(await src.usdAt(101n)).toEqual({ answer: 1n, decimals: 18 });
  });
});
