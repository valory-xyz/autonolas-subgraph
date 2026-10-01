import { expect, it } from "vitest";
import { BLOCK_RANGE, dataSource, LOG_QUERIES, selectIngestSource } from "../src/processor";
import { CHAIN } from "../src/constants";
import * as olas from "../src/abi/OLAS/events";

// Importing the real source also checks that RPC adapter peer dependencies exist.
it("constructs the source with its SDK runtime dependencies", () => {
  expect(dataSource).toBeDefined();
  expect(LOG_QUERIES).toHaveLength(1);
  expect(LOG_QUERIES[0].where).toMatchObject({
    address: [CHAIN.olas],
    topic0: [olas.Transfer.topic],
  });
  expect(BLOCK_RANGE.from).toBe(CHAIN.startBlock);
});
it("selects RPC without a portal key and allows an explicit override", () => {
  expect(selectIngestSource({})).toBe("rpc");
  expect(selectIngestSource({ SQD_PORTAL_API_KEY: "test" })).toBe("portal");
  expect(
    selectIngestSource({ INGEST_SOURCE: "rpc", SQD_PORTAL_API_KEY: "test" }),
  ).toBe("rpc");
  expect(() => selectIngestSource({ INGEST_SOURCE: "unknown" })).toThrow();
});
