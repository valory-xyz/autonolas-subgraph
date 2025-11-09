import { Bytes, JSONValue, dataSource, json, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { ParsedDelivery, Deliver, Request, DeliverForMech } from "../generated/schema";

let UNHANDLED_TYPE = '[unhandled type]';

export function handleMechDeliver(content: Bytes): void {
  let hash = dataSource.stringParam();
  let context = dataSource.context();
  let deliveryId = context.getBytes('deliveryId');
  let baseHash = context.getString('ipfsBase');

  if (baseHash === null || deliveryId === null) {
    log.error("Missing context for delivery: {}", [hash]);
    return;
  }

  let deliver = Deliver.load(deliveryId);
  if (deliver === null) {
    log.error("Deliver entity not found for deliveryId: {}", [deliveryId.toHexString()]);
    return;
  }

  let fallbackRequestId = getFallbackRequestId(deliveryId);

  let obj = json.try_fromBytes(content);
  if (obj.isError) {
    log.error("Error parsing deliver: {}", [content.toString()]);
    handleParseFailure(deliver, fallbackRequestId, deliveryId.toHexString());
    return;
  }

  if (obj.value.kind !== JSONValueKind.OBJECT) {
    log.warning(
      "ParsedDelivery: Unexpected JSON kind for delivery {0}, received kind {1}",
      [deliveryId.toHexString(), obj.value.kind.toString()]
    );
    handleParseFailure(deliver, fallbackRequestId, deliveryId.toHexString());
    return;
  }

  let parsedDeliver = createParsedDelivery(deliveryId, baseHash, content);
  let parsedObject = obj.value.toObject();

  let requestIdStr = resolveRequestId(parsedObject.get('requestId'), fallbackRequestId);
  let canCreateParsedDelivery = false;

  if (requestIdStr !== null) {
    canCreateParsedDelivery = linkDeliverToRequest(
      deliver,
      parsedDeliver,
      requestIdStr,
      deliveryId.toHexString()
    );
  } else {
    log.warning(
      "ParsedDelivery: requestId not found in IPFS content or DeliverForMech for delivery {0}",
      [deliveryId.toHexString()]
    );
  }

  applyModel(parsedObject.get('metadata'), deliver, parsedDeliver);
  applyResponse(parsedObject.get('result'), deliver, parsedDeliver);

  if (canCreateParsedDelivery) {
    parsedDeliver.save();
  }
  deliver.save();
}

function getFallbackRequestId(deliveryId: Bytes): string | null {
  let mechDelivery = DeliverForMech.load(deliveryId);
  if (mechDelivery === null || mechDelivery.requestId === null) {
    return null;
  }
  return mechDelivery.requestId;
}

function handleParseFailure(
  deliver: Deliver,
  fallbackRequestId: string | null,
  deliveryIdHex: string
): void {
  if (fallbackRequestId === null) {
    log.warning(
      "ParsedDelivery: Unable to link delivery {0} because no requestId was found in IPFS or DeliverForMech",
      [deliveryIdHex]
    );
    return;
  }

  if (linkDeliverWithRequestOnly(deliver, fallbackRequestId, deliveryIdHex)) {
    deliver.save();
  }
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

function resolveRequestId(
  requestIdValue: JSONValue | null,
  fallbackRequestId: string | null
): string | null {
  if (requestIdValue !== null) {
    if (requestIdValue.kind === JSONValueKind.NUMBER) {
      return requestIdValue.toBigInt().toHexString();
    }
    if (requestIdValue.kind === JSONValueKind.STRING) {
      return requestIdValue.toString();
    }
  }
  return fallbackRequestId;
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
    log.warning(
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