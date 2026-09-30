import { expect, it } from "vitest";
import { dataSource, LOG_QUERIES, selectIngestSource } from "../src/processor";

// Importing the real source also checks that RPC adapter peer dependencies exist.
it("constructs the source with its SDK runtime dependencies", () => {
  expect(dataSource).toBeDefined();
  expect(LOG_QUERIES.length).toBeGreaterThan(0);
});
it("selects RPC without a portal key and allows an explicit override", () => {
  expect(selectIngestSource({})).toBe("rpc");
  expect(selectIngestSource({ SQD_PORTAL_API_KEY: "test" })).toBe("portal");
  expect(
    selectIngestSource({ INGEST_SOURCE: "rpc", SQD_PORTAL_API_KEY: "test" }),
  ).toBe("rpc");
  expect(() => selectIngestSource({ INGEST_SOURCE: "unknown" })).toThrow();
});
