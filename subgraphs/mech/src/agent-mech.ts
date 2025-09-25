import {
  json,
  ipfs,
  Bytes,
  JSONValueKind,
  log,
  BigInt,
} from '@graphprotocol/graph-ts';
import {
  Request as RequestEvent,
  Deliver as DeliverEvent,
} from '../generated/templates/AgentMech/AgentMech';
import { Request, Deliver, Sender, Service, CreateMech, MechAgent, AtaTransaction } from '../generated/schema';
import {
  getGlobal,
  getServiceIdFromMech,
  getServiceIdFromMultisig,
  getOrCreateSender,
  getOrCreateRequestsPerAgentOnchain,
} from './utils';

class Metadata {
  tool: string;
  prompt: string;
}

const MetadataNotFound: Metadata = {
  tool: '',
  prompt: '',
};

function getIpfsHash(data: Bytes): string {
  return 'f01701220' + data.toHexString().slice(2);
}

function tryGetIpfsResponse(requestHash: string): Bytes | null {
  let response = ipfs.cat(requestHash + '/' + 'metadata.json');

  if (response) {
    return response;
  }
  return ipfs.cat(requestHash);
}

function getMetadata(requestHash: string): Metadata {
  let response = tryGetIpfsResponse(requestHash);

  if (response) {
    let promptStr = '';
    let toolStr = '';
    let metadataString = json.fromString(response.toString());

    if (metadataString) {
      let metadata = metadataString.toObject();

      // Getting prompt info
      let promptJson = metadata.get('prompt');
      if (promptJson !== null && promptJson.kind === JSONValueKind.STRING) {
        promptStr = promptJson.toString();
      } else {
        promptStr = '[unhandled type]';
      }

      // Getting tool info
      let toolJson = metadata.get('tool');
      if (toolJson !== null && toolJson.kind === JSONValueKind.ARRAY) {
        let toolsArray = toolJson.toArray();
        let tools: string[] = [];

        for (let i = 0; i < toolsArray.length; i++) {
          let item = toolsArray[i];
          if (item.kind === JSONValueKind.STRING) {
            tools.push(item.toString());
          }
        }

        toolStr = tools.join(', ');
      } else if (toolJson && toolJson.kind === JSONValueKind.STRING) {
        toolStr = toolJson.toString();
      } else {
        toolStr = '[unhandled type]';
      }
    }

    return {
      prompt: promptStr,
      tool: toolStr,
    };
  }

  log.warning('Could not retrieve metadata for {}', [requestHash]);
  return MetadataNotFound;
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

export function handleRequest(event: RequestEvent): void {
  let entity = new Request(event.params.requestId.toHexString());

  // Create / update Sender
  let sender = getOrCreateSender(event.params.sender);
  sender.totalRequests += 1;
  sender.totalTransactions += 1;

  let global = getGlobal();
  global.totalRequests += 1;
  global.totalTransactions += 1;

  // Identify service multisig (counts toward ATA requests)
  let serviceId = getServiceIdFromMultisig(event.params.sender);
  if (serviceId !== null) {
    let txHash = event.transaction.hash;
    let transaction = AtaTransaction.load(txHash);
    if (transaction === null) {
      transaction = new AtaTransaction(txHash);
      transaction.blockNumber = event.block.number;
      transaction.blockTimestamp = event.block.timestamp;
      transaction.save();

      global.totalAtaTransactions += 1;
      sender.totalAtaTransactions += 1;
    }
  }

  sender.save();
  global.save();

  // Get metadata from IPFS
  let ipfsHash = getIpfsHash(event.params.data);

  let prompt = '';
  let tool = '';
  let questionTitle = '';

  let metadata = getMetadata(ipfsHash);
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
  entity.sender = event.params.sender;
  entity.mech = event.address;
  entity.requestId = event.params.requestId;
  entity.ipfsHash = ipfsHash;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  // Associate request with service
  entity.service = serviceId;

  // Update Service totalRequests counter
  if (serviceId !== null) {
    let service = Service.load(serviceId);
    if (service !== null) {
      service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
      service.save();
      // Increment on-chain per-agent counters for current composition
      let agentIds = service.agentIds;
      for (let i = 0; i < agentIds.length; i++) {
        let requestPerAgent = getOrCreateRequestsPerAgentOnchain(agentIds[i]);
        requestPerAgent.requestsCount = requestPerAgent.requestsCount.plus(BigInt.fromI32(1));
        requestPerAgent.save();
      }
    }
  }

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

  let existingRequest = Request.load(event.params.requestId.toHexString());
  // Do not attach a delivery to request in case it already has delivery attached
  if (existingRequest !== null && existingRequest.delivery === null) {
    entity.request = event.params.requestId.toHexString();
  } else {
     log.warning('Delivery already attached to Request', [event.params.requestId.toHexString()]);
  }

  // Associate deliver with service
  let serviceId = getServiceIdFromMech(event.address);
  entity.service = serviceId;

  entity.save();

  // Update Service totalDeliveries counter
  if (serviceId !== null) {
    let service = Service.load(serviceId);
    if (service !== null) {
      service.totalDeliveries = service.totalDeliveries.plus(BigInt.fromI32(1));
      service.save();
    }
  }

  // Get the mech agent and update its transaction counters
  let createMechEntity = CreateMech.load(event.address);
  if (createMechEntity !== null) {
    let mechAgent = MechAgent.load(createMechEntity.agentId.toHexString());
    if (mechAgent !== null) {
      // Update mech agent transaction counters
      mechAgent.totalTransactions = mechAgent.totalTransactions.plus(
        BigInt.fromI32(1)
      );
      mechAgent.save();
    }
  }

  let global = getGlobal();
  global.totalDeliveries += 1;
  global.totalTransactions += 1;
  // Deliveries are always ATA (mech is always a service multisig)
  // We check the transaction hash here as well to avoid double-counting
  // if a Request and Deliver happen in the same transaction.
  let txHash = event.transaction.hash;
  let transaction = AtaTransaction.load(txHash);
  if (transaction === null) {
    transaction = new AtaTransaction(txHash);
    transaction.blockNumber = event.block.number;
    transaction.blockTimestamp = event.block.timestamp;
    transaction.save();
    global.totalAtaTransactions += 1;
  }

  global.save();
}
