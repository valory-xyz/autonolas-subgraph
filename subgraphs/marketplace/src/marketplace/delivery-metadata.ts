import { Bytes, JSONValueKind, json } from '@graphprotocol/graph-ts';

import { UNHANDLED_TYPE } from './request-metadata';

// Chain-free helpers for parsing a delivery's IPFS metadata. Shared by the sync path
// (utils.ts, exercised by tests) and the offchain file-data-source handler
// (parsed-delivery-file.ts) so the two never drift. Nothing here touches entities/contracts.

// DataSourceContext keys for the offchain delivery file data source. CTX_BASE_HASH is shared
// from request-metadata; these two are delivery-specific.
export const CTX_DELIVER_ID = 'deliverId'; // Deliver entity id (hex) — ParsedDelivery.id + .deliver
export const CTX_DELIVER_REQUEST = 'deliverRequest'; // request id (hex) — ParsedDelivery.request ref

export class DeliveryPayload {
  content: string;
  model: string;
  response: string;

  constructor(content: string, model: string, response: string) {
    this.content = content;
    this.model = model;
    this.response = response;
  }
}

// Parse delivery metadata bytes into content/model/response (model from `metadata.model`,
// response from `result`). content is always kept; model/response default to UNHANDLED_TYPE on
// invalid or unexpected JSON, so the ParsedDelivery String! fields are always satisfied.
export function parseDeliveryPayload(data: Bytes): DeliveryPayload {
  let payload = new DeliveryPayload(data.toString(), UNHANDLED_TYPE, UNHANDLED_TYPE);

  let result = json.try_fromBytes(data);
  if (result.isError) {
    return payload;
  }

  let value = result.value;
  if (value.kind !== JSONValueKind.OBJECT) {
    return payload;
  }

  let obj = value.toObject();
  let metadataValue = obj.get('metadata');
  if (metadataValue !== null && metadataValue.kind === JSONValueKind.OBJECT) {
    let metadataObj = metadataValue.toObject();
    let modelValue = metadataObj.get('model');
    if (modelValue !== null && modelValue.kind === JSONValueKind.STRING) {
      payload.model = modelValue.toString();
    }
  }

  let responseValue = obj.get('result');
  if (responseValue !== null && responseValue.kind === JSONValueKind.STRING) {
    payload.response = responseValue.toString();
  }

  return payload;
}
