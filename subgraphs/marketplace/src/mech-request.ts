import { Bytes, dataSource, json, log } from "@graphprotocol/graph-ts";
import { ParsedRequest } from "../generated/schema";

export function handleMechRequest(content: Bytes): void {
    // dataSource.stringParams() returns the File DataSource CID
  // stringParam() will be mocked in the handler test
  // for more info https://thegraph.com/docs/en/developing/creating-a-subgraph/#create-a-new-handler-to-process-files

  let hash = dataSource.stringParam();
  let context = dataSource.context();
  let requestId = context.getBytes('requestId');
  let parsedRequest = new ParsedRequest(requestId);

  parsedRequest.request = requestId;
  parsedRequest.content = content.toString();
  parsedRequest.hash = hash;
  parsedRequest.save();
}