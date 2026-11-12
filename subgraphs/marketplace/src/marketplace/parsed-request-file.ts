import { Bytes, dataSource } from '@graphprotocol/graph-ts';

import { ParsedRequest } from '../../generated/schema';
import { CTX_BASE_HASH, CTX_REQUEST_ID, parseRequestPayload } from './request-metadata';

/**
 * Offchain file-data-source handler for a request's IPFS metadata.json.
 *
 * Spawned by processOnChainRequest and legacy AgentMech request handlers via
 * `ParsedRequestFile.createWithContext(<baseHash>[/metadata.json], ctx)`. graph-node fetches
 * the file in the BACKGROUND, so an unavailable file does not block an individual chain
 * handler. Pending sources still consume resources and need operational backlog
 * management; this handler only runs when bytes are available.
 *
 * Runs in its own causality region: it may only write entities declared for this template
 * (ParsedRequest) and cannot touch chain entities (Global/Sender/Request). The former
 * `totalPredictRequests` counter therefore no longer lives here — it is derivable from
 * `ParsedRequest.questionTitle` (count of non-empty). Parsing is shared with the chain path
 * via request-metadata.ts. `content` is the fetched file bytes.
 */
export function handleParsedRequest(content: Bytes): void {
  let ctx = dataSource.context();
  let requestId = ctx.getString(CTX_REQUEST_ID);
  let baseHash = ctx.getString(CTX_BASE_HASH);

  // Guard against a repeat invocation in this causality region. Sibling file
  // sources are isolated; this does not cancel the alternate path's polling.
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
