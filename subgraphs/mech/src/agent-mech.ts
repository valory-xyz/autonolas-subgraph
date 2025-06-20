import { json, ipfs, Bytes, JSONValue, JSONValueKind, log } from "@graphprotocol/graph-ts";
import {
  Request as RequestEvent,
  Deliver as DeliverEvent,
} from "../generated/templates/AgentMech/AgentMech";
import { Request, Deliver, Sender } from "../generated/schema";

class Metadata {
  tool: string;
  prompt: string;
}

const MetadataNotFound: Metadata = {
  tool: "",
  prompt: "",
};

function getIpfsHash(data: Bytes): string {
  return "f01701220" + data.toHexString().slice(2);
}

function tryGetIpfsResponse(requestHash: string): Bytes | null {
  let response = ipfs.cat(requestHash + "/" + "metadata.json");

  if (response) {
    return response;
  }
  return ipfs.cat(requestHash);
}

function getMetadata(requestHash: string): Metadata {
  let response = tryGetIpfsResponse(requestHash);

  if (response) {
    let promptStr = "";
    let toolStr = "";

    let metadata = json.fromString(response.toString()).toObject();
    let promptJson = metadata.get("prompt") as JSONValue;
    let toolJson = metadata.get("tool") as JSONValue;

    if (promptJson) {
      promptStr = promptJson.toString();
    }

    if (toolJson && toolJson.kind === JSONValueKind.ARRAY) {
      let toolsArray = toolJson.toArray();
      let tools: string[] = [];

      for (let i = 0; i < toolsArray.length; i++) {
        let item = toolsArray[i];
        if (item.kind === JSONValueKind.STRING) {
          tools.push(item.toString());
        }
      }

      toolStr = tools.join(", "); // or whatever format you want
    } else if (toolJson && toolJson.kind === JSONValueKind.STRING) {
      toolStr = toolJson.toString();
    }

    return {
      prompt: promptStr,
      tool: toolStr,
    };
  }

  log.error("Could not retrieve metadata for {}", [requestHash]);
  return MetadataNotFound;
}

function extractQuestionTitle(prompt: string): string | null {
  const marker = "With the given question";
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex === -1) return null;

  const afterMarker = prompt.slice(markerIndex + marker.length);
  const firstQuote = afterMarker.indexOf('"');
  if (firstQuote === -1) return null;

  const secondQuote = afterMarker.indexOf('"', firstQuote + 1);
  if (secondQuote === -1) return null;

  return afterMarker.slice(firstQuote + 1, secondQuote);
}

export function handleRequest(event: RequestEvent): void {
  let entity = new Request(event.params.requestId.toHexString());

  // Create Sender entity to track all requests made by an address
  let sender = Sender.load(event.params.sender.toHexString());
  if (!sender) {
    sender = new Sender(event.params.sender.toHexString());
    sender.totalRequests = 0;
  }

  sender.totalRequests += 1;
  sender.save();

  // Get metadata from IPFS
  let ipfsHash = getIpfsHash(event.params.data);
  let metadata = getMetadata(ipfsHash);
  let prompt = "";
  let tool = "";
  let questionTitle = "";

  if (metadata) {
    prompt = metadata.prompt;
    tool = metadata.tool;
    if (metadata.prompt) {
      const extractedQuestionTitle = extractQuestionTitle(metadata.prompt);
      if (extractedQuestionTitle) {
        questionTitle = extractedQuestionTitle;
      }
    }
  }

  entity.prompt = prompt;
  entity.tool = tool;
  entity.questionTitle = questionTitle;
  entity.sender = event.params.sender.toHexString();
  entity.mech = event.address;
  entity.requestId = event.params.requestId;
  entity.ipfsHash = ipfsHash;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

export function handleDeliver(event: DeliverEvent): void {
  let entity = new Deliver(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.sender = event.params.sender;
  entity.mech = event.address;
  entity.requestId = event.params.requestId;
  entity.ipfsHash = getIpfsHash(event.params.data);
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.request = event.params.requestId.toHexString();
  entity.save();
}
