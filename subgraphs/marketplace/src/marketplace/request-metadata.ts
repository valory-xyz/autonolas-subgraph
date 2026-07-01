import { Bytes, JSONValueKind, json } from '@graphprotocol/graph-ts';

// Chain-free helpers for parsing a request's IPFS metadata.json. Imported by BOTH the chain
// mapping (utils.ts, synchronous sync path kept for tests/delivery) and the offchain
// file-data-source handler (parsed-request-file.ts) so the two never drift. Nothing here
// touches entities or contracts, so it is safe to import from either causality region.

// DataSourceContext keys shared between the request handler (writer) and the file-data-source
// handler (reader). Constants so a typo can't silently desync the two sides (a missing key
// returns an empty string in AssemblyScript rather than erroring).
export const CTX_REQUEST_ID = 'requestId';
export const CTX_BASE_HASH = 'baseHash';

export const UNHANDLED_TYPE = '[unhandled type]';

// Known closing delimiters that follow the question's closing quote in prompt templates.
// Add new entries here when the prompt template changes.
const QUESTION_CLOSING_DELIMITERS: string[] = [
  '" and the', // 'With the given question "..." and the `yes` option...'
];

export function extractQuestionTitle(prompt: string): string {
  const marker = 'With the given question';
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex === -1) return '';

  const afterMarker = prompt.slice(markerIndex + marker.length);
  const firstQuote = afterMarker.indexOf('"');
  if (firstQuote === -1) return '';

  // Try each closing delimiter pattern, pick the earliest match.
  // This handles questions with inner quotes like: "Will Trump say "Crypto"?"
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

export class RequestPayload {
  content: string;
  prompt: string;
  tool: string;
  questionTitle: string;

  constructor(content: string, prompt: string, tool: string, questionTitle: string) {
    this.content = content;
    this.prompt = prompt;
    this.tool = tool;
    this.questionTitle = questionTitle;
  }
}

// Parse request metadata bytes into content/prompt/tool/questionTitle. `content` is always
// kept; prompt/tool default to UNHANDLED_TYPE and questionTitle to '' on invalid or unexpected
// JSON, so the resulting ParsedRequest always satisfies the String! schema fields.
export function parseRequestPayload(data: Bytes): RequestPayload {
  let payload = new RequestPayload(data.toString(), UNHANDLED_TYPE, UNHANDLED_TYPE, '');

  let result = json.try_fromBytes(data);
  if (result.isError) {
    return payload;
  }

  let value = result.value;
  if (value.kind !== JSONValueKind.OBJECT) {
    return payload;
  }

  let obj = value.toObject();
  let promptValue = obj.get('prompt');
  if (promptValue !== null && promptValue.kind === JSONValueKind.STRING) {
    payload.prompt = promptValue.toString();
    payload.questionTitle = extractQuestionTitle(payload.prompt);
  }

  let toolValue = obj.get('tool');
  if (toolValue !== null && toolValue.kind === JSONValueKind.STRING) {
    payload.tool = toolValue.toString();
  }

  return payload;
}
