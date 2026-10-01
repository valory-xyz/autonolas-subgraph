import { expect, it } from "vitest";
import { BLOCK_RANGE, dataSource, LOG_QUERIES, selectIngestSource } from "../src/processor";
import { CHAIN } from "../src/constants";
import * as stakingFactory from "../src/abi/StakingFactory/events";
import * as stakingProxy from "../src/abi/StakingProxy/events";

// Importing the real source also checks that RPC adapter peer dependencies exist.
it("constructs the source with its SDK runtime dependencies", () => {
  expect(dataSource).toBeDefined();
  expect(LOG_QUERIES).toHaveLength(2);
  expect(LOG_QUERIES[0].where).toMatchObject({
    address: [CHAIN.stakingFactory],
    topic0: Object.values(stakingFactory).map((event) => event.topic),
  });
  expect(LOG_QUERIES[1].where).toMatchObject({
    topic0: Object.values(stakingProxy).map((event) => event.topic),
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
