import { BigInt, Bytes, JSONValue, dataSource, json, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { ParsedDelivery, Deliver, Request } from "../generated/schema";

let UNHANDLED_TYPE = '[unhandled type]';

export function handleMechDeliver(content: Bytes): void {
  let hash = dataSource.stringParam();
  let context = dataSource.context();
  let deliveryId = context.getBytes('deliveryId');
  let baseHash = context.getString('ipfsBase');

  if (baseHash === null || deliveryId === null) {
    log.error("ParsedDelivery: Missing context for delivery {}", [hash]);
    return;
  }

  let obj = json.try_fromBytes(content);
  if (obj.isError) {
    log.error("ParsedDelivery: Error parsing delivery {0}: {1}", [
      deliveryId.toHexString(),
      content.toString(),
    ]);
    return;
  }

  if (obj.value.kind !== JSONValueKind.OBJECT) {
    log.error(
      "ParsedDelivery: Unexpected JSON kind for delivery {0}, received kind {1}",
      [deliveryId.toHexString(), obj.value.kind.toString()]
    );
    return;
  }

  let parsedDeliver = createParsedDelivery(deliveryId, baseHash, content);
  let parsedObject = obj.value.toObject();

  let requestIdValue = parsedObject.get('requestId');
  if (requestIdValue === null) {
    log.warning("ParsedDelivery: requestId not found in IPFS content for delivery {0}", [
      deliveryId.toHexString(),
    ]);
    return;
  }

  // Handle requestId as number or string
  let requestIdStr: string;
  if (requestIdValue.kind === JSONValueKind.NUMBER) {
    requestIdStr = requestIdValue.toBigInt().toHexString();
  } else if (requestIdValue.kind === JSONValueKind.STRING) {
    requestIdStr = requestIdValue.toString().toLowerCase();
  } else {
    log.warning("ParsedDelivery: requestId has unexpected type for delivery {0}", [
      deliveryId.toHexString(),
    ]);
    return;
  }

  parsedDeliver.request = requestIdStr;
  applyModel(parsedObject.get('metadata'), parsedDeliver);
  applyResponse(parsedObject.get('result'), parsedDeliver);
  parsedDeliver.save();

  // Try to update Deliver entity if it exists (it should, but may not due to reorg)
  let deliver = Deliver.load(deliveryId);
  if (deliver !== null) {
    deliver.model = parsedDeliver.model;
    deliver.toolResponse = parsedDeliver.response;
    
    // Link to request if not already linked (usually already done in handleDeliver)
    if (deliver.request === null) {
      let existingRequest = Request.load(requestIdStr);
      if (existingRequest !== null) {
        deliver.request = requestIdStr;
      }
    }
    
    deliver.save();
  } else {
    log.warning(
      "ParsedDelivery: Deliver entity not found for deliveryId {}. ParsedDelivery saved but Deliver entity not updated. This may occur due to blockchain reorg.",
      [deliveryId.toHexString()]
    );
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

function applyModel(
  metadataValue: JSONValue | null,
  parsedDeliver: ParsedDelivery
): void {
  if (metadataValue === null || metadataValue.kind !== JSONValueKind.OBJECT) {
    return;
  }

  let metadataObj = metadataValue.toObject();
  let model = metadataObj.get('model');
  if (model !== null && model.kind === JSONValueKind.STRING) {
    parsedDeliver.model = model.toString();
  }
}

function applyResponse(
  responseValue: JSONValue | null,
  parsedDeliver: ParsedDelivery
): void {
  if (responseValue === null || responseValue.kind !== JSONValueKind.STRING) {
    return;
  }

  parsedDeliver.response = responseValue.toString();
}