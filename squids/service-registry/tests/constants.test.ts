import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAIN is resolved at import time, so each case stubs the env and imports
// src/constants fresh.
const load = () => import("../src/constants");

/** address + startBlock of a data source in the in-tree Base marketplace manifest. */
function manifestSource(name: string): { address: string; startBlock: number } {
  const yaml = readFileSync(
    resolve(__dirname, "../../../subgraphs/marketplace/subgraph.base.yaml"),
    "utf8",
  );
  const block = yaml
    .split(/\r?\n\s*- kind:/)
    .find((b) => new RegExp(`\\n\\s*name: ${name}\\r?\\n`).test(b));
  if (block == null) throw new Error(`no ${name} data source`);
  const address = /address: "(0x[0-9a-fA-F]{40})"/.exec(block)![1];
  const startBlock = Number(/startBlock: (\d+)/.exec(block)![1]);
  return { address, startBlock };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("SERVICE_REGISTRY_CHAIN", () => {
  it("defaults to robinhood when unset, so the live deployment needs no new env", async () => {
    vi.stubEnv("SERVICE_REGISTRY_CHAIN", undefined);
    const c = await load();
    expect(c.CHAIN.name).toBe("robinhood");
    expect(c.START_BLOCK).toBe(58_564_789);
  });

  it("selects Base with the Base manifests' ServiceRegistryL2 address and start block", async () => {
    vi.stubEnv("SERVICE_REGISTRY_CHAIN", "base");
    const c = await load();
    expect(c.CHAIN.name).toBe("base");
    // Cross-checked against the in-tree Base manifest that indexes the same
    // contract (subgraphs/marketplace/subgraph.base.yaml, ServiceRegistryL2
    // data source). Studio's service-registry subgraph.base.yaml (the parity
    // target, not in this repo) has the same address and 10,827,380.
    const reg = manifestSource("ServiceRegistryL2");
    expect(c.SERVICE_REGISTRY_L2).toBe(reg.address.toLowerCase());
    expect(c.START_BLOCK).toBe(reg.startBlock);
    expect(c.CHAIN.portalDataset).toMatch(/\/datasets\/base-mainnet$/);
  });

  it("every chain: well-formed addresses, bridger starts at or after the registry, exact dataset URL", async () => {
    const { CHAINS } = await load();
    for (const chain of Object.values(CHAINS)) {
      for (const a of [chain.serviceRegistryL2, chain.identityRegistryBridger]) {
        expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
      expect(chain.identityRegistryBridgerStartBlock).toBeGreaterThanOrEqual(chain.startBlock);
      expect(chain.portalDataset).toMatch(/^https:\/\/[^/]+\/datasets\/[\w-]+$/);
    }
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

  it("refuses an override for another chain's dataset, or one that only contains the name", async () => {
    const { CHAINS, portalFor } = await load();
    for (const url of [
      "https://portal.sqd.dev/datasets/robinhood-mainnet",
      "https://portal.sqd.dev/datasets/base-mainnet-sepolia",
      "https://portal.sqd.dev/datasets/coinbase-mainnet",
      "https://portal.sqd.dev/datasets/robinhood-mainnet?x=base-mainnet",
      "not a url base-mainnet",
    ]) {
      expect(() => portalFor(CHAINS.base, { SQD_PORTAL_URL: url, SQD_PORTAL_API_KEY: "k" })).toThrow(
        /does not point at the base-mainnet dataset/,
      );
    }
  });

  it("requires the key when SQD_PORTAL_URL overrides the chain's public dataset", async () => {
    const { CHAINS, portalFor } = await load();
    expect(() =>
      portalFor(CHAINS.base, { SQD_PORTAL_URL: "https://private.example/datasets/base-mainnet" }),
    ).toThrow(/SQD_PORTAL_API_KEY is required with a SQD_PORTAL_URL override/);
    // Setting the URL to the public default is not an override.
    expect(
      portalFor(CHAINS.base, { SQD_PORTAL_URL: "https://portal.sqd.dev/datasets/base-mainnet" }),
    ).toBe("https://portal.sqd.dev/datasets/base-mainnet");
  });

  it("still requires the key for the private robinhood dataset", async () => {
    const { CHAINS, portalFor } = await load();
    expect(() => portalFor(CHAINS.robinhood, {})).toThrow(
      /SQD_PORTAL_API_KEY is required for the private robinhood-mainnet dataset/,
    );
  });
});
