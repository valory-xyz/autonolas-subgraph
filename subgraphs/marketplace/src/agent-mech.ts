import {
  json,
  ipfs,
  Bytes,
  JSONValueKind,
  log,
  BigInt,
  DataSourceContext,
  DataSourceTemplate,
} from '@graphprotocol/graph-ts';
import {
  Request as RequestEvent,
  Deliver as DeliverEvent,
} from '../generated/templates/AgentMech/AgentMech';
import { Request, Deliver, Sender, Service, CreateMech, MechAgent, AtaTransaction, RequestToMech, DeliverForMech } from '../generated/schema';
import {
  getGlobal,
  getServiceIdFromMech,
  getServiceIdFromMultisig,
  getOrCreateSender,
  getOrCreateRequestsPerAgentOnchain,
} from './utils';

let UNHANDLED_TYPE = '[unhandled type]';

class Metadata {
  tool: string;
  prompt: string;
}

class ResponseMetadata {
  model: string
  response: string
}

const MetadataNotFound: Metadata = {
  tool: '',
  prompt: '',
};

function getIpfsHash(data: Bytes): string {
  return 'f01701220' + data.toHexString().slice(2);
}

function resolveIpfsRoute(base: string): string {
  let metadataPath = base + '/metadata.json';

  if (ipfs.cat(metadataPath) !== null) {
    return metadataPath;
  }

  return base;
}

function tryGetIpfsResponse(requestHash: string): Bytes | null {
  let response = ipfs.cat(requestHash + '/' + 'metadata.json');

  if (response) {
    return response;
  }
  return ipfs.cat(requestHash);
}

function getResponseMetadata(
  requestHash: string,
  requestId: BigInt
): ResponseMetadata {
  let url = requestHash + '/' + requestId.toString();
  let response = tryGetIpfsResponse(url);
  
  if (response === null) {
    return {
      model: UNHANDLED_TYPE,
      response: UNHANDLED_TYPE
    }
  }

  let jsonObj = json.fromBytes(response).toObject();

  let metadataObj = jsonObj.get('metadata');

  if (metadataObj === null) {
    return {
      model: UNHANDLED_TYPE,
      response: UNHANDLED_TYPE
    }
  }

  let metadata = metadataObj.toObject();
  let toolResponse = jsonObj.get("result")!.toString() || UNHANDLED_TYPE;

  let model = metadata.get("model")!.toString() || UNHANDLED_TYPE;

  return {
    model: model,
    response: toolResponse
  }
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
        promptStr = UNHANDLED_TYPE;
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
        toolStr = UNHANDLED_TYPE;
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
  let id = event.params.requestId.toHexString();
  let entity = new Request(id);

  // Create / update Sender
  let sender = getOrCreateSender(event.params.sender);
  sender.totalRequests = sender.totalRequests.plus(BigInt.fromI32(1));
  sender.totalTransactions = sender.totalTransactions.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(BigInt.fromI32(1));

  let global = getGlobal();
  global.totalRequests = global.totalRequests.plus(BigInt.fromI32(1));
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

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

      global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
      sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
    }
  }

  sender.save();
  global.save();

  // Get metadata from IPFS
  let ipfsHash = getIpfsHash(event.params.data);

  let context = new DataSourceContext();
  context.setString('requestId', entity.id);
  context.setString('ipfsBase', ipfsHash);

  let ipfsRoute = resolveIpfsRoute(ipfsHash);

  DataSourceTemplate.createWithContext("MechParsedRequest", [ipfsRoute], context);


  entity.sender = event.params.sender;
  entity.mech = event.address.toHexString();
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.isDelivered = false;

  // Associate request with service
  if (serviceId !== null) {
    entity.service = serviceId;
  } else {
    // log.critical("Service ID not found for mech {0}", [event.address.toHexString()]);
  }

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
  const deliveryId = event.transaction.hash.concatI32(event.logIndex.toI32());

  let entity = new Deliver(deliveryId);
  let mechDelivery = new DeliverForMech(deliveryId);

  mechDelivery.requestId = event.params.requestId.toHexString();
  mechDelivery.ipfsHash = getIpfsHash(event.params.data);
  mechDelivery.deliver = entity.id;
  mechDelivery.save();

  entity.sender = event.params.sender;
  entity.mech = event.address;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.request = event.params.requestId.toHexString();
  entity.transactionHash = event.transaction.hash;

  let context = new DataSourceContext();
  context.setBytes('deliveryId', entity.id);
  context.setString('ipfsBase', mechDelivery.ipfsHash);

  let ipfsRouteBase = mechDelivery.ipfsHash + '/' + event.params.requestId.toString();
  let ipfsRoute = resolveIpfsRoute(ipfsRouteBase);
  DataSourceTemplate.createWithContext("MechParsedDeliver", [ipfsRoute], context);

  // Connecting delivery with request
  let existingRequest = Request.load(event.params.requestId.toHexString());
  if (existingRequest !== null) {
    // If the Request exists and has no delivery, attach the delivery to the request
    const deliveries = existingRequest.delivery.load();
    if (deliveries.length === 0) {
      entity.request = event.params.requestId.toHexString();
    } else {
      log.warning(
        "Duplicated delivery {0} for the same request {1}",
        [deliveryId.toHexString(), event.params.requestId.toHexString()]
      );
    }
    existingRequest.isDelivered = true;
    existingRequest.deliveredByMech = event.address;
    existingRequest.save();
  } else {
    // No matching Request found
    log.warning(
      "Delivery {0} received for non-existing request {1}",
      [deliveryId.toHexString(), event.params.requestId.toHexString()]
    );
  }

  // Associate deliver with service
  let serviceId = getServiceIdFromMech(event.address);
  if (serviceId !== null) {
    entity.service = serviceId;
  } else {
    // log.critical("Service ID not found for mech {0}", [event.address.toHexString()]);
  }

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
  if (createMechEntity !== null && createMechEntity.agentId !== null) {
    let mechAgent = MechAgent.load(createMechEntity.agentId!.toHexString());
    if (mechAgent !== null) {
      // Update mech agent transaction counters
      mechAgent.totalTransactions = mechAgent.totalTransactions.plus(
        BigInt.fromI32(1)
      );
      mechAgent.save();
    }
  }

  let global = getGlobal();
  global.totalDeliveries = global.totalDeliveries.plus(BigInt.fromI32(1));
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));
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
    global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  }

  global.save();
}
