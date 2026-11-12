import { assert, clearStore, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { handleDeliver, handleRequest } from "../src/agent-mech";
import { createMechDeliveryEvent, createMechRequestEvent } from "./agent-mech-utils";

const DIGEST = "0x1111111111111111111111111111111111111111111111111111111111111111";
const BASE_HASH = "f017012201111111111111111111111111111111111111111111111111111111111111111";

// Matchstick 0.6 retains spawned data sources across tests even after clearStore().
// Keep the source-count assertions in one scenario, in their own test module.
test("legacy file sources preserve layouts and uint256 IDs, reject malformed digests, and deduplicate deliveries", () => {
  clearStore();
  const sender = Address.fromString("0x0000000000000000000000000000000000000001");
  const decimalId = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  const requestId = BigInt.fromString(decimalId);

  // No IPFS mock: indexing must not fetch or parse metadata synchronously.
  handleRequest(createMechRequestEvent(sender, requestId, Bytes.fromHexString(DIGEST)));
  assert.dataSourceCount("ParsedRequestFile", 2);
  assert.dataSourceExists("ParsedRequestFile", BASE_HASH + "/metadata.json");
  assert.dataSourceExists("ParsedRequestFile", BASE_HASH);
  assert.entityCount("ParsedRequest", 0);

  const delivery = createMechDeliveryEvent(sender, requestId, Bytes.fromHexString(DIGEST));
  handleDeliver(delivery);
  handleDeliver(delivery);
  assert.dataSourceCount("ParsedDeliveryFile", 2);
  assert.dataSourceExists("ParsedDeliveryFile", BASE_HASH + "/" + decimalId + "/metadata.json");
  assert.dataSourceExists("ParsedDeliveryFile", BASE_HASH + "/" + decimalId);
  assert.entityCount("ParsedDelivery", 0);
  assert.entityCount("Deliver", 1);
  assert.fieldEquals("Global", "", "totalDeliveries", "1");

  const malformed: Bytes[] = [
    Bytes.fromHexString("0x"),
    Bytes.fromHexString("0xdeadbeef"),
    Bytes.fromHexString(DIGEST + "11"),
  ];
  for (let i = 0; i < malformed.length; i++) {
    const id = BigInt.fromI32(100 + i);
    handleRequest(createMechRequestEvent(sender, id, malformed[i]));
    const event = createMechDeliveryEvent(sender, id, malformed[i]);
    event.logIndex = BigInt.fromI32(100 + i);
    handleDeliver(event);
    assert.fieldEquals("Request", id.toHexString(), "isDelivered", "true");
  }

  // Malformed hashes must never reach file-source creation (which Graph Node
  // rejects), but must still preserve the events and their chain counters.
  assert.dataSourceCount("ParsedRequestFile", 2);
  assert.dataSourceCount("ParsedDeliveryFile", 2);
  assert.entityCount("Request", 4);
  assert.entityCount("Deliver", 4);
  assert.entityCount("ParsedRequest", 0);
  assert.entityCount("ParsedDelivery", 0);
  assert.fieldEquals("Global", "", "totalRequests", "4");
  assert.fieldEquals("Global", "", "totalDeliveries", "4");
  assert.fieldEquals("Global", "", "totalTransactions", "8");
  assert.fieldEquals("Global", "", "totalPredictRequests", "0");
  clearStore();
});
