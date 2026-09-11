// The Chainlink read's fallback chain, with viem stubbed: primary pinned to
// the block -> RPC_HTTP_FALLBACK pinned -> primary at `latest` (warned) ->
// throw. A revert anywhere is null. Successful reads are memoized per block.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { url: string; fn: string; blockNumber?: bigint };
const state = vi.hoisted(() => ({
  calls: [] as Call[],
  // url -> handler for latestRoundData; decimals always answers 8
  script: new Map<string, (blockNumber?: bigint) => Promise<bigint>>(),
}));

vi.mock("viem", () => ({
  http: (url: string) => ({ url }),
  createPublicClient: ({ transport }: { transport: { url: string } }) => ({
    async readContract(args: { functionName: string; blockNumber?: bigint }) {
      state.calls.push({ url: transport.url, fn: args.functionName, blockNumber: args.blockNumber });
      if (args.functionName === "decimals") return 8;
      const h = state.script.get(transport.url);
      if (h == null) throw new Error(`no script for ${transport.url}`);
      const answer = await h(args.blockNumber);
      return [1n, answer, 0n, 0n, 1n] as const;
    },
    async getCode() {
      return "0x60";
    },
  }),
}));

const PRIMARY = "http://primary";
const FALLBACK = "http://fallback";
const revert = () => Object.assign(new Error("execution reverted"), { name: "ContractFunctionRevertedError" });
const wrappedRevert = () =>
  Object.assign(new Error("call failed"), {
    name: "ContractFunctionExecutionError",
    cause: Object.assign(new Error("0x"), { name: "ContractFunctionZeroDataError" }),
  });
const pruned = () => new Error("metadata is not found, 58667230");

async function load(withFallback: boolean) {
  vi.resetModules();
  process.env.RPC_HTTP = PRIMARY;
  if (withFallback) process.env.RPC_HTTP_FALLBACK = FALLBACK;
  else delete process.env.RPC_HTTP_FALLBACK;
  return import("../src/rpc");
}

beforeEach(() => {
  state.calls.length = 0;
  state.script.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("isRevert", () => {
  it("walks the cause chain and ignores transport errors", async () => {
    const { isRevert } = await load(false);
    expect(isRevert(revert())).toBe(true);
    expect(isRevert(wrappedRevert())).toBe(true);
    expect(isRevert(pruned())).toBe(false);
    expect(isRevert(new Error("HTTP 429"))).toBe(false);
  });
});

describe("readNativeUsd", () => {
  it("reads at the pinned block and memoizes per block", async () => {
    const { readNativeUsd } = await load(false);
    state.script.set(PRIMARY, async () => 200_000_000_000n);
    expect(await readNativeUsd(100n)).toEqual({ answer: 200_000_000_000n, decimals: 8 });
    expect(await readNativeUsd(100n)).toEqual({ answer: 200_000_000_000n, decimals: 8 });
    const rounds = state.calls.filter((c) => c.fn === "latestRoundData");
    expect(rounds).toEqual([{ url: PRIMARY, fn: "latestRoundData", blockNumber: 100n }]);
    expect(state.calls.filter((c) => c.fn === "decimals")).toHaveLength(1);
  });

  it("returns null on a revert (no fallback attempted)", async () => {
    const { readNativeUsd } = await load(true);
    state.script.set(PRIMARY, async () => {
      throw wrappedRevert();
    });
    state.script.set(FALLBACK, async () => 1n);
    expect(await readNativeUsd(100n)).toBeNull();
    expect(state.calls.filter((c) => c.url === FALLBACK)).toHaveLength(0);
  });

  it("uses the fallback at the same block on a non-revert primary failure", async () => {
    const { readNativeUsd } = await load(true);
    state.script.set(PRIMARY, async () => {
      throw pruned();
    });
    state.script.set(FALLBACK, async (b) => (b === 100n ? 123n : 0n));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await readNativeUsd(100n)).toEqual({ answer: 123n, decimals: 8 });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to `latest` on the primary, once-warned per block, when every pinned read fails", async () => {
    const { readNativeUsd } = await load(true);
    state.script.set(PRIMARY, async (b) => {
      if (b != null) throw pruned();
      return 777n;
    });
    state.script.set(FALLBACK, async () => {
      throw pruned();
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await readNativeUsd(100n)).toEqual({ answer: 777n, decimals: 8 });
    const latest = state.calls.filter((c) => c.fn === "latestRoundData" && c.blockNumber == null);
    expect(latest).toEqual([{ url: PRIMARY, fn: "latestRoundData", blockNumber: undefined }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/reading at "latest"/);
  });

  it("propagates a transport failure of the `latest` read (batch retry)", async () => {
    const { readNativeUsd } = await load(false);
    state.script.set(PRIMARY, async () => {
      throw pruned();
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(readNativeUsd(100n)).rejects.toThrow(/metadata is not found/);
  });
});
