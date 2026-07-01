import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock,
  readFile,
} from "matchstick-as/assembly/index";
import { DataSourceContext } from "@graphprotocol/graph-ts";
import { handleParsedRequest } from "../src/marketplace/parsed-request-file";

const UNHANDLED_TYPE = "[unhandled type]";

// Matches the keys written by processOnChainRequest (request-metadata.ts CTX_* constants).
function contextFor(requestId: string, baseHash: string): DataSourceContext {
  let ctx = new DataSourceContext();
  ctx.setString("requestId", requestId);
  ctx.setString("baseHash", baseHash);
  return ctx;
}

describe("Offchain ParsedRequest file data source", () => {
  afterEach((): void => {
    clearStore();
    dataSourceMock.resetValues();
  });

  // Schema-equivalence: same fixture the sync-path tests use must produce the same fields,
  // so the two parsing paths can't silently drift apart.
  test("parses metadata.json into ParsedRequest (schema-equivalent to sync path)", () => {
    const requestId = "0x1234567890abcdef";
    const baseHash = "f01701220deadbeef";
    dataSourceMock.setContext(contextFor(requestId, baseHash));

    handleParsedRequest(readFile("tests/ipfs_mocks/mech-request.json"));

    const content = readFile("tests/ipfs_mocks/mech-request.json").toString();
    assert.entityCount("ParsedRequest", 1);
    assert.fieldEquals("ParsedRequest", requestId, "content", content);
    assert.fieldEquals("ParsedRequest", requestId, "hash", baseHash);
    assert.fieldEquals("ParsedRequest", requestId, "request", requestId);
    assert.fieldEquals("ParsedRequest", requestId, "tool", "prediction-request-rag");
  });

  test("invalid/unexpected JSON falls back to UNHANDLED_TYPE and still saves", () => {
    const requestId = "0x0000000000000000000000000000000000000001";
    const baseHash = "f01701220badbad00";
    dataSourceMock.setContext(contextFor(requestId, baseHash));

    handleParsedRequest(readFile("tests/ipfs_mocks/mech-invalid-response.json"));

    assert.entityCount("ParsedRequest", 1);
    assert.fieldEquals("ParsedRequest", requestId, "prompt", UNHANDLED_TYPE);
    assert.fieldEquals("ParsedRequest", requestId, "tool", UNHANDLED_TYPE);
  });

  // The bare-hash + metadata.json double-spawn relies on this: the second handler run is a no-op.
  test("idempotent: second call for the same requestId does not duplicate", () => {
    const requestId = "0x1234567890abcdef";
    const baseHash = "f01701220deadbeef";
    dataSourceMock.setContext(contextFor(requestId, baseHash));

    handleParsedRequest(readFile("tests/ipfs_mocks/mech-request.json"));
    handleParsedRequest(readFile("tests/ipfs_mocks/mech-request.json"));

    assert.entityCount("ParsedRequest", 1);
  });
});
