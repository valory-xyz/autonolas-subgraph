import { Bytes, dataSource, json, JSONValueKind, log } from "@graphprotocol/graph-ts";
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

  // Load the Deliver entity to update it
  let deliver = Deliver.load(deliveryId);
  if (deliver === null) {
    log.error("Deliver entity not found for deliveryId: {}", [deliveryId.toHexString()]);
    return;
  }

  // Try to get requestId from DeliverForMech as fallback
  let mechDelivery = DeliverForMech.load(deliveryId);
  let fallbackRequestId: string | null = null;
  if (mechDelivery !== null && mechDelivery.requestId !== null) {
    fallbackRequestId = mechDelivery.requestId;
  }

  let parsedDeliver = new ParsedDelivery(deliveryId);

  let obj = json.try_fromBytes(content);
  if (obj.isError) {
    log.error("Error parsing deliver: {}", [content.toString()]);
    // Try to link using fallback requestId
    if (fallbackRequestId !== null) {
      let existingRequest = Request.load(fallbackRequestId);
      if (existingRequest !== null) {
        deliver.request = fallbackRequestId;
        deliver.save();
      } else {
        log.warning(
          "ParsedDelivery: Request {0} not found for delivery {1}. Request event was not processed.",
          [fallbackRequestId, deliveryId.toHexString()]
        );
      }
    }
    return;
  }

  parsedDeliver.content = content.toString();
  parsedDeliver.hash = baseHash;
  parsedDeliver.deliver = deliveryId;
  parsedDeliver.model = UNHANDLED_TYPE;
  parsedDeliver.response = UNHANDLED_TYPE;

  // Default values for Deliver entity
  deliver.model = UNHANDLED_TYPE;
  deliver.toolResponse = UNHANDLED_TYPE;

  if (obj.value.kind === JSONValueKind.OBJECT) {
    let parsed = obj.value.toObject();
    let response = parsed.get('result');
    let requestId = parsed.get('requestId');

    let canCreateParsedDelivery = false;
    let requestIdStr: string | null = null;
    
    if (requestId !== null && requestId.kind === JSONValueKind.NUMBER) {
      requestIdStr = requestId.toBigInt().toHexString();
    } else if (fallbackRequestId !== null) {
      // Use fallback from DeliverForMech if IPFS doesn't have requestId
      requestIdStr = fallbackRequestId;
    }

    if (requestIdStr !== null) {
      // Check if Request exists before linking (ParsedDelivery.request is non-nullable)
      let existingRequest = Request.load(requestIdStr);
      if (existingRequest !== null) {
        // Link ParsedDelivery to Request (non-nullable, so Request must exist)
        // We can create ParsedDelivery if we have requestIdStr (from IPFS or fallback) and Request exists
        parsedDeliver.request = requestIdStr;
        canCreateParsedDelivery = true;
        // Always link Deliver to Request if Request exists (nullable field)
        deliver.request = requestIdStr;
      } else {
        log.warning(
          "ParsedDelivery: Request {0} not found for delivery {1}, cannot create ParsedDelivery. Request event was not processed.",
          [requestIdStr, deliveryId.toHexString()]
        );
      }
    } else {
      log.warning(
        "ParsedDelivery: requestId not found in IPFS content or DeliverForMech for delivery {0}",
        [deliveryId.toHexString()]
      );
    }

    let metadata = parsed.get('metadata');

    if (metadata !== null && metadata.kind === JSONValueKind.OBJECT) {
      let metadataObj = metadata.toObject();
      let model = metadataObj.get('model');
      if (model !== null && model.kind === JSONValueKind.STRING) {
        let modelStr = model.toString();
        parsedDeliver.model = modelStr;
        deliver.model = modelStr; // Update Deliver entity
      }
    }

    if (response !== null && response.kind === JSONValueKind.STRING) {
      let responseStr = response.toString();
      parsedDeliver.response = responseStr;
      deliver.toolResponse = responseStr; // Update Deliver entity
    }

    // Only save ParsedDelivery if Request exists and we have a valid requestIdStr (from IPFS or fallback)
    if (canCreateParsedDelivery) {
      parsedDeliver.save();
    }
    // Always save Deliver entity (request field is nullable, but we link it if Request exists)
    deliver.save();
  }
}