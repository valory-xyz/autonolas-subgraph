import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("STAKING_CHAIN", "polygon");
  vi.stubEnv("SQD_PORTAL_URL", undefined);
  vi.stubEnv("SQD_PORTAL_API_KEY", undefined);
  vi.stubEnv("INGEST_SOURCE", "portal");
  vi.stubEnv("STAKING_TO_BLOCK", undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("replays Polygon from the Studio factory boundary with Polygon OLAS accounting", async () => {
  // Studio subgraphs/staking/subgraph.matic.yaml and shared/constants.ts.
  const { CHAIN } = await import("../src/constants");
  expect(CHAIN).toMatchObject({
    name: "polygon",
    chainId: 137,
    startBlock: 62_213_142,
    stakingFactory: "0x46c0d07f55d4f9b5eed2fc9680b5953e5fd7b461",
    olas: "0xfef5d947472e72efbb2e388c730b7428406f2f95",
    portalDataset: "https://portal.sqd.dev/datasets/polygon-mainnet",
    portalRequiresApiKey: false,
  });
  const { BLOCK_RANGE, LOG_QUERIES, dataSource, INGEST_SOURCE } = await import("../src/processor");
  const factory = await import("../src/abi/StakingFactory/events");
  const v4 = await import("../src/abi/StakingTokenV4/events");
  const legacy = await import("../src/abi/StakingProxy/events");
  expect(dataSource).toBeDefined();
  expect(INGEST_SOURCE).toBe("portal");
  expect(BLOCK_RANGE).toEqual({ from: 62_213_142 });
  expect(LOG_QUERIES[0].where).toEqual({
    address: [CHAIN.stakingFactory],
    topic0: Object.values(factory).map(e => e.topic),
  });
  // Both versions are discovered dynamically; no implementation addresses or
  // activation-block guess may replace the historical factory subscription.
  expect(LOG_QUERIES[1].where?.address).toBeUndefined();
  expect(new Set(LOG_QUERIES[1].where?.topic0)).toEqual(
    new Set([...Object.values(v4), ...Object.values(legacy)].map(e => e.topic)),
  );
}, 30_000);

it("uses the Polygon RPC network when portal access is unavailable", async () => {
  vi.stubEnv("INGEST_SOURCE", "rpc");
  const { INGEST_SOURCE, dataSource } = await import("../src/processor");
  const { getIngestionConfig } = await import("@olas/squid-shared");
  const { CHAIN } = await import("../src/constants");
  expect(INGEST_SOURCE).toBe("rpc");
  expect(dataSource).toBeDefined();
  expect(getIngestionConfig(CHAIN, {}).rpc).toMatchObject({
    network: 137,
    url: "https://rpc-gate.autonolas.tech/polygon-rpc/",
  });
}, 30_000);

it.each([
  ["0xfef5d947472e72efbb2e388c730b7428406f2f95", true],
  ["0x54330d28ca3357f294334bdc454a032e7f353416", false],
])("only counts Polygon OLAS when the instance uses %s", async (token, isOlasStaking) => {
  const { StakingReader } = await import("../src/rpc");
  const functions = await import("../src/abi/StakingProxy/functions");
  const word = (n: number) => n.toString(16).padStart(64, "0");
  const calls: unknown[][] = [];
  const reader = new StakingReader(async (_method, params) => {
    calls.push(params);
    const data = (params[0] as { data: string }).data;
    if (data === functions.stakingToken.encode({}))
      return `0x${token.slice(2).padStart(64, "0")}`;
    if (data === functions.VERSION.encode({}))
      return `0x${word(32)}${word(5)}${Buffer.from("0.4.0").toString("hex").padEnd(64, "0")}`;
    return "0x"; // Older/optional getters may be absent; never read latest.
  }, () => {});
  const config = await reader.config("0x" + "11".repeat(20), 62_213_143n);
  expect(config).toMatchObject({ version: "0.4.0", eventsIndexed: true, isOlasStaking });
  expect(calls.every(params => params[1] === "0x3b54c17")).toBe(true);
});
