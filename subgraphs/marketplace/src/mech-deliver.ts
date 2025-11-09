import { BigInt, Bytes, JSONValue, dataSource, json, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { ParsedDelivery, Deliver, Request } from "../generated/schema";

let UNHANDLED_TYPE = '[unhandled type]';

export function handleMechDeliver(content: Bytes): void {
  let hash = dataSource.stringParam();
  let context = dataSource.context();
  let deliveryId = context.getBytes('deliveryId');
  let baseHash = context.getString('ipfsBase');

  if (baseHash === null || deliveryId === null) {
    log.critical("ParsedDelivery: Missing context for delivery {}", [hash]);
    return;
  }

  let deliver = Deliver.load(deliveryId);
  if (deliver === null) {
    log.critical("ParsedDelivery: Deliver entity not found for deliveryId {}", [deliveryId.toHexString()]);
    return;
  }

  let obj = json.try_fromBytes(content);
  if (obj.isError) {
    log.critical("ParsedDelivery: Error parsing delivery {0}: {1}", [
      deliveryId.toHexString(),
      content.toString(),
    ]);
    return;
  }

  if (obj.value.kind !== JSONValueKind.OBJECT) {
    log.critical(
      "ParsedDelivery: Unexpected JSON kind for delivery {0}, received kind {1}",
      [deliveryId.toHexString(), obj.value.kind.toString()]
    );
    return;
  }

  let parsedDeliver = createParsedDelivery(deliveryId, baseHash, content);
  let parsedObject = obj.value.toObject();

  let requestIdStr = resolveRequestId(parsedObject.get('requestId'));
  if (requestIdStr === null) {
    log.critical("ParsedDelivery: requestId not found in IPFS content for delivery {0}", [
      deliveryId.toHexString(),
    ]);
    return;
  }

  if (!linkDeliverToRequest(deliver, parsedDeliver, requestIdStr, deliveryId.toHexString())) {
    return;
  }

  applyModel(parsedObject.get('metadata'), deliver, parsedDeliver);
  applyResponse(parsedObject.get('result'), deliver, parsedDeliver);

  parsedDeliver.save();
  deliver.save();
}

function createParsedDelivery(
  deliveryId: Bytes,
  baseHash: string,
  content: Bytes
): ParsedDelivery {
  let parsedDeliver = new ParsedDelivery(deliveryId);
  parsedDeliver.content = content.toString();
  parsedDeliver.hash = baseHash;
  parsedDeliver.deliver = deliveryId;
  parsedDeliver.model = UNHANDLED_TYPE;
  parsedDeliver.response = UNHANDLED_TYPE;
  return parsedDeliver;
}

function resolveRequestId(requestIdValue: JSONValue | null): string | null {
  if (requestIdValue === null) {
    return null;
  }

  if (requestIdValue.kind === JSONValueKind.NUMBER) {
    return requestIdValue.toBigInt().toHexString();
  }

  if (requestIdValue.kind !== JSONValueKind.STRING) {
    return null;
  }

  return normalizeRequestId(requestIdValue.toString());
}

function normalizeRequestId(value: string): string | null {
  let trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let lower = trimmed.toLowerCase();
  if (lower.startsWith('0x')) {
    return lower;
  }

  if (!isDecimalString(trimmed)) {
    return null;
  }

  return BigInt.fromString(trimmed).toHexString();
}

function isDecimalString(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

function linkDeliverToRequest(
  deliver: Deliver,
  parsedDeliver: ParsedDelivery,
  requestId: string,
  deliveryIdHex: string
): boolean {
  if (!linkDeliverWithRequestOnly(deliver, requestId, deliveryIdHex)) {
    return false;
  }
  parsedDeliver.request = requestId;
  return true;
}

function linkDeliverWithRequestOnly(
  deliver: Deliver,
  requestId: string,
  deliveryIdHex: string
): boolean {
  let existingRequest = Request.load(requestId);
  if (existingRequest === null) {
    log.critical(
      "ParsedDelivery: Request {0} not found for delivery {1}. Request event was not processed.",
      [requestId, deliveryIdHex]
    );
    return false;
  }
  deliver.request = requestId;
  return true;
}

function applyModel(
  metadataValue: JSONValue | null,
  deliver: Deliver,
  parsedDeliver: ParsedDelivery
): void {
  if (metadataValue === null || metadataValue.kind !== JSONValueKind.OBJECT) {
    return;
  }

  let metadataObj = metadataValue.toObject();
  let model = metadataObj.get('model');
  if (model !== null && model.kind === JSONValueKind.STRING) {
    let value = model.toString();
    parsedDeliver.model = value;
    deliver.model = value;
  }
}

function applyResponse(
  responseValue: JSONValue | null,
  deliver: Deliver,
  parsedDeliver: ParsedDelivery
): void {
  if (responseValue === null || responseValue.kind !== JSONValueKind.STRING) {
    return;
  }

  let responseStr = responseValue.toString();
  parsedDeliver.response = responseStr;
  deliver.toolResponse = responseStr;
}