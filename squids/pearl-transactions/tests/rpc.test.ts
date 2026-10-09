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
  const STATE_MISSING = { code: -32000, message: "getStateObject error: account not found" };
  // {code:3} with no data -> ContractFunctionRevertedError in viem.
  const REVERT = { code: 3, message: "execution reverted" };

  // What a non-archive public node (publicnode, 1rpc) answers at old blocks.
  const NO_HISTORY = { code: -32000, message: "historical state 0xabc is not available" };

  type Behaviour = { error?: object; zeroData?: boolean; noCode?: boolean; codeError?: object };

  /** fetch stub answering per URL; records every parsed request. */
  function stub(primary: Behaviour, fb: Behaviour) {
    const seen: { url: string; req: Rpc }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        const batch = JSON.parse(init.body);
        const reqs: Rpc[] = Array.isArray(batch) ? batch : [batch];
        const b = url.startsWith(PRIMARY) ? primary : fb;
        const results = reqs.map((r) => {
          seen.push({ url, req: r });
          if (r.method === "eth_getCode") {
            if (b.codeError) return { jsonrpc: "2.0", id: r.id, error: b.codeError };
            return { jsonrpc: "2.0", id: r.id, result: b.noCode ? "0x" : "0x6080" };
          }
          if (b.error) return { jsonrpc: "2.0", id: r.id, error: b.error };
          // result "0x" on eth_call -> ContractFunctionZeroDataError: the
          // pruned-node shape, indistinguishable from a real revert.
          if (b.zeroData) return { jsonrpc: "2.0", id: r.id, result: "0x" };
          const data: string = r.params?.[0]?.data ?? "";
          const result = data.startsWith("0xa0e67e2b")
            ? encodeOwners([OWNER])
            : data.startsWith("0x8da5cb5b")
              ? encodeAddress(OWNER)
              : encodeUint(1n);
          return { jsonrpc: "2.0", id: r.id, result };
        });
        return new Response(JSON.stringify(Array.isArray(batch) ? results : results[0]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );
    return seen;
  }
  const hit = (seen: { url: string; req: Rpc }[], url: string, method = "eth_call") =>
    seen.filter((s) => s.url.startsWith(url) && s.req.method === method);

  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RPC_HTTP", PRIMARY);
    vi.stubEnv("RPC_HTTP_FALLBACK", FALLBACK);
    // Legacy aliases unset, so these cases exercise the chain-neutral names.
    vi.stubEnv("RPC_POLYGON_HTTP", "");
    vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", "");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries on the fallback with the same `from` and block pin, one warn per call", async () => {
    const seen = stub({ error: STATE_MISSING }, {});
    const { getSafeConfig } = await import("../src/rpc");
    expect(await getSafeConfig(SAFE, 86_150_361)).toEqual({ owners: [OWNER], threshold: 1n });

    const fbCalls = hit(seen, FALLBACK);
    expect(fbCalls).toHaveLength(2);
    for (const { req } of fbCalls) {
      expect(req.params[0].from?.toLowerCase()).toBe(SERVICE_REGISTRY_L2);
      expect(req.params[1]).toBe(hex(86_150_361));
    }
    expect(warn).toHaveBeenCalledTimes(2); // getOwners + getThreshold
  });

  it("logs the node's own error text, on one line", async () => {
    // viem's shortMessage for -32000 is a generic two-line hint; the node's
    // text, which is what diagnoses an archive hole, is only in `details`.
    stub({ error: STATE_MISSING }, {});
    const { getSafeConfig } = await import("../src/rpc");
    await getSafeConfig(SAFE, 86_150_361);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain(STATE_MISSING.message);
    expect(line).not.toContain("\n");
  });

  it("does NOT fall back on a genuine revert from the primary", async () => {
    const seen = stub({ error: REVERT }, {});
    const { getSafeConfig } = await import("../src/rpc");
    expect(await getSafeConfig("0x000000000000000000000000000000000000dead", 86_150_361)).toBeNull();
    expect(hit(seen, FALLBACK)).toHaveLength(0);
  });

  it("trusts a fallback revert only if the fallback holds state at that block", async () => {
    // Fallback is pruned: eth_call answers "0x" (reads as a revert) AND
    // getCode answers "0x". That must NOT become "not a Safe" — the primary's
    // error is rethrown so the batch retries.
    stub({ error: STATE_MISSING }, { zeroData: true, noCode: true });
    const { getSafeConfig } = await import("../src/rpc");
    await expect(getSafeConfig(SAFE, 86_150_361)).rejects.toThrow();
  });

  it("does not trust a fallback revert when the fallback's getCode throws", async () => {
    // The realistic pruned public node: eth_call answers "0x" (reads as a
    // revert), getCode at the old block errors. Treating that as "has state"
    // would trust the revert and drop a real Safe; the primary's error must
    // be rethrown instead.
    stub({ error: STATE_MISSING }, { zeroData: true, codeError: NO_HISTORY });
    const { getSafeConfig } = await import("../src/rpc");
    await expect(getSafeConfig(SAFE, 86_150_361)).rejects.toThrow(STATE_MISSING.message);
  });

  it("accepts a fallback revert when the fallback does hold state at that block", async () => {
    // Same "0x" from eth_call, but getCode proves the node has the block:
    // this is a real not-a-Safe, so null is correct.
    stub({ error: STATE_MISSING }, { zeroData: true });
    const { getSafeConfig } = await import("../src/rpc");
    expect(await getSafeConfig("0x000000000000000000000000000000000000dead", 86_150_361)).toBeNull();
  });

  it("rethrows when both endpoints fail", async () => {
    stub({ error: STATE_MISSING }, { error: STATE_MISSING });
    const { getSafeConfig } = await import("../src/rpc");
    await expect(getSafeConfig(SAFE, 86_150_361)).rejects.toThrow();
  });

  it("rethrows when the primary fails and no fallback is configured", async () => {
    vi.stubEnv("RPC_HTTP_FALLBACK", "");
    stub({ error: STATE_MISSING }, {});
    const { getSafeConfig } = await import("../src/rpc");
    await expect(getSafeConfig(SAFE, 86_150_361)).rejects.toThrow();
  });

  describe("startup check", () => {
    it("checks the primary directly, so a broken primary fails even with a working fallback", async () => {
      // Otherwise startup would pass on the fallback's strength and all ~700
      // probes would silently shift to the rate-limited endpoint.
      stub({ error: STATE_MISSING }, {});
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).rejects.toThrow(/RPC_HTTP /);
    });

    it("includes the node's own error text in the startup error", async () => {
      stub({ error: STATE_MISSING }, {});
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).rejects.toThrow(
        STATE_MISSING.message
      );
    });

    it("fails when the fallback is pruned, naming the fallback env var", async () => {
      stub({}, { noCode: true });
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).rejects.toThrow(/RPC_HTTP_FALLBACK/);
    });

    it("fails when the primary's getCode throws, naming the primary env var", async () => {
      stub({ codeError: NO_HISTORY }, {});
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).rejects.toThrow(
        /^RPC_HTTP cannot read state at block 80360433: historical state/
      );
    });

    it("fails when the fallback's getCode throws, naming the fallback env var", async () => {
      stub({}, { codeError: NO_HISTORY });
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).rejects.toThrow(
        /^RPC_HTTP_FALLBACK cannot read state at block 80360433: historical state/
      );
    });

    it("primary errors describe the primary's failure mode", async () => {
      stub({ noCode: true }, {});
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).rejects.toThrow(
        /^RPC_HTTP returned no code.*silently misread as "not a Safe"/
      );
    });

    it("fallback errors describe the fallback's failure mode, not the primary's", async () => {
      // Still fatal (consistent with the primary), but a pruned fallback can
      // no longer mislabel a Safe (hasStateAt) — it only fails to cover a hole.
      stub({}, { noCode: true });
      const { assertArchiveRpc } = await import("../src/rpc");
      const err = await assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433).catch((e) => e);
      expect(err.message).toMatch(/^RPC_HTTP_FALLBACK .*could not cover a hole in the primary/);
      expect(err.message).not.toMatch(/misread|first Master Safe/);

      stub({}, { error: STATE_MISSING });
      vi.resetModules();
      const again = await import("../src/rpc");
      const err2 = await again.assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433).catch((e) => e);
      expect(err2.message).toMatch(/^RPC_HTTP_FALLBACK cannot serve a historical eth_call/);
      expect(err2.message).toMatch(/could not cover a hole in the primary/);
      expect(err2.message).not.toMatch(/first Master Safe/);
    });

    it("passes when both endpoints hold state and answer the call", async () => {
      const seen = stub({}, {});
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).resolves.toBeUndefined();
      // both were exercised with a real eth_call, not just getCode
      expect(hit(seen, PRIMARY)).toHaveLength(1);
      expect(hit(seen, FALLBACK)).toHaveLength(1);
    });
  });

  describe("legacy RPC_POLYGON_HTTP* alias", () => {
    it("is used when the chain-neutral vars are unset, and named in errors", async () => {
      vi.stubEnv("RPC_HTTP", "");
      vi.stubEnv("RPC_HTTP_FALLBACK", "");
      vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
      vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", FALLBACK);
      const seen = stub({ error: STATE_MISSING }, {});
      const { getSafeConfig } = await import("../src/rpc");
      expect(await getSafeConfig(SAFE, 86_150_361)).toEqual({ owners: [OWNER], threshold: 1n });
      expect(hit(seen, PRIMARY)).toHaveLength(2);
      expect(hit(seen, FALLBACK)).toHaveLength(2);
      expect(String(warn.mock.calls[0][0])).toMatch(/RPC_POLYGON_HTTP_FALLBACK/);
    });

    it("startup check names the alias the operator actually set", async () => {
      vi.stubEnv("RPC_HTTP", "");
      vi.stubEnv("RPC_HTTP_FALLBACK", "");
      vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
      vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", FALLBACK);
      stub({}, { noCode: true });
      const { assertArchiveRpc } = await import("../src/rpc");
      await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 80_360_433)).rejects.toThrow(/RPC_POLYGON_HTTP_FALLBACK/);
    });

    it("loses to the chain-neutral var when both are set", async () => {
      const ALIAS = "https://alias.invalid/";
      vi.stubEnv("RPC_POLYGON_HTTP", ALIAS);
      vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", ALIAS);
      const seen = stub({}, {});
      const { getSafeConfig } = await import("../src/rpc");
      await getSafeConfig(SAFE, 86_150_361);
      expect(hit(seen, PRIMARY)).toHaveLength(2);
      expect(seen.filter((x) => x.url.startsWith(ALIAS))).toHaveLength(0);
    });

    it("warns once per pair when generic and alias differ, naming the vars but not the URLs", async () => {
      const ALIAS = "https://alias.invalid/?key=secret";
      vi.stubEnv("RPC_POLYGON_HTTP", ALIAS);
      vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", ALIAS);
      stub({}, {});
      await import("../src/rpc");
      const lines = warn.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual([
        expect.stringMatching(/Both RPC_HTTP and RPC_POLYGON_HTTP are set with different values; using RPC_HTTP\./),
        expect.stringMatching(/Both RPC_HTTP_FALLBACK and RPC_POLYGON_HTTP_FALLBACK are set with different values; using RPC_HTTP_FALLBACK\./),
      ]);
      for (const l of lines) expect(l).not.toMatch(/invalid|secret/);
    });

    it("does not warn when generic and alias hold the same value", async () => {
      vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
      vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", FALLBACK);
      stub({}, {});
      await import("../src/rpc");
      expect(warn).not.toHaveBeenCalled();
    });

    it("mixes: alias primary (RPC_POLYGON_HTTP) with chain-neutral fallback (RPC_HTTP_FALLBACK)", async () => {
      vi.stubEnv("RPC_HTTP", "");
      vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
      vi.stubEnv("RPC_HTTP_FALLBACK", FALLBACK);
      vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", "");
      const seen = stub({ error: STATE_MISSING }, {});
      const { getSafeConfig } = await import("../src/rpc");
      expect(await getSafeConfig(SAFE, 86_150_361)).toEqual({ owners: [OWNER], threshold: 1n });
      expect(hit(seen, PRIMARY)).toHaveLength(2);
      expect(hit(seen, FALLBACK)).toHaveLength(2);
      expect(String(warn.mock.calls[0][0])).toMatch(/RPC_HTTP_FALLBACK/);
      expect(String(warn.mock.calls[0][0])).not.toMatch(/RPC_POLYGON_HTTP_FALLBACK/);
    });

    it("mixes: chain-neutral primary (RPC_HTTP) with alias fallback (RPC_POLYGON_HTTP_FALLBACK)", async () => {
      vi.stubEnv("RPC_HTTP", PRIMARY);
      vi.stubEnv("RPC_POLYGON_HTTP", "");
      vi.stubEnv("RPC_HTTP_FALLBACK", "");
      vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", FALLBACK);
      const seen = stub({ error: STATE_MISSING }, {});
      const { getSafeConfig } = await import("../src/rpc");
      expect(await getSafeConfig(SAFE, 86_150_361)).toEqual({ owners: [OWNER], threshold: 1n });
      expect(hit(seen, PRIMARY)).toHaveLength(2);
      expect(hit(seen, FALLBACK)).toHaveLength(2);
      expect(String(warn.mock.calls[0][0])).toMatch(/RPC_POLYGON_HTTP_FALLBACK/);
    });

    describe("is honoured only on matic", () => {
      it("fails at startup on Base when RPC_POLYGON_HTTP is set, naming the var", async () => {
        vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "base");
        vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
        stub({}, {});
        await expect(import("../src/rpc")).rejects.toThrow(
          /^RPC_POLYGON_HTTP is set, but it is a Polygon-only legacy alias and PEARL_TRANSACTIONS_CHAIN="base"/
        );
      });

      it("fails at startup on Base when RPC_POLYGON_HTTP_FALLBACK is set, naming the var", async () => {
        vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "base");
        vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", FALLBACK);
        stub({}, {});
        await expect(import("../src/rpc")).rejects.toThrow(/^RPC_POLYGON_HTTP_FALLBACK is set/);
      });

      it("fails on Base even when the alias equals RPC_HTTP", async () => {
        vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "base");
        vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
        stub({}, {});
        await expect(import("../src/rpc")).rejects.toThrow(/^RPC_POLYGON_HTTP is set/);
      });

      it("works on an explicit matic with only the aliases set", async () => {
        vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "matic");
        vi.stubEnv("RPC_HTTP", "");
        vi.stubEnv("RPC_HTTP_FALLBACK", "");
        vi.stubEnv("RPC_POLYGON_HTTP", PRIMARY);
        vi.stubEnv("RPC_POLYGON_HTTP_FALLBACK", FALLBACK);
        const seen = stub({ error: STATE_MISSING }, {});
        const { getSafeConfig } = await import("../src/rpc");
        expect(await getSafeConfig(SAFE, 86_150_361)).toEqual({ owners: [OWNER], threshold: 1n });
        expect(hit(seen, PRIMARY)).toHaveLength(2);
        expect(hit(seen, FALLBACK)).toHaveLength(2);
      });

      it("works on Base with RPC_HTTP / RPC_HTTP_FALLBACK and the aliases unset", async () => {
        vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "base");
        const seen = stub({ error: STATE_MISSING }, {});
        const { getSafeConfig, assertArchiveRpc } = await import("../src/rpc");
        expect(await getSafeConfig(SAFE, 30_000_000)).toEqual({ owners: [OWNER], threshold: 1n });
        expect(hit(seen, PRIMARY)).toHaveLength(2);
        expect(hit(seen, FALLBACK)).toHaveLength(2);
        await expect(assertArchiveRpc(SERVICE_REGISTRY_L2, 10_827_380)).rejects.toThrow(/^RPC_HTTP /);
      });
    });
  });

  describe("no RPC vars set", () => {
    it("uses the selected chain's defaultRpc (Base: mainnet.base.org)", async () => {
      const BASE_DEFAULT = "https://mainnet.base.org";
      vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "base");
      for (const v of ["RPC_HTTP", "RPC_POLYGON_HTTP", "RPC_HTTP_FALLBACK", "RPC_POLYGON_HTTP_FALLBACK"]) {
        vi.stubEnv(v, "");
      }
      const seen = stub({}, {});
      const { getSafeConfig } = await import("../src/rpc");
      expect(await getSafeConfig(SAFE, 30_000_000)).toEqual({ owners: [OWNER], threshold: 1n });
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((x) => x.url.startsWith(BASE_DEFAULT))).toBe(true);
      expect(hit(seen, BASE_DEFAULT)).toHaveLength(2);
    });
  });
});
