import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAIN is resolved at import time, so each case stubs the env and imports
// fresh modules.
const load = () => import("../src/constants");

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("TOKENOMICS_CHAIN", () => {
  it("defaults to robinhood when unset, so the live deployment needs no new env", async () => {
    vi.stubEnv("TOKENOMICS_CHAIN", undefined);
    const { CHAIN } = await load();
    expect(CHAIN.name).toBe("robinhood");
    expect(CHAIN.startBlock).toBe(56_201_065);
  });

  it("selects Base from 10,622,421 with the Base subgraph's OLAS", async () => {
    vi.stubEnv("TOKENOMICS_CHAIN", "base");
    const { CHAIN } = await load();
    expect(CHAIN).toMatchObject({
      name: "base",
      chainId: 8453,
      portalDataset: "https://portal.sqd.dev/datasets/base-mainnet",
      portalRequiresApiKey: false,
      startBlock: 10_622_421,
      olas: "0x54330d28ca3357f294334bdc454a032e7f353416",
    });
  });

  it("starts the Base source at the token block and filters Base OLAS", async () => {
    vi.stubEnv("TOKENOMICS_CHAIN", "base");
    vi.stubEnv("SQD_PORTAL_URL", undefined);
    vi.stubEnv("SQD_PORTAL_API_KEY", undefined);
    const { BLOCK_RANGE, LOG_QUERIES } = await import("../src/processor");
    expect(BLOCK_RANGE.from).toBe(10_622_421);
    expect(LOG_QUERIES[0].where?.address).toEqual([
      "0x54330d28ca3357f294334bdc454a032e7f353416",
    ]);
  });

  it("refuses an unknown chain and lists the known ones", async () => {
    vi.stubEnv("TOKENOMICS_CHAIN", "gnosis");
    await expect(load()).rejects.toThrow(
      /TOKENOMICS_CHAIN="gnosis" is not configured\. Known chains: robinhood, base/,
    );
  });

  it("keeps every address lowercase (SQD log addresses are lowercase)", async () => {
    const { CHAINS } = await load();
    for (const chain of Object.values(CHAINS)) {
      expect(chain.olas).toBe(chain.olas.toLowerCase());
    }
  });
});

describe("assertPortalDataset", () => {
  it("accepts unset, blank, or any host serving the chain's dataset", async () => {
    const { CHAINS, assertPortalDataset } = await load();
    expect(() => assertPortalDataset(CHAINS.base, {})).not.toThrow();
    expect(() => assertPortalDataset(CHAINS.base, { SQD_PORTAL_URL: " " })).not.toThrow();
    expect(() =>
      assertPortalDataset(CHAINS.base, {
        SQD_PORTAL_URL: "https://shared.portal.sqd.dev/datasets/base-mainnet/",
      }),
    ).not.toThrow();
  });

  it("refuses another chain's dataset, naming the variable and the chain", async () => {
    const { CHAINS, assertPortalDataset } = await load();
    expect(() =>
      assertPortalDataset(CHAINS.base, {
        SQD_PORTAL_URL: "https://portal.sqd.dev/datasets/robinhood-mainnet",
      }),
    ).toThrow(/SQD_PORTAL_URL .* is not the base-mainnet dataset for TOKENOMICS_CHAIN=base/);
  });

  it("stops the processor from loading with a mismatched dataset", async () => {
    vi.stubEnv("TOKENOMICS_CHAIN", "base");
    vi.stubEnv("SQD_PORTAL_URL", "https://portal.sqd.dev/datasets/robinhood-mainnet");
    await expect(import("../src/processor")).rejects.toThrow(/base-mainnet/);
  });
});
