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
import { handleParsedDelivery } from "../src/marketplace/parsed-delivery-file";

const UNHANDLED_TYPE = "[unhandled type]";

// Matches the keys written by spawnParsedDeliveryFile (delivery-metadata.ts CTX_* constants).
function contextFor(
  deliverIdHex: string,
  requestIdHex: string,
  baseHash: string
): DataSourceContext {
  let ctx = new DataSourceContext();
  ctx.setString("deliverId", deliverIdHex);
  ctx.setString("deliverRequest", requestIdHex);
  ctx.setString("baseHash", baseHash);
  return ctx;
}

describe("Offchain ParsedDelivery file data source", () => {
  afterEach((): void => {
    clearStore();
    dataSourceMock.resetValues();
  });

  // Schema-equivalence with the sync mech-deliveries test (same fixture, same fields).
  test("parses delivery metadata into ParsedDelivery (schema-equivalent to sync path)", () => {
    const deliverId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const requestId = "0x00000000000000000000000000000000000000000000000000000000000000f1";
    const baseHash = "f01701220deadbeef";
    dataSourceMock.setContext(contextFor(deliverId, requestId, baseHash));

    handleParsedDelivery(readFile("tests/ipfs_mocks/mech-response.json"));

    const content = readFile("tests/ipfs_mocks/mech-response.json").toString();
    assert.entityCount("ParsedDelivery", 1);
    assert.fieldEquals("ParsedDelivery", deliverId, "content", content);
    assert.fieldEquals("ParsedDelivery", deliverId, "hash", baseHash);
    assert.fieldEquals("ParsedDelivery", deliverId, "request", requestId);
    assert.fieldEquals("ParsedDelivery", deliverId, "model", "gpt-4.1-2025-04-14");
    assert.fieldEquals(
      "ParsedDelivery",
      deliverId,
      "response",
      '{"p_yes": 0.99, "p_no": 0.01, "info_utility": 1.0, "confidence": 0.99}'
    );
  });

  test("unexpected structure falls back to UNHANDLED_TYPE and still saves", () => {
    const deliverId = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const requestId = "0x00000000000000000000000000000000000000000000000000000000000000ff";
    const baseHash = "f01701220badcafe0";
    dataSourceMock.setContext(contextFor(deliverId, requestId, baseHash));

    handleParsedDelivery(readFile("tests/ipfs_mocks/mech-invalid-response.json"));

    assert.entityCount("ParsedDelivery", 1);
    assert.fieldEquals("ParsedDelivery", deliverId, "model", UNHANDLED_TYPE);
    assert.fieldEquals("ParsedDelivery", deliverId, "response", UNHANDLED_TYPE);
  });

  test("idempotent: second call for the same deliverId does not duplicate", () => {
    const deliverId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const requestId = "0x00000000000000000000000000000000000000000000000000000000000000f1";
    const baseHash = "f01701220deadbeef";
    dataSourceMock.setContext(contextFor(deliverId, requestId, baseHash));

    handleParsedDelivery(readFile("tests/ipfs_mocks/mech-response.json"));
    handleParsedDelivery(readFile("tests/ipfs_mocks/mech-response.json"));

    assert.entityCount("ParsedDelivery", 1);
  });
});
