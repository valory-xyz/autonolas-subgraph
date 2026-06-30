import { Bytes, JSONValueKind, dataSource, json, log } from '@graphprotocol/graph-ts';

import { ParsedRequest } from '../../generated/schema';

// Mirrors UNHANDLED_TYPE / extractQuestionTitle in marketplace/utils.ts. Duplicated here
// (rather than imported) so the offchain file-data-source mapping stays decoupled from the
// chain mapping module — keep the two in sync if the prompt template changes.
const UNHANDLED_TYPE = '[unhandled type]';
const QUESTION_CLOSING_DELIMITERS: string[] = ['" and the'];

function extractQuestionTitle(prompt: string): string {
  const marker = 'With the given question';
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex === -1) return '';

  const afterMarker = prompt.slice(markerIndex + marker.length);
  const firstQuote = afterMarker.indexOf('"');
  if (firstQuote === -1) return '';

  let closingIndex: i32 = -1;
  for (let i = 0; i < QUESTION_CLOSING_DELIMITERS.length; i++) {
    const idx = afterMarker.indexOf(QUESTION_CLOSING_DELIMITERS[i], firstQuote + 1);
    if (idx !== -1 && (closingIndex === -1 || idx < closingIndex)) {
      closingIndex = idx;
    }
  }
  if (closingIndex === -1) return '';

  return afterMarker.slice(firstQuote + 1, closingIndex);
}

/**
 * Offchain file-data-source handler for a request's IPFS metadata.json.
 *
 * Spawned by processOnChainRequest (marketplace/utils.ts) via
 * `ParsedRequestFile.createWithContext(<baseHash>/metadata.json, ctx)`. graph-node fetches
 * the file in the BACKGROUND, off the block-indexing critical path — so unreachable/abusive
 * IPFS hashes (staking-reward farming) can no longer stall the chain head; they simply never
 * trigger this handler and the request is left unenriched.
 *
 * Runs in its own causality region: it may only write entities declared for this template
 * (ParsedRequest) and cannot touch chain entities (Global/Sender/Request). The former
 * `totalPredictRequests` counter therefore no longer lives here — it is derivable from
 * `ParsedRequest.questionTitle` (count of non-empty). `content` is the fetched file bytes.
 */
export function handleParsedRequest(content: Bytes): void {
  let ctx = dataSource.context();
  let requestId = ctx.getString('requestId');
  let baseHash = ctx.getString('baseHash');

  // Idempotent on reorg/re-run.
  if (ParsedRequest.load(requestId) !== null) {
    return;
  }

  let prompt = UNHANDLED_TYPE;
  let tool = UNHANDLED_TYPE;
  let questionTitle = '';

  let result = json.try_fromBytes(content);
  if (!result.isError) {
    let value = result.value;
    if (value.kind === JSONValueKind.OBJECT) {
      let obj = value.toObject();

      let promptValue = obj.get('prompt');
      if (promptValue !== null && promptValue.kind === JSONValueKind.STRING) {
        prompt = promptValue.toString();
        questionTitle = extractQuestionTitle(prompt);
      }

      let toolValue = obj.get('tool');
      if (toolValue !== null && toolValue.kind === JSONValueKind.STRING) {
        tool = toolValue.toString();
      }
    }
  } else {
    log.warning('ParsedRequest {} ({}): IPFS content is not valid JSON', [requestId, baseHash]);
  }

  let parsedRequest = new ParsedRequest(requestId);
  parsedRequest.hash = baseHash;
  parsedRequest.request = requestId;
  parsedRequest.content = content.toString();
  parsedRequest.prompt = prompt;
  parsedRequest.tool = tool;
  parsedRequest.questionTitle = questionTitle;
  parsedRequest.save();
}
