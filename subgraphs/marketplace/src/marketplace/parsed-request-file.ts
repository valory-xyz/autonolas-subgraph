import { Bytes, dataSource } from '@graphprotocol/graph-ts';

import { ParsedRequest } from '../../generated/schema';
import { CTX_BASE_HASH, CTX_REQUEST_ID, parseRequestPayload } from './request-metadata';

/**
 * Offchain file-data-source handler for a request's IPFS metadata.json.
 *
 * Spawned by processOnChainRequest (marketplace/utils.ts) via
 * `ParsedRequestFile.createWithContext(<baseHash>[/metadata.json], ctx)`. graph-node fetches
 * the file in the BACKGROUND, off the block-indexing critical path — so unreachable/abusive
 * IPFS hashes (staking-reward farming) can no longer stall the chain head; they simply never
 * trigger this handler and the request is left unenriched.
 *
 * Runs in its own causality region: it may only write entities declared for this template
 * (ParsedRequest) and cannot touch chain entities (Global/Sender/Request). The old
 * IPFS-derived predict-request counters (Global/Sender.totalPredictRequests) were removed for
 * this reason — predict requests are derivable from `ParsedRequest.questionTitle` (count of
 * non-empty). Parsing is shared with the chain path via request-metadata.ts. `content` is the
 * fetched file bytes.
 */
export function handleParsedRequest(content: Bytes): void {
  let ctx = dataSource.context();
  let requestId = ctx.getString(CTX_REQUEST_ID);
  let baseHash = ctx.getString(CTX_BASE_HASH);

  // Idempotent on reorg/re-run and across the two spawns (metadata.json + bare hash).
  if (ParsedRequest.load(requestId) !== null) {
    return;
  }

  let payload = parseRequestPayload(content);

  let parsedRequest = new ParsedRequest(requestId);
  parsedRequest.hash = baseHash;
  parsedRequest.request = requestId;
  parsedRequest.content = payload.content;
  parsedRequest.prompt = payload.prompt;
  parsedRequest.tool = payload.tool;
  parsedRequest.questionTitle = payload.questionTitle;
  parsedRequest.save();
}
