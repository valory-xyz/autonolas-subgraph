import { Bytes, dataSource, json, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { ParsedDelivery } from "../generated/schema";
import { getOddBigIntBytes } from "./utils";

let UNHANDLED_TYPE = '[unhandled type]';

export function handleMechDeliver(content: Bytes): void {
  let hash = dataSource.stringParam();
  let context = dataSource.context();
  let deliveryId = context.getBytes('deliveryId');
  let parsedDeliver = new ParsedDelivery(deliveryId);

  let obj = json.try_fromBytes(content);
  if (obj.isError) {
    log.error("Error parsing deliver: {}", [content.toString()]);
    return;
  }

  parsedDeliver.content = content.toString();
  parsedDeliver.hash = hash;
  parsedDeliver.deliver = deliveryId;
  parsedDeliver.model = UNHANDLED_TYPE;
  parsedDeliver.response = UNHANDLED_TYPE;


  if (obj.value.kind === JSONValueKind.OBJECT) {
    let parsed = obj.value.toObject();
    let response = parsed.get('result');
    let requestId = parsed.get('requestId');

    if (requestId !== null && requestId.kind === JSONValueKind.NUMBER) {
      parsedDeliver.request = getOddBigIntBytes(requestId.toBigInt());
    }

    let metadata = parsed.get('metadata');

    if (metadata !== null && metadata.kind === JSONValueKind.OBJECT) {
      let metadataObj = metadata.toObject();
      let model = metadataObj.get('model');
      if (model !== null && model.kind === JSONValueKind.STRING) {
        parsedDeliver.model = model.toString();
      }
    }

    if (response !== null && response.kind === JSONValueKind.STRING) {
      parsedDeliver.response = response.toString();
    }

    parsedDeliver.save();
  }
}