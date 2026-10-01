import { expect, it } from "vitest";
import { getIngestionConfig, selectIngestSource } from "../src/ingestion";

const chain = { chainId: 4663, portalDataset: "https://portal.example", defaultRpc: "https://rpc.example" };

it("defaults to RPC without a key and authenticates the portal when a key is supplied", () => {
  expect(getIngestionConfig(chain, {})).toEqual({
    source: "rpc",
    portal: chain.portalDataset,
    rpc: { url: chain.defaultRpc, network: chain.chainId, rpc: { verifyBlockHash: true, verifyLogsBloom: true } },
  });
  const config = getIngestionConfig(chain, {
    SQD_PORTAL_API_KEY: "test-key", SQD_PORTAL_URL: "https://private.example",
  });
  expect(config.source).toBe("portal");
  expect(config.portal).toEqual({ url: "https://private.example", http: { headers: { "x-api-key": "test-key" } } });
});

it("honours explicit source, RPC endpoint and ingestion rate overrides", () => {
  const config = getIngestionConfig(chain, {
    INGEST_SOURCE: " RPC ", SQD_PORTAL_API_KEY: "test-key", RPC_HTTP: "https://custom.example", RPC_RATE_LIMIT: "10",
  });
  expect(config.source).toBe("rpc");
  expect(config.rpc).toMatchObject({ url: "https://custom.example", rateLimit: 10 });
  expect(selectIngestSource({ INGEST_SOURCE: "portal" })).toBe("portal");
  expect(() => selectIngestSource({ INGEST_SOURCE: "unknown" })).toThrow('must be "portal" or "rpc"');
  expect(() => getIngestionConfig(chain, { RPC_RATE_LIMIT: "invalid" })).toThrow(
    "RPC_RATE_LIMIT must be a positive finite number",
  );
});

it("rejects non-positive and non-finite RPC rate limits", () => {
  for (const RPC_RATE_LIMIT of ["0", "-1", "Infinity"]) {
    expect(() => getIngestionConfig(chain, { RPC_RATE_LIMIT })).toThrow(
      "RPC_RATE_LIMIT must be a positive finite number",
    );
  }
});

it("requires a key only for an explicitly selected private Portal dataset", () => {
  const privateChain = { ...chain, portalRequiresApiKey: true };
  expect(() =>
    getIngestionConfig(privateChain, { INGEST_SOURCE: "portal" }),
  ).toThrow("SQD_PORTAL_API_KEY is required");
  expect(
    getIngestionConfig(privateChain, {
      INGEST_SOURCE: "portal",
      SQD_PORTAL_API_KEY: "test",
    }).source,
  ).toBe("portal");
  expect(getIngestionConfig(privateChain, {}).source).toBe("rpc");
});
