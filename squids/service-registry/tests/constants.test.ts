import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAIN is resolved at import time, so each case stubs the env and imports
// src/constants fresh.
const load = () => import("../src/constants");

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("SERVICE_REGISTRY_CHAIN", () => {
  it("defaults to robinhood when unset, so the live deployment needs no new env", async () => {
    vi.stubEnv("SERVICE_REGISTRY_CHAIN", undefined);
    const c = await load();
    expect(c.CHAIN.name).toBe("robinhood");
    expect(c.START_BLOCK).toBe(58_564_789);
  });

  it("selects Base from 10,827,380 with the Base subgraph's addresses", async () => {
    vi.stubEnv("SERVICE_REGISTRY_CHAIN", "base");
    const c = await load();
    expect(c.CHAIN.name).toBe("base");
    expect(c.START_BLOCK).toBe(10_827_380);
    expect(c.CHAIN.portalDataset).toBe("https://portal.sqd.dev/datasets/base-mainnet");
    expect(c.SERVICE_REGISTRY_L2).toBe("0x3c1ff68f5aa342d296d4dee4bb1cacca912d95fe");
    expect(c.IDENTITY_REGISTRY_BRIDGER).toBe("0x67722c823010ceb4bed5325fe109196c0f67d053");
    expect(c.IDENTITY_REGISTRY_BRIDGER_START_BLOCK).toBe(41_675_072);
  });

  it("refuses an unknown chain and lists the known ones", async () => {
    vi.stubEnv("SERVICE_REGISTRY_CHAIN", "polygon");
    await expect(load()).rejects.toThrow(
      /SERVICE_REGISTRY_CHAIN="polygon" is not configured\. Known chains: robinhood, base/,
    );
  });
});

describe("portalFor", () => {
  it("Base works keyless on the public dataset", async () => {
    const { CHAINS, portalFor } = await load();
    expect(portalFor(CHAINS.base, {})).toBe("https://portal.sqd.dev/datasets/base-mainnet");
    expect(portalFor(CHAINS.base, { SQD_PORTAL_URL: " ", SQD_PORTAL_API_KEY: "" })).toBe(
      "https://portal.sqd.dev/datasets/base-mainnet",
    );
  });

  it("sends the key as x-api-key when set, with a same-dataset override", async () => {
    const { CHAINS, portalFor } = await load();
    expect(
      portalFor(CHAINS.base, {
        SQD_PORTAL_URL: "https://shared.portal.sqd.dev/datasets/base-mainnet",
        SQD_PORTAL_API_KEY: "k",
      }),
    ).toEqual({
      url: "https://shared.portal.sqd.dev/datasets/base-mainnet",
      http: { headers: { "x-api-key": "k" } },
    });
  });

  it("refuses an override for another chain's dataset", async () => {
    const { CHAINS, portalFor } = await load();
    expect(() =>
      portalFor(CHAINS.base, {
        SQD_PORTAL_URL: "https://portal.sqd.dev/datasets/robinhood-mainnet",
      }),
    ).toThrow(/does not point at the base-mainnet dataset/);
  });

  it("still requires the key for the private robinhood dataset", async () => {
    const { CHAINS, portalFor } = await load();
    expect(() => portalFor(CHAINS.robinhood, {})).toThrow(
      /SQD_PORTAL_API_KEY is required for the private robinhood-mainnet dataset/,
    );
  });
});
