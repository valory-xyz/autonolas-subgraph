import {
  Bytes,
  DataSourceContext,
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
  Service,
  CreateMech,
  MechAgent,
  AtaTransaction,
  RequestToMech,
  DeliverForMech,
} from '../generated/schema';
import {
  getGlobal,
  getServiceIdFromMech,
  getServiceIdFromMultisig,
  getOrCreateSender,
  getOrCreateRequestsPerAgentOnchain,
} from './utils';
import { ParsedRequestFile, ParsedDeliveryFile } from '../generated/templates';
import { CTX_BASE_HASH, CTX_REQUEST_ID } from './marketplace/request-metadata';
import { CTX_DELIVER_ID, CTX_DELIVER_REQUEST } from './marketplace/delivery-metadata';

function getIpfsHash(data: Bytes): string {
  return 'f01701220' + data.toHexString().slice(2);
}

function isIpfsDigest(data: Bytes): boolean {
  if (data.length === 32) return true;
  // ipfs.cat used to return null for malformed CIDs. Do not replace that with a
  // failing file source: preserve the chain event and skip metadata enrichment.
  log.warning('Skipping legacy IPFS metadata: expected a 32-byte digest, got {} bytes', [
    data.length.toString(),
  ]);
  return false;
}

function queueRequestMetadata(requestId: string, data: Bytes, baseHash: string): void {
  if (!isIpfsDigest(data)) return;

  let ctx = new DataSourceContext();
  ctx.setString(CTX_REQUEST_ID, requestId);
  ctx.setString(CTX_BASE_HASH, baseHash);
  ParsedRequestFile.createWithContext(baseHash + '/metadata.json', ctx);
  ParsedRequestFile.createWithContext(baseHash, ctx);
}

function queueDeliveryMetadata(
  deliveryId: Bytes,
  requestId: BigInt,
  data: Bytes,
  baseHash: string
): void {
  if (!isIpfsDigest(data)) return;

  let ctx = new DataSourceContext();
  ctx.setString(CTX_DELIVER_ID, deliveryId.toHexString());
  ctx.setString(CTX_DELIVER_REQUEST, requestId.toHexString());
  ctx.setString(CTX_BASE_HASH, baseHash);
  // Legacy uint256 IDs must keep their full decimal representation in the path.
  // Both layouts were supported by the old synchronous fallback.
  let route = baseHash + '/' + requestId.toString();
  ParsedDeliveryFile.createWithContext(route + '/metadata.json', ctx);
  ParsedDeliveryFile.createWithContext(route, ctx);
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

  // Persist the IPFS reference without fetching content in this handler.
  let ipfsHash = getIpfsHash(event.params.data);

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

  // Persist chain state before scheduling optional background metadata.
  entity.save();

  // File handlers cannot update Global/Sender.totalPredictRequests. Existing
  // grafted values are retained; derive new prediction counts from ParsedRequest.
  queueRequestMetadata(entity.id, event.params.data, ipfsHash);
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

  queueDeliveryMetadata(deliveryId, event.params.requestId, event.params.data, ipfsHash);

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
