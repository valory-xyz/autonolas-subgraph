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
  tool: string;
  toolHash: string;

  constructor(
    content: string,
    model: string,
    response: string,
    tool: string,
    toolHash: string
  ) {
    this.content = content;
    this.model = model;
    this.response = response;
    this.tool = tool;
    this.toolHash = toolHash;
  }
}

// Parse delivery metadata bytes into content/model/response/tool/toolHash (model from
// `metadata.model`, tool from `metadata.tool`, toolHash from `metadata.tool_hash`, response from
// `result`). content is always kept; the rest default to UNHANDLED_TYPE on invalid or unexpected
// JSON (or, for tool/toolHash, on pre-2.0 payloads that omit the key), so the ParsedDelivery
// String! fields are always satisfied.
export function parseDeliveryPayload(data: Bytes): DeliveryPayload {
  let payload = new DeliveryPayload(
    data.toString(),
    UNHANDLED_TYPE,
    UNHANDLED_TYPE,
    UNHANDLED_TYPE,
    UNHANDLED_TYPE
  );

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
    let toolValue = metadataObj.get('tool');
    if (toolValue !== null && toolValue.kind === JSONValueKind.STRING) {
      payload.tool = toolValue.toString();
    }
    let toolHashValue = metadataObj.get('tool_hash');
    if (toolHashValue !== null && toolHashValue.kind === JSONValueKind.STRING) {
      payload.toolHash = toolHashValue.toString();
    }
  }

  let responseValue = obj.get('result');
  if (responseValue !== null && responseValue.kind === JSONValueKind.STRING) {
    payload.response = responseValue.toString();
  }

  return payload;
}
