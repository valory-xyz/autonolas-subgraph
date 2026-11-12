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
