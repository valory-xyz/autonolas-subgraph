import { Bytes, dataSource, json, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { ParsedRequest, Request, RequestToMech } from "../generated/schema";

let UNHANDLED_TYPE = '[unhandled type]';

export function handleMechRequest(content: Bytes): void {
  // dataSource.stringParams() returns the File DataSource CID
  // stringParam() will be mocked in the handler test
  // for more info https://thegraph.com/docs/en/developing/creating-a-subgraph/#create-a-new-handler-to-process-files

  let hash = dataSource.stringParam();
  let context = dataSource.context();
  let requestId = context.getString('requestId');
  let baseHash = context.getString('ipfsBase');

  if (baseHash === null || requestId === null) {
    log.error("Missing context for request: {}", [hash]);
    return;
  }

  // Check if Request exists before creating ParsedRequest (ParsedRequest.request is non-nullable)
  let existingRequest = Request.load(requestId);
  if (existingRequest === null) {
    log.error(
      "ParsedRequest: Request {0} not found, cannot create ParsedRequest. Request event was not processed yet.",
      [requestId]
    );
    return;
  }

  let parsedRequest = new ParsedRequest(requestId);
  let promptValue: string | null = null;
  let toolValue: string | null = null;
  let questionTitle: string | null = null;

  let obj = json.try_fromBytes(content)
  if (obj.isError) {
    log.error("Error parsing request: {}", [content.toString()]);
    return;
  }

  // Empty by default
  parsedRequest.prompt = UNHANDLED_TYPE;
  parsedRequest.tool = UNHANDLED_TYPE;

  if (obj.value.kind === JSONValueKind.OBJECT) {
    let parsed = obj.value.toObject();
    let prompt = parsed.get('prompt');
    let tool = parsed.get('tool');
    if (prompt !== null && prompt.kind === JSONValueKind.STRING) {
      let promptString = prompt.toString();
      log.info("Succesfully parsed prompt: {}", [promptString]);
      parsedRequest.prompt = promptString;
      promptValue = promptString;
    }
    if (tool !== null && tool.kind === JSONValueKind.STRING) {
      let toolString = tool.toString();
      parsedRequest.tool = toolString;
      toolValue = toolString;
    }
  }

  if (promptValue !== null) {
    let extractedQuestionTitle = extractQuestionTitle(promptValue);
    if (extractedQuestionTitle !== null) {
      questionTitle = extractedQuestionTitle;
    }
  }

  let requestToMech = RequestToMech.load(requestId);
  if (requestToMech === null) {
    log.warning("RequestToMech entity not found for request {}", [requestId]);
  } else {
    if (promptValue !== null) {
      requestToMech.prompt = promptValue;
    }
    if (toolValue !== null) {
      requestToMech.tool = toolValue;
    }
    if (questionTitle !== null) {
      requestToMech.questionTitle = questionTitle;
    }
    requestToMech.save();
  }

  parsedRequest.request = requestId;
  parsedRequest.content = content.toString();
  parsedRequest.hash = baseHash;
  parsedRequest.save();
}

function extractQuestionTitle(prompt: string): string | null {
  const marker = 'With the given question';
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex === -1) return null;

  const afterMarker = prompt.slice(markerIndex + marker.length);
  const firstQuote = afterMarker.indexOf('"');
  if (firstQuote === -1) return null;

  const secondQuote = afterMarker.indexOf('"', firstQuote + 1);
  if (secondQuote === -1) return null;

  return afterMarker.slice(firstQuote + 1, secondQuote);
}