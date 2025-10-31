import { Bytes, dataSource, json } from "@graphprotocol/graph-ts";
import { MechRequest } from "../generated/schema";

export function handleMechRequest(content: Bytes): void {
    // dataSource.stringParams() returns the File DataSource CID
  // stringParam() will be mocked in the handler test
  // for more info https://thegraph.com/docs/en/developing/creating-a-subgraph/#create-a-new-handler-to-process-files
  let mechRequest = new MechRequest(Bytes.fromHexString(dataSource.stringParam()))

  const value = json.fromBytes(content).toObject()

  mechRequest.content = content;

}