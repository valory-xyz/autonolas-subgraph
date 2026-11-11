import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAIN is resolved at import time, so each case stubs the env and imports
// src/constants fresh.
const load = () => import("../src/constants");

describe("PEARL_TRANSACTIONS_CHAIN", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to matic when unset, so Polygon deployments need no new env", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", undefined);
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

  it("selects Robinhood from 58,564,789 with OLAS, WETH and USDG only", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "robinhood");
    const c = await load();
    expect(c.CHAIN.name).toBe("robinhood");
    expect(c.START_BLOCK).toBe(58_564_789);
    expect(c.CHAIN.portalDataset).toBe("https://portal.sqd.dev/datasets/robinhood-mainnet");
    expect(c.CHAIN.defaultRpc).toBe("https://rpc-gate.autonolas.tech/robinhood-rpc/");
    expect(c.SERVICE_REGISTRY_L2).toBe("0xe3607b00e75f6405248323a9417ff6b39b244b50");
    expect(c.SRTU).toBe("0x3d77596beb0f130a4415df3d2d8232b3d3d31e44");
    expect(c.STAKING_FACTORY).toBe("0x1bd1505b711fb58c54ca3712e6bef47a133892d9");
    expect(c.ERC20_TOKENS).toEqual([
      "0x092963938debd8013a2e545b3549f8a5ec0d2286", // OLAS
      "0x0bd7d308f8e1639fab988df18a8011f41eacad73", // WETH
      "0x5fc5360d0400a0fd4f2af552add042d716f1d168", // USDG
    ]);
    expect(c.knownTokenSymbol("0x0bd7d308f8e1639fab988df18a8011f41eacad73")).toBe("WETH");
    expect(c.knownTokenSymbol("0x5fc5360d0400a0fd4f2af552add042d716f1d168")).toBe("USDG");
    expect(c.CHAIN.allowedStakingImplementations).toEqual([]);
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
      /PEARL_TRANSACTIONS_CHAIN="polygon" is not configured\. Known chains: matic, gnosis, optimism, base, robinhood/
    );
  });

  it("does not resolve inherited object keys as chains", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "toString");
    await expect(load()).rejects.toThrow(/is not configured/);
  });
});

describe("SQD_PORTAL_URL must match PEARL_TRANSACTIONS_CHAIN", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SQD_PORTAL_URL", undefined);
  });
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

  it("fails on Robinhood when the URL serves another chain's dataset", async () => {
    const { CHAINS, portalUrlFor } = await load();
    expect(portalUrlFor(CHAINS.robinhood, undefined)).toBe(CHAINS.robinhood.portalDataset);
    expect(() =>
      portalUrlFor(CHAINS.robinhood, "https://portal.sqd.dev/datasets/base-mainnet")
    ).toThrow(
      /serves dataset "base-mainnet", but PEARL_TRANSACTIONS_CHAIN="robinhood" needs "robinhood-mainnet"/
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
    vi.stubEnv("SQD_PORTAL_API_KEY", "");
    await expect(import("../src/processor")).rejects.toThrow(/SQD_PORTAL_URL override/);

    vi.resetModules();
    vi.stubEnv("SQD_PORTAL_API_KEY", "test-key");
    await expect(import("../src/processor")).resolves.toBeDefined();
  });
});

describe("SQD_PORTAL_API_KEY on a private dataset", () => {
  // An explicit `undefined` argument falls back to process.env, so a key
  // exported in the developer's shell must not leak into these cases.
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SQD_PORTAL_API_KEY", undefined);
    vi.stubEnv("SQD_PORTAL_URL", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "", "  "])(
    "fails on Robinhood when the key is %j, naming the dataset",
    async (key) => {
      const { CHAINS, portalApiKeyFor } = await load();
      expect(() => portalApiKeyFor(CHAINS.robinhood, key)).toThrow(
        /SQD_PORTAL_API_KEY is required for the private robinhood-mainnet dataset/
      );
    }
  );

  it("returns the trimmed key on Robinhood", async () => {
    const { CHAINS, portalApiKeyFor } = await load();
    expect(portalApiKeyFor(CHAINS.robinhood, " k\n")).toBe("k");
  });

  it("stays optional on the public-dataset chains", async () => {
    const { CHAINS, portalApiKeyFor } = await load();
    for (const c of [CHAINS.matic, CHAINS.gnosis, CHAINS.optimism, CHAINS.base]) {
      expect(portalApiKeyFor(c, undefined)).toBeUndefined();
    }
  });

  it("sends the trimmed key in the x-api-key header on Robinhood", async () => {
    const { CHAINS, portalOptionsFor } = await load();
    expect(portalOptionsFor(CHAINS.robinhood, undefined, " k\n")).toEqual({
      url: "https://portal.sqd.dev/datasets/robinhood-mainnet",
      http: { headers: { "x-api-key": "k" } },
    });
  });

  it("still sends the key on the public-dataset chains when one is set", async () => {
    const { CHAINS, portalOptionsFor } = await load();
    for (const c of [CHAINS.matic, CHAINS.gnosis, CHAINS.optimism, CHAINS.base]) {
      expect(portalOptionsFor(c, undefined, " k\n")).toEqual({
        url: c.portalDataset,
        http: { headers: { "x-api-key": "k" } },
      });
    }
  });

  it.each([undefined, "", "  "])(
    "fails on a public-dataset chain whose SQD_PORTAL_URL is overridden when the key is %j",
    async (key) => {
      const { CHAINS, portalApiKeyFor, portalOptionsFor } = await load();
      const override = "https://shared.portal.sqd.dev/datasets/base-mainnet";
      const message = /SQD_PORTAL_API_KEY is required with a SQD_PORTAL_URL override/;
      expect(() => portalApiKeyFor(CHAINS.base, key, override)).toThrow(message);
      expect(() => portalOptionsFor(CHAINS.base, override, key)).toThrow(message);
    }
  );

  it("stays optional when SQD_PORTAL_URL is just the chain's public dataset", async () => {
    const { CHAINS, portalOptionsFor } = await load();
    expect(portalOptionsFor(CHAINS.matic, " " + CHAINS.matic.portalDataset + " ", undefined)).toBe(
      CHAINS.matic.portalDataset
    );
    expect(portalOptionsFor(CHAINS.matic, "", undefined)).toBe(CHAINS.matic.portalDataset);
  });

  it("uses the bare URL on a public-dataset chain with no key", async () => {
    const { CHAINS, portalOptionsFor } = await load();
    expect(portalOptionsFor(CHAINS.matic, undefined, undefined)).toBe(
      "https://portal.sqd.dev/datasets/polygon-mainnet"
    );
  });

  it("is enforced when the processor loads, i.e. at startup", async () => {
    vi.stubEnv("PEARL_TRANSACTIONS_CHAIN", "robinhood");
    vi.stubEnv("SQD_PORTAL_URL", "");
    vi.stubEnv("SQD_PORTAL_API_KEY", "");
    await expect(import("../src/processor")).rejects.toThrow(/SQD_PORTAL_API_KEY is required/);

    vi.resetModules();
    vi.stubEnv("SQD_PORTAL_API_KEY", "test-key");
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
