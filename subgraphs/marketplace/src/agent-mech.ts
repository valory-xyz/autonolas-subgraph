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
import {
  Request,
  Deliver,
  Sender,
  Service,
  CreateMech,
  MechAgent,
  AtaTransaction,
  RequestToMech,
  DeliverForMech,
  ParsedRequest,
  ParsedDelivery,
} from '../generated/schema';
import {
  getGlobal,
  getServiceIdFromMech,
  getServiceIdFromMultisig,
  getOrCreateSender,
  getOrCreateRequestsPerAgentOnchain,
} from './utils';

let UNHANDLED_TYPE = '[unhandled type]';

class RequestPayload {
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

class DeliveryPayload {
  content: string;
  model: string;
  response: string;

  constructor(content: string, model: string, response: string) {
    this.content = content;
    this.model = model;
    this.response = response;
  }
}

function getIpfsHash(data: Bytes): string {
  return 'f01701220' + data.toHexString().slice(2);
}

// Known closing delimiters that follow the question's closing quote in prompt templates.
// Add new entries here when the prompt template changes.
const QUESTION_CLOSING_DELIMITERS: string[] = [
  '" and the',  // 'With the given question "..." and the `yes` option...'
];

function extractQuestionTitle(prompt: string): string {
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

function tryGetIpfsResponse(requestHash: string): Bytes | null {
  let response = ipfs.cat(requestHash + '/' + 'metadata.json');

  if (response) {
    return response;
  }
  return ipfs.cat(requestHash);
}

function loadRequestPayload(ipfsHash: string): RequestPayload | null {
  let data = tryGetIpfsResponse(ipfsHash);
  if (data === null) {
    log.warning('Request metadata not found for {}', [ipfsHash]);
    return null;
  }

  let payload = new RequestPayload(
    data.toString(),
    UNHANDLED_TYPE,
    UNHANDLED_TYPE,
    ''
  );

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

function saveParsedRequestEntity(
  requestId: string,
  ipfsHash: string,
  payload: RequestPayload
): void {
  if (ParsedRequest.load(requestId) !== null) {
    return;
  }

  let parsedRequest = new ParsedRequest(requestId);
  parsedRequest.hash = ipfsHash;
  parsedRequest.request = requestId;
  parsedRequest.content = payload.content;
  parsedRequest.prompt = payload.prompt;
  parsedRequest.tool = payload.tool;
  parsedRequest.questionTitle = payload.questionTitle;
  parsedRequest.save();

  // Increment prediction counters when questionTitle is non-empty
  if (payload.questionTitle.length > 0) {
    let global = getGlobal();
    global.totalPredictRequests = global.totalPredictRequests.plus(BigInt.fromI32(1));
    global.save();

    let request = Request.load(requestId);
    if (request !== null) {
      let sender = Sender.load(request.sender);
      if (sender !== null) {
        sender.totalPredictRequests = sender.totalPredictRequests.plus(BigInt.fromI32(1));
        sender.save();
      }
    }
  }
}

function loadDeliveryPayload(
  ipfsHash: string,
  requestId: BigInt
): DeliveryPayload | null {
  let route = ipfsHash + '/' + requestId.toString();
  let data = tryGetIpfsResponse(route);
  if (data === null) {
    log.warning('Delivery metadata not found for {}', [route]);
    return null;
  }

  let payload = new DeliveryPayload(
    data.toString(),
    UNHANDLED_TYPE,
    UNHANDLED_TYPE
  );

  let result = json.try_fromBytes(data);
  if (result.isError) {
    return payload;
  }

  let value = result.value;
  if (value.kind !== JSONValueKind.OBJECT) {
    return payload;
  }

  let obj = value.toObject();
  let metadataValue = obj.get('metadata');
  if (metadataValue !== null && metadataValue.kind === JSONValueKind.OBJECT) {
    let metadataObj = metadataValue.toObject();
    let modelValue = metadataObj.get('model');
    if (modelValue !== null && modelValue.kind === JSONValueKind.STRING) {
      payload.model = modelValue.toString();
    }
  }

  let responseValue = obj.get('result');
  if (responseValue !== null && responseValue.kind === JSONValueKind.STRING) {
    payload.response = responseValue.toString();
  }

  return payload;
}

function saveParsedDeliveryEntity(
  deliveryId: Bytes,
  requestId: string,
  ipfsHash: string,
  payload: DeliveryPayload
): void {
  if (ParsedDelivery.load(deliveryId) !== null) {
    return;
  }

  let parsedDelivery = new ParsedDelivery(deliveryId);
  parsedDelivery.deliver = deliveryId;
  parsedDelivery.request = requestId;
  parsedDelivery.hash = ipfsHash;
  parsedDelivery.content = payload.content;
  parsedDelivery.model = payload.model;
  parsedDelivery.response = payload.response;
  parsedDelivery.save();
}

export function handleRequest(event: RequestEvent): void {
  let id = event.params.requestId.toHexString();
  let entity = new Request(id);

  // Create / update Sender
  let sender = getOrCreateSender(event.params.sender);
  sender.totalLegacyRequests = sender.totalLegacyRequests.plus(BigInt.fromI32(1));
  sender.totalLegacyTransactions = sender.totalLegacyTransactions.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(BigInt.fromI32(1));

  let global = getGlobal();
  
  // Update legacy-specific counters
  global.totalLegacyRequests = global.totalLegacyRequests.plus(BigInt.fromI32(1));
  global.totalLegacyTransactions = global.totalLegacyTransactions.plus(BigInt.fromI32(1));
  
  // Update aggregate counters
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

      global.totalLegacyAtaTransactions = global.totalLegacyAtaTransactions.plus(BigInt.fromI32(1));
      global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
      sender.totalLegacyAtaTransactions = sender.totalLegacyAtaTransactions.plus(BigInt.fromI32(1));
    }
  }

  sender.save();
  global.save();

  // Get metadata from IPFS
  let ipfsHash = getIpfsHash(event.params.data);
  let requestPayload = loadRequestPayload(ipfsHash);

  let requestToMechId = event.params.requestId.toHexString();
  let requestToMech = new RequestToMech(requestToMechId);
  requestToMech.ipfsHash = ipfsHash;
  requestToMech.request = entity.id;
  requestToMech.save();

  entity.sender = event.params.sender;
  entity.mech = event.address;
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

  // Persist request changes before storing parsed metadata
  entity.save();

  if (requestPayload !== null) {
    saveParsedRequestEntity(entity.id, ipfsHash, requestPayload);
  }
}

export function handleDeliver(event: DeliverEvent): void {
  // Use txHash + logIndex for unique Deliver entity ID (same as mech subgraph)
  const deliveryId = event.transaction.hash.concatI32(event.logIndex.toI32());

  // Check if this exact event was already processed (same tx + logIndex = same on-chain event)
  let existingMechDelivery = DeliverForMech.load(deliveryId);
  if (existingMechDelivery !== null) {
    // This exact event was already processed - nothing new to store
    return;
  }

  let entity = new Deliver(deliveryId);
  let mechDelivery = new DeliverForMech(deliveryId);

  let ipfsHash = getIpfsHash(event.params.data);
  let deliveryPayload = loadDeliveryPayload(ipfsHash, event.params.requestId);

  mechDelivery.requestId = event.params.requestId.toHexString();
  mechDelivery.ipfsHash = ipfsHash;
  mechDelivery.deliver = entity.id;
  mechDelivery.save();

  entity.requestId = changetype<Bytes>(Bytes.fromBigInt(event.params.requestId));
  entity.sender = event.params.sender;
  entity.mech = event.address;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  if (deliveryPayload !== null) {
    entity.toolResponse = deliveryPayload.response;
    entity.model = deliveryPayload.model;
  }

  // Connecting delivery with request
  let existingRequest = Request.load(event.params.requestId.toHexString());
  if (existingRequest !== null) {
    // Link Deliver to Request
    entity.request = event.params.requestId.toHexString();
    existingRequest.isDelivered = true;
    existingRequest.deliveredByMech = event.address;
    existingRequest.save();
  } else {
    log.warning(
      "Delivery {0} received for non-existing request {1}. This indicates the Request event was not processed. Check if AgentMech template exists for this mech.",
      [
        deliveryId.toHexString(),
        event.params.requestId.toHexString()
      ]
    );
  }

  // Associate deliver with service
  let serviceId = getServiceIdFromMech(event.address);
  if (serviceId !== null) {
    entity.service = serviceId;
  }

  entity.save();

  if (deliveryPayload !== null) {
    saveParsedDeliveryEntity(
      deliveryId,
      event.params.requestId.toHexString(),
      ipfsHash,
      deliveryPayload
    );
  }

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
  
  // Update legacy-specific counters
  global.totalLegacyDeliveries = global.totalLegacyDeliveries.plus(BigInt.fromI32(1));
  global.totalLegacyTransactions = global.totalLegacyTransactions.plus(BigInt.fromI32(1));
  
  // Update aggregate counters
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
    
    global.totalLegacyAtaTransactions = global.totalLegacyAtaTransactions.plus(BigInt.fromI32(1));
    global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  }

  global.save();
}
