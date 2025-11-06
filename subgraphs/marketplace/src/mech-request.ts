import { Bytes, dataSource, json, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { ParsedRequest } from "../generated/schema";

let UNHANDLED_TYPE = '[unhandled type]';

export function handleMechRequest(content: Bytes): void {
  // dataSource.stringParams() returns the File DataSource CID
  // stringParam() will be mocked in the handler test
  // for more info https://thegraph.com/docs/en/developing/creating-a-subgraph/#create-a-new-handler-to-process-files

  let context = dataSource.context();
  let requestId = context.getBytes('requestId');
  let baseHash = context.getString('ipfsBase');
  let parsedRequest = new ParsedRequest(requestId);

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
      log.info("Succesfully parsed prompt: {}", [prompt.toString()]);
      parsedRequest.prompt = prompt.toString();
    }
    if (tool !== null && tool.kind === JSONValueKind.STRING) {
      parsedRequest.tool = tool.toString();
    }
  }

  parsedRequest.request = requestId;
  parsedRequest.content = content.toString();
  parsedRequest.hash = baseHash;
  parsedRequest.save();
}