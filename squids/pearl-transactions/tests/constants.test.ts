import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAIN is resolved at import time, so each case stubs the env and imports
// src/constants fresh.
const load = () => import("../src/constants");

describe("PEARL_TRANSACTIONS_CHAIN", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to matic when unset, so Polygon deployments need no new env", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", undefined as unknown as string);
    delete process.env.PEARL_TRANSACTIONS_CHAIN;
    const c = await load();
    expect(c.CHAIN.name).toBe("matic");
    expect(c.START_BLOCK).toBe(80_360_433);
  });

  it("selects Base from 10,827,380 with Base addresses and portal", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "base");
    const c = await load();
    expect(c.CHAIN.name).toBe("base");
    expect(c.START_BLOCK).toBe(10_827_380);
    expect(c.CHAIN.portalDataset).toBe("https://portal.sqd.dev/datasets/base-mainnet");
    expect(c.SERVICE_REGISTRY_L2).toBe("0x3c1ff68f5aa342d296d4dee4bb1cacca912d95fe");
    expect(c.ERC20_TOKENS).toEqual([
      "0x54330d28ca3357f294334bdc454a032e7f353416", // OLAS
      "0x4200000000000000000000000000000000000006", // WETH
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
    ]);
    expect(c.knownTokenSymbol("0x4200000000000000000000000000000000000006")).toBe("WETH");
  });

  it("trims whitespace around the name", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", " base\n");
    expect((await load()).CHAIN.name).toBe("base");
  });

  it.each(["", "  \n"])(
    "treats an empty / whitespace-only value (%j) as unset, like rpcFromEnv",
    async (value) => {
      vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", value);
      expect((await load()).CHAIN.name).toBe("matic");
    }
  );

  it("fails at startup on an unknown name, listing the known chains", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "polygon");
    await expect(load()).rejects.toThrow(
      /PEARL_TRANSACTIONS_CHAIN="polygon" is not configured\. Known chains: matic, gnosis, optimism, base/
    );
  });

  it("does not resolve inherited object keys as chains", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "toString");
    await expect(load()).rejects.toThrow(/is not configured/);
  });
});

describe("SQD_PORTAL_URL must match PEARL_TRANSACTIONS_CHAIN", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the chain's public dataset when unset or empty", async () => {
    const { CHAINS, portalUrlFor } = await load();
    expect(portalUrlFor(CHAINS.base, undefined)).toBe(CHAINS.base.portalDataset);
    expect(portalUrlFor(CHAINS.base, " ")).toBe(CHAINS.base.portalDataset);
  });

  it.each([
    "https://portal.sqd.dev/datasets/base-mainnet",
    "https://shared.portal.sqd.dev/datasets/base-mainnet",
    "https://shared.portal.sqd.dev/datasets/base-mainnet/",
  ])("accepts a matching dataset on either host: %s", async (url) => {
    const { CHAINS, portalUrlFor } = await load();
    expect(portalUrlFor(CHAINS.base, url)).toBe(url);
  });

  it("fails on another chain's dataset, naming both env vars", async () => {
    const { CHAINS, portalUrlFor } = await load();
    expect(() =>
      portalUrlFor(CHAINS.base, "https://shared.portal.sqd.dev/datasets/polygon-mainnet")
    ).toThrow(
      /^SQD_PORTAL_URL=".*polygon-mainnet" serves dataset "polygon-mainnet", but PEARL_TRANSACTIONS_CHAIN="base" needs "base-mainnet"/
    );
  });

  it("fails on a URL with no dataset segment", async () => {
    const { CHAINS, portalUrlFor } = await load();
    expect(() => portalUrlFor(CHAINS.matic, "https://portal.sqd.dev/")).toThrow(
      /serves dataset "\(none\)"/
    );
  });

  it("is enforced when the processor loads, i.e. at startup", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "base");
    vi.stubEnv("SQD_PORTAL_URL", "https://portal.sqd.dev/datasets/polygon-mainnet");
    await expect(import("../src/processor")).rejects.toThrow(/SQD_PORTAL_URL=/);

    vi.resetModules();
    vi.stubEnv("SQD_PORTAL_URL", "https://shared.portal.sqd.dev/datasets/base-mainnet");
    await expect(import("../src/processor")).resolves.toBeDefined();
  });
});

describe("CHAINS table", () => {
  it("keeps every address lowercase (handlers compare with ===)", async () => {
    vi.resetModules();
    const { CHAINS } = await load();
    for (const c of Object.values(CHAINS)) {
      const addrs = [
        c.serviceRegistryL2,
        c.serviceRegistryTokenUtility,
        c.stakingFactory,
        c.olas,
        c.wrappedNative,
        ...Object.keys(c.stablecoins),
        ...c.allowedStakingImplementations,
      ];
      for (const a of addrs) expect(a).toBe(a.toLowerCase());
    }
  });
});
