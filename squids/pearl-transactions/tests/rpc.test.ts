import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { SERVICE_REGISTRY_L2 } from "../src/constants";

// Asserts the WIRE FORMAT of the historical eth_calls, not just their
// result. The production stall was a missing `from`; handlers.test.ts mocks
// this whole module, so nothing else would notice if a refactor dropped it
// again. `src/rpc` is imported fresh per test so the process-lifetime memo
// cannot leak between cases.

type Rpc = { method: string; params: any[]; id: number };

const OWNER = "0x634b55081234567890abcdef1234567890abcdef";
const SAFE = "0x19e6314cc81563a22e0f183f5939f0d50df22fcf";

function encodeOwners(owners: string[]) {
  return encodeAbiParameters(parseAbiParameters("address[]"), [
    owners as `0x${string}`[],
  ]);
}
function encodeUint(n: bigint) {
  return encodeAbiParameters(parseAbiParameters("uint256"), [n]);
}
function encodeAddress(a: string) {
  return encodeAbiParameters(parseAbiParameters("address"), [a as `0x${string}`]);
}

let sent: Rpc[] = [];

beforeEach(() => {
  sent = [];
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const batch = JSON.parse(init.body);
      const reqs: Rpc[] = Array.isArray(batch) ? batch : [batch];
      sent.push(...reqs);
      const results = reqs.map((r) => {
        const data: string = r.params?.[0]?.data ?? "";
        let result: string;
        if (data.startsWith("0xa0e67e2b")) result = encodeOwners([OWNER]); // getOwners
        else if (data.startsWith("0xe75235b8")) result = encodeUint(1n); // getThreshold
        else if (data.startsWith("0x8da5cb5b")) result = encodeAddress(OWNER); // owner
        else if (r.method === "eth_getCode") result = "0x6080";
        else result = "0x";
        return { jsonrpc: "2.0", id: r.id, result };
      });
      return new Response(JSON.stringify(Array.isArray(batch) ? results : results[0]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

const callsTo = (method: string) => sent.filter((r) => r.method === method);
// Derive, never hand-write: the original bug report mis-stated this block
// by 1,024 from a hex slip.
const hex = (n: number) => `0x${n.toString(16)}`;

describe("historical eth_call wire format", () => {
  it("getSafeConfig sends an explicit `from` on both calls, pinned to the block", async () => {
    const { getSafeConfig } = await import("../src/rpc");
    const cfg = await getSafeConfig(SAFE, 86_150_361);

    expect(cfg).toEqual({ owners: [OWNER], threshold: 1n });

    const calls = callsTo("eth_call");
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      // The whole fix: a missing `from` defaults to the zero address, which
      // erigon archive nodes reject at historical blocks.
      expect(c.params[0].from?.toLowerCase()).toBe(SERVICE_REGISTRY_L2);
      expect(c.params[0].to?.toLowerCase()).toBe(SAFE);
      // and the pin — reading at `latest` would give the wrong owner set.
      expect(c.params[1]).toBe(hex(86_150_361));
    }
  });

  it("assertArchiveRpc exercises the same call shape as the Safe probes", async () => {
    const { assertArchiveRpc } = await import("../src/rpc");
    await assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433);

    // getCode alone cannot surface a `from` quirk; a real eth_call must go
    // out too, with the same `from` the probes use.
    expect(callsTo("eth_getCode")).toHaveLength(1);
    const calls = callsTo("eth_call");
    expect(calls).toHaveLength(1);
    expect(calls[0].params[0].from?.toLowerCase()).toBe(SERVICE_REGISTRY_L2);
    expect(calls[0].params[1]).toBe(hex(80_360_433));
  });

  it("memoizes a successful probe and does not call again", async () => {
    const { getSafeConfig } = await import("../src/rpc");
    await getSafeConfig(SAFE, 86_150_361);
    await getSafeConfig(SAFE, 86_150_361);
    expect(callsTo("eth_call")).toHaveLength(2); // not 4
  });
});

describe("fallback RPC", () => {
  const PRIMARY = "https://primary.invalid/";
  const FALLBACK = "https://fallback.invalid/";
  const STATE_MISSING = {
    code: -32000,
    message:
      "getStateObject (e3607b00e75f6405248323a9417ff6b39b244b50) error: account 0xe3607b00e75f6405248323a9417ff6b39b244b50 is not found",
  };
  // Plain revert as a node reports it: data "0x" -> ContractFunctionZeroDataError
  const REVERT = { code: 3, message: "execution reverted" };

  /** fetch stub that answers per-URL, recording which URL each call hit. */
  function stubByUrl(primaryErr: object | null, fallbackErr: object | null) {
    const hits: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        hits.push(url);
        const batch = JSON.parse(init.body);
        const reqs: Rpc[] = Array.isArray(batch) ? batch : [batch];
        const err = url.startsWith(PRIMARY) ? primaryErr : fallbackErr;
        const results = reqs.map((r) => {
          if (err) return { jsonrpc: "2.0", id: r.id, error: err };
          const data: string = r.params?.[0]?.data ?? "";
          const result = data.startsWith("0xa0e67e2b")
            ? encodeOwners([OWNER])
            : encodeUint(1n);
          return { jsonrpc: "2.0", id: r.id, result };
        });
        return new Response(JSON.stringify(Array.isArray(batch) ? results : results[0]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );
    return hits;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
    vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", FALLBACK);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries on the fallback when the primary is missing state for the block", async () => {
    // The production failure: a hole in the primary's archive. The fallback
    // answers, so the Safe is resolved instead of the batch retrying forever.
    const hits = stubByUrl(STATE_MISSING, null);
    const { getSafeConfig } = await import("../src/rpc");
    const cfg = await getSafeConfig(SAFE, 86_150_361);
    expect(cfg).toEqual({ owners: [OWNER], threshold: 1n });
    expect(hits.some((u) => u.startsWith(PRIMARY))).toBe(true);
    expect(hits.some((u) => u.startsWith(FALLBACK))).toBe(true);
  });

  it("does NOT fall back on a genuine revert — that is a fact about the contract", async () => {
    const hits = stubByUrl(REVERT, null);
    const { getSafeConfig } = await import("../src/rpc");
    const cfg = await getSafeConfig("0x000000000000000000000000000000000000dead", 86_150_361);
    expect(cfg).toBeNull();
    expect(hits.some((u) => u.startsWith(FALLBACK))).toBe(false);
  });

  it("rethrows when both endpoints fail, so the batch retries rather than mislabelling", async () => {
    stubByUrl(STATE_MISSING, STATE_MISSING);
    const { getSafeConfig } = await import("../src/rpc");
    await expect(getSafeConfig(SAFE, 86_150_361)).rejects.toThrow();
  });

  it("rethrows when the primary fails and no fallback is configured", async () => {
    vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", "");
    stubByUrl(STATE_MISSING, null);
    const { getSafeConfig } = await import("../src/rpc");
    await expect(getSafeConfig(SAFE, 86_150_361)).rejects.toThrow();
  });
});
