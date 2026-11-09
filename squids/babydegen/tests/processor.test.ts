import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The processor module reads env at import time; a cold import of the SDK RPC
// adapter can pass vitest's 5 s default, so every case gets 30 s.
vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("processor", () => {
  it("builds both ingestion sources from the tracked safes, from the Basius start block", async () => {
    vi.stubEnv("SQD_PORTAL_URL", undefined);
    vi.stubEnv("SQD_PORTAL_API_KEY", undefined);
    const { BLOCK_RANGE, buildDataSource, INGEST_SOURCE } = await import("../src/processor");
    const { emptyTracked } = await import("../src/sources");
    expect(INGEST_SOURCE).toBe("rpc");
    expect(BLOCK_RANGE).toEqual({ from: 47_163_056 });
    expect(buildDataSource(emptyTracked())).toBeDefined();
    vi.resetModules();
    vi.stubEnv("INGEST_SOURCE", "portal");
    const portal = await import("../src/processor");
    expect(portal.INGEST_SOURCE).toBe("portal");
    const tracked = emptyTracked();
    tracked.serviceSafes.add("0x" + "11".repeat(20));
    tracked.safeHosts.add("0x" + "11".repeat(20));
    expect(portal.buildDataSource(tracked)).toBeDefined();
  });

  it("honours BABYDEGEN_TO_BLOCK and refuses one before the start block", async () => {
    vi.stubEnv("BABYDEGEN_TO_BLOCK", "47200000");
    expect((await import("../src/processor")).BLOCK_RANGE).toEqual({ from: 47_163_056, to: 47_200_000 });
    vi.resetModules();
    vi.stubEnv("BABYDEGEN_TO_BLOCK", "100");
    await expect(import("../src/processor")).rejects.toThrow(/BABYDEGEN_TO_BLOCK/);
  });

  it("refuses a portal URL for another chain's dataset", async () => {
    vi.stubEnv("SQD_PORTAL_URL", "https://portal.sqd.dev/datasets/robinhood-mainnet");
    await expect(import("../src/processor")).rejects.toThrow(/base-mainnet/);
    const { assertPortalDataset } = await import("../src/constants");
    expect(() => assertPortalDataset({ SQD_PORTAL_URL: "https://x.example/v1/datasets/Base-Mainnet/stream" })).not.toThrow();
  });
});

describe("constants", () => {
  it("keeps every address lowercase and every token priced", async () => {
    const c = await import("../src/constants");
    const sources = [...c.TOKENS.values()].flatMap((t) => t.priceSources.map((s) => s.address));
    const all = [c.SERVICE_REGISTRY, ...sources, ...c.TRACKED_TOKENS, ...c.STABLECOINS];
    for (const a of all) expect(a).toBe(a.toLowerCase());
    for (const t of c.TRACKED_TOKENS) expect(c.TOKENS.get(t)?.priceSources.length).toBeGreaterThan(0);
    // subgraph.yaml's 13 Transfer data sources (#174 + #175), one TOKENS entry each
    expect(c.TRACKED_TOKENS).toHaveLength(13);
    expect([...c.TOKENS.keys()].sort()).toEqual([...c.TRACKED_TOKENS].sort());
  });
});
