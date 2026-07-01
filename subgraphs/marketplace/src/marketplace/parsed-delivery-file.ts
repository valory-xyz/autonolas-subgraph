import { Bytes, dataSource } from '@graphprotocol/graph-ts';

import { ParsedDelivery } from '../../generated/schema';
import { CTX_BASE_HASH } from './request-metadata';
import { CTX_DELIVER_ID, CTX_DELIVER_REQUEST, parseDeliveryPayload } from './delivery-metadata';

/**
 * Offchain file-data-source handler for a delivery's IPFS metadata.
 *
 * Spawned by the deliver handlers (marketplace/utils.ts) via
 * `ParsedDeliveryFile.createWithContext(<baseHash>/<decimalRequestId>, ctx)`. graph-node
 * fetches the file in the BACKGROUND, off the block-indexing critical path — so an unreachable
 * delivery hash can no longer stall the chain head; it just never triggers this handler.
 *
 * Runs in its own causality region: it may only write ParsedDelivery. Unlike the old
 * synchronous `parseDeliverIpfs`, it does NOT write back `Deliver.model`/`Deliver.toolResponse`
 * (those are chain-owned). Those fields were a redundant copy of `ParsedDelivery.model`/
 * `.response` and are now left null — read ParsedDelivery instead. `content` is the file bytes.
 */
export function handleParsedDelivery(content: Bytes): void {
  let ctx = dataSource.context();
  let deliverId = Bytes.fromHexString(ctx.getString(CTX_DELIVER_ID));
  let requestIdHex = ctx.getString(CTX_DELIVER_REQUEST);
  let baseHash = ctx.getString(CTX_BASE_HASH);

  // Idempotent on reorg/re-run.
  if (ParsedDelivery.load(deliverId) !== null) {
    return;
  }

  let payload = parseDeliveryPayload(content);

  let parsedDelivery = new ParsedDelivery(deliverId);
  parsedDelivery.deliver = deliverId;
  parsedDelivery.request = requestIdHex;
  parsedDelivery.hash = baseHash;
  parsedDelivery.content = payload.content;
  parsedDelivery.model = payload.model;
  parsedDelivery.response = payload.response;
  parsedDelivery.save();
}
