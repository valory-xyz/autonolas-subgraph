import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SERVICE_REGISTRY_CHAIN", "polygon");
  vi.stubEnv("SQD_PORTAL_URL", undefined);
  vi.stubEnv("SQD_PORTAL_API_KEY", undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("retains the Polygon registry and original bridger ranges from Studio", async () => {
  const c = await import("../src/constants");
  expect(c.CHAIN).toMatchObject({
    name: "polygon",
    startBlock: 41_783_952,
    serviceRegistryL2: "0xe3607b00e75f6405248323a9417ff6b39b244b50",
    identityRegistryBridger: "0x6f121552765424f0b2331b541c0938480ca314db",
    identityRegistryBridgerStartBlock: 82_500_133,
    portalDataset: "https://portal.sqd.dev/datasets/polygon-mainnet",
  });
  // Independent in-tree manifest indexes the same registry deployment.
  const manifest = readFileSync(new URL("../../../subgraphs/marketplace/subgraph.polygon.yaml", import.meta.url), "utf8");
  const source = manifest.split(/^  - kind:/m).find(s => /name: ServiceRegistryL2\s/.test(s))!;
  expect(source.toLowerCase()).toContain(c.SERVICE_REGISTRY_L2);
  expect(source).toMatch(/startBlock: 41783952/);
  expect(c.portalFor(c.CHAIN, {})).toBe(c.CHAIN.portalDataset);
});

it("subscribes to lifecycle, legacy and new wallet clearing, and Safe activity", async () => {
  const { BLOCK_RANGE, LOG_QUERIES, dataSource } = await import("../src/processor");
  const registry = await import("../src/abi/ServiceRegistryL2/events");
  const bridger = await import("../src/abi/IdentityRegistryBridge/events");
  const safe = await import("../src/abi/GnosisSafe/events");
  expect(dataSource).toBeDefined();
  expect(BLOCK_RANGE).toEqual({ from: 41_783_952 });
  expect(LOG_QUERIES).toHaveLength(3);
  expect(LOG_QUERIES[0]).toMatchObject({
    where: {
      address: ["0xe3607b00e75f6405248323a9417ff6b39b244b50"],
      topic0: [registry.CreateService.topic, registry.UpdateService.topic,
        registry.CreateMultisigWithAgents.topic, registry.RegisterInstance.topic, registry.TerminateService.topic],
    },
    include: { transaction: true },
  });
  expect(LOG_QUERIES[1]).toEqual({
    where: {
      address: ["0x6f121552765424f0b2331b541c0938480ca314db"],
      topic0: [bridger.ServiceAgentLinked.topic, bridger.AgentWalletSet.topic,
        bridger.AgentMultisigUpdated.topic, bridger.MetadataSet.topic],
    },
    range: { from: 82_500_133 },
  });
  expect(LOG_QUERIES[2].where).toEqual({
    topic0: [safe.ExecutionSuccess.topic, safe.ExecutionFromModuleSuccess.topic],
  });
}, 30_000);

it("rejects a portal accidentally left pointing at Base", async () => {
  vi.stubEnv("SQD_PORTAL_URL", "https://portal.sqd.dev/datasets/base-mainnet");
  await expect(import("../src/processor")).rejects.toThrow(/polygon-mainnet/);
});
