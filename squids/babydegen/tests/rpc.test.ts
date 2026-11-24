import { afterEach, describe, expect, it, vi } from "vitest";
import * as calls from "../src/calls";
import { ChainReader, isExecutionError, transport } from "../src/rpc";

const SAFE = "0x00000000000000000000000000000000000000e1";

/** ChainReader over the real transport, with fetch answering one JSON-RPC body per call. */
function readerAnswering(body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, ...(body as object) })));
  vi.stubGlobal("fetch", fetch);
  return { reader: new ChainReader(transport("http://rpc.test", 1)), fetch };
}

const threshold = (body: unknown) => readerAnswering(body).reader.call(SAFE, 1n, calls.getThreshold, {});

describe("ChainReader.call: what graph-node reads as reverted", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a 32-byte answer decodes", async () => {
    expect(await threshold({ result: "0x" + "0".repeat(63) + "2" })).toBe(2n);
  });

  it("an execution revert is no answer", async () => {
    expect(await threshold({ error: { code: 3, message: "execution reverted" } })).toBeNull();
  });

  it("empty output (0x) is no answer", async () => {
    expect(await threshold({ result: "0x" })).toBeNull();
  });

  it("output shorter than a word (a fallback returning a few bytes) is no answer", async () => {
    expect(await threshold({ result: "0x1234" })).toBeNull();
  });

  it("a halt with INVALID (invalid opcode) is no answer, not an error that stalls the batch", async () => {
    expect(await threshold({ error: { code: -32000, message: "Invalid opcode: opcode 0xfe not defined" } })).toBeNull();
  });

  it("a node error still throws", async () => {
    await expect(threshold({ error: { code: -32601, message: "method not found" } })).rejects.toThrow(/method not found/);
  });
});

describe("isExecutionError (graph-node RPC_EXECUTION_ERRORS + Parity -32015)", () => {
  it("matches every listed message, case-insensitively, and the codes", () => {
    for (const message of [
      "execution reverted",
      "Invalid jump destination",
      "invalid opcode: INVALID",
      "Stack limit reached 1024 (1023)",
      "out of gas",
      "stack underflow (0 <=> 1)",
      "VM execution error.",
      "InvalidJump",
      "NotActivated",
      "InvalidFEOpcode",
      "StackUnderflow",
      "StackOverflow",
      "OpcodeNotFound",
    ]) {
      expect(isExecutionError({ code: -32000, message })).toBe(true);
    }
    expect(isExecutionError({ code: -32015, message: "VM error" })).toBe(true);
    expect(isExecutionError({ code: 3, message: "" })).toBe(true);
    expect(isExecutionError({ code: -32000, message: "header not found" })).toBe(false);
  });
});

describe("ChainReader caches: keyed by block hash (fork replay)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const N = 47_200_000n;
  const A = { number: N, hash: "0x" + "aa".repeat(32) };
  const B = { number: N, hash: "0x" + "bb".repeat(32) };

  /**
   * An RPC node over two branches at height N. A `{ blockHash }` read is
   * answered from that branch if the node knows the hash, else "block not
   * found" (EIP-1898); a read by number from the branch the node follows.
   * Records each request's block parameter.
   */
  function forkedChain() {
    const answers: Record<string, { threshold: bigint; code: string }> = {
      [A.hash]: { threshold: 1n, code: "0x6080" },
      [B.hash]: { threshold: 2n, code: "0x" },
    };
    const state = { canonical: A.hash, known: new Set([A.hash, B.hash]) };
    const seen: string[] = [];
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      const { method, params } = JSON.parse(init.body) as { method: string; params: unknown[] };
      const block = params[1] as string | { blockHash: string };
      seen.push(`${method}@${typeof block === "string" ? block : `hash:${block.blockHash}`}`);
      let branch = state.canonical;
      if (typeof block !== "string") {
        if (!state.known.has(block.blockHash)) {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: `block not found: hash ${block.blockHash}` } }));
        }
        branch = block.blockHash;
      }
      const a = answers[branch];
      const result = method === "eth_call" ? "0x" + a.threshold.toString(16).padStart(64, "0") : a.code;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
    vi.stubGlobal("fetch", fetch);
    return { reader: new ChainReader(transport("http://rpc.test", 1)), state, seen };
  }

  it("replaying a height on another branch re-reads eth_call and eth_getCode instead of reusing the first branch", async () => {
    const { reader, seen } = forkedChain();
    reader.enterBlock(A);
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBe(1n);
    expect(await reader.hasCode(SAFE, N)).toBe(true);
    // Same block hash: memoised.
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBe(1n);
    expect(await reader.hasCode(SAFE, N)).toBe(true);
    expect(seen).toHaveLength(2);

    // The processor rolls back and replays height N on branch b.
    reader.enterBlock(B);
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBe(2n);
    expect(await reader.hasCode(SAFE, N)).toBe(false);
    expect(seen).toHaveLength(4);

    // Back on a: its own answers, still memoised under its hash.
    reader.enterBlock(A);
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBe(1n);
    expect(await reader.hasCode(SAFE, N)).toBe(true);
    expect(seen).toEqual([
      `eth_call@hash:${A.hash}`,
      `eth_getCode@hash:${A.hash}`,
      `eth_call@hash:${B.hash}`,
      `eth_getCode@hash:${B.hash}`,
    ]);
  });

  it("asks for the entered block by hash, so a node still on the old branch cannot answer for the new one", async () => {
    const { reader, state, seen } = forkedChain();
    // The node lags: it follows branch a and has not seen b yet.
    state.known.delete(B.hash);
    reader.enterBlock(B);
    await expect(reader.call(SAFE, N, calls.getThreshold, {})).rejects.toThrow(/block not found/);
    await expect(reader.hasCode(SAFE, N)).rejects.toThrow(/block not found/);
    // Nothing was memoised under b; once the node has b, b's own state comes back.
    state.known.add(B.hash);
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBe(2n);
    expect(await reader.hasCode(SAFE, N)).toBe(false);
    expect(seen.every((r) => r.endsWith(`hash:${B.hash}`))).toBe(true);
  });

  it("a read at a height other than the entered block is never memoised", async () => {
    const { reader, seen } = forkedChain();
    reader.enterBlock(A);
    await reader.call(SAFE, N - 1n, calls.getThreshold, {});
    await reader.call(SAFE, N - 1n, calls.getThreshold, {});
    await reader.hasCode(SAFE, N - 1n);
    await reader.hasCode(SAFE, N - 1n);
    expect(seen).toHaveLength(4);
    // ... and goes by number.
    expect(seen.every((r) => r.endsWith(`@0x${(N - 1n).toString(16)}`))).toBe(true);
  });

  it("a revert is memoised per hash too", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted" } })));
    vi.stubGlobal("fetch", fetch);
    const reader = new ChainReader(transport("http://rpc.test", 1));
    reader.enterBlock(A);
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBeNull();
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    reader.enterBlock(B);
    expect(await reader.call(SAFE, N, calls.getThreshold, {})).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
