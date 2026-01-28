import { Address, BigDecimal, BigInt, Bytes, log, store } from '@graphprotocol/graph-ts';
import {
  CreateMech as CreateMechEvent,
  Deliver as DeliverWithSignaturesEvent,
  MarketplaceDelivery as MarketplaceDeliveryEvent,
  MarketplaceDeliveryWithSignatures as MarketplaceDeliveryWithSignaturesEvent,
  MarketplaceParamsUpdated as MarketplaceParamsUpdatedEvent,
  MarketplaceRequest as MarketplaceRequestEvent,
  OwnerUpdated as OwnerUpdatedEvent,
} from '../../generated/MechMarketplaceV2/MechMarketplaceV2';
import { Deliver as DeliverWithSignaturesEventV1 } from '../../generated/MechMarketplaceV1/MechMarketplaceV1';
import {
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceParamsUpdated,
  MarketplaceRequest,
  Mech,
  OwnerUpdated,
  Service,
  Request,
  CreateMech,
  PendingMechData,
} from '../../generated/schema';
import {
  getOrCreateSender,
  getGlobal,
  createDataSourceForMechContract,
  getOrCreateRequest,
  getMech,
  getServiceIdFromMultisig,
  getServiceIdFromMech,
  isServiceMultisig,
  getOrCreateRequestsPerAgent,
  updateMechCountersOnDelivery,
  updateMechCountersOnRequest,
  getOrCreateAtaTransaction,
  getOrCreateRequestToMarketplace,
  ataTransactionExists,
  persistSignedDeliver,
  SignedDeliverArgs,
  getOrCreateDeliverForMarketplace,
  calculateMaxDeliveryRateUSD,
} from './utils';
import { getFeeUnitFromMechFactory, convertFeeToUsd } from './fee-utils';
import { getPaymentTypeFromFactory } from './constants';

export function handleCreateMech(event: CreateMechEvent): void {
  // Create CreateMech entity (used by getServiceIdFromMech)
  let createMechEntity = CreateMech.load(event.params.mech);
  if (createMechEntity === null) {
    createMechEntity = new CreateMech(event.params.mech);
  }
  createMechEntity.mech = event.params.mech;
  createMechEntity.serviceId = event.params.serviceId;
  createMechEntity.mechFactory = event.params.mechFactory;
  createMechEntity.source = 'MARKETPLACE';
  createMechEntity.blockNumber = event.block.number;
  createMechEntity.blockTimestamp = event.block.timestamp;
  createMechEntity.transactionHash = event.transaction.hash;
  createMechEntity.save();

  // Create Mech entity
  let mechAgent = new Mech(event.params.serviceId.toString());
  mechAgent.address = event.params.mech;
  mechAgent.mechFactory = event.params.mechFactory;
  mechAgent.owner = event.transaction.from;
  mechAgent.service = event.params.serviceId.toString();
  mechAgent.totalDeliveriesTransactions = BigInt.fromI32(0);
  mechAgent.receivedRequests = BigInt.fromI32(0);
  mechAgent.selfDeliveredFromReceived = BigInt.fromI32(0);
  mechAgent.deliveredByOthersFromReceived = BigInt.fromI32(0);
  mechAgent.maxDeliveryRate = null;
  mechAgent.karma = BigInt.fromI32(0);

  // Load maxDeliveryRate from PendingMechData (created by MechFactory handler)
  // Factory event fires at log 89, this handler fires at log 90 in same tx
  let mechAddress = event.params.mech.toHexString();
  let pendingData = PendingMechData.load(mechAddress);
  if (pendingData !== null) {
    mechAgent.maxDeliveryRate = pendingData.maxDeliveryRate;
    mechAgent.maxDeliveryRateUSD = calculateMaxDeliveryRateUSD(
      pendingData.maxDeliveryRate,
      event.params.mechFactory
    );
    // Delete PendingMechData after consumption to prevent orphan accumulation
    store.remove('PendingMechData', mechAddress);
  } else {
    log.warning('PendingMechData not found for mech {}. maxDeliveryRate will be null.', [
      mechAddress,
    ]);
  }

  // Get service configHash from Service entity and write it to Mech
  let service = Service.load(event.params.serviceId.toString());
  if (service !== null) {
    mechAgent.configHash = service.configHash;
  }

  // Get paymentType from factory address (static mapping, no RPC needed)
  let paymentType = getPaymentTypeFromFactory(event.params.mechFactory);
  mechAgent.paymentType = paymentType;
  mechAgent.save();

  createDataSourceForMechContract(event.params.mech, event.params.mechFactory);

  let global = getGlobal();
  global.totalMechs = global.totalMechs.plus(BigInt.fromI32(1));
  global.save();
}

export function handleMarketplaceDelivery(
  event: MarketplaceDeliveryEvent
): void {
  let successfullDeliveries = BigInt.fromI32(0);

  // Cache primitive event params first to avoid WASM memory corruption
  let deliveryMech = event.params.deliveryMech;
  let numDeliveries = event.params.numDeliveries;
  let blockNumber = event.block.number;
  let blockTimestamp = event.block.timestamp;
  let transactionHash = event.transaction.hash;
  let entityId = transactionHash.concatI32(event.logIndex.toI32());

  // Copy requestIds array element-by-element to avoid WASM memory corruption
  let requestIdsSource = event.params.requestIds;
  let requestIds = new Array<Bytes>(requestIdsSource.length);
  for (let i = 0; i < requestIdsSource.length; i++) {
    requestIds[i] = requestIdsSource[i];
  }

  // Copy deliveredRequests array element-by-element
  let deliveredRequestsSource = event.params.deliveredRequests;
  let deliveredRequests = new Array<boolean>(deliveredRequestsSource.length);
  for (let i = 0; i < deliveredRequestsSource.length; i++) {
    deliveredRequests[i] = deliveredRequestsSource[i];
  }

  // Create entity and assign ALL fields right before save
  let entity = new MarketplaceDelivery(entityId);
  entity.deliveryMech = deliveryMech;
  entity.numDeliveries = numDeliveries;
  entity.requestIds = requestIds;
  entity.deliveredRequests = deliveredRequests;
  entity.blockNumber = blockNumber;
  entity.blockTimestamp = blockTimestamp;
  entity.transactionHash = transactionHash;
  entity.save();

  // Mark delivered requests as completed and track who delivered
  for (let i = 0; i < requestIds.length; i++) {
    if (!deliveredRequests[i]) {
      continue;
    }

    let requestId = requestIds[i];
    let request = Request.load(requestId.toHexString());
    if (request === null || request.isDelivered) {
      continue;
    }

    request.isDelivered = true;
    request.deliveredByMech = deliveryMech;
    request.save();

    // Update priority mech counters
    updateMechCountersOnDelivery(request, deliveryMech);

    successfullDeliveries = successfullDeliveries.plus(BigInt.fromI32(1));

    // Update service delivery counter for the delivery mech's service
    const deliveryServiceId = getServiceIdFromMech(deliveryMech);

    // Note: Deliver entity is created by the mech template (MechFixedPriceNative, etc.)
    // which also sets DeliverForMarketplace.deliver via persistMarketplaceDeliver.
    // We only create DeliverForMarketplace here to mark it as marketplace delivery.
    let marketplaceDeliver = getOrCreateDeliverForMarketplace(requestId);
    marketplaceDeliver.isMarketplace = true;
    marketplaceDeliver.isOffChain = false;
    marketplaceDeliver.save();

    if (deliveryServiceId === null) {
      continue;
    }

    let service = Service.load(deliveryServiceId);
    if (service === null) {
      continue;
    }

    service.totalDeliveries = service.totalDeliveries.plus(BigInt.fromI32(1));
    service.save();
  }

  // Update delivery mech's totalDeliveriesTransactions by actual number of successful deliveries
  // This matches on-chain numTotalDeliveries behavior
  if (successfullDeliveries.gt(BigInt.fromI32(0))) {
    let deliveryMechEntity = getMech(deliveryMech, transactionHash, 'handleMarketplaceDelivery');
    if (deliveryMechEntity != null) {
      deliveryMechEntity.totalDeliveriesTransactions = deliveryMechEntity.totalDeliveriesTransactions.plus(successfullDeliveries);
      deliveryMechEntity.save();
    }
  }

  let global = getGlobal();
  global.totalDeliveries = global.totalDeliveries.plus(successfullDeliveries);
  global.totalMarketplaceDeliveries = global.totalMarketplaceDeliveries.plus(
    BigInt.fromI32(1)
  );
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // On-chain delivery ATA counting: deliveryMech is always a service multisig
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  if (!ataTransactionExists(transactionHash)) {
    getOrCreateAtaTransaction(transactionHash, blockNumber, blockTimestamp);
    global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  }

  global.save();
}

export function handleMarketplaceDeliveryWithSignatures(
  event: MarketplaceDeliveryWithSignaturesEvent
): void {
  // Cache primitive event params first to avoid WASM memory corruption
  let deliveryMechAddr = event.params.deliveryMech;
  let requester = event.params.requester;
  let numDeliveries = event.params.numDeliveries;
  let blockNumber = event.block.number;
  let blockTimestamp = event.block.timestamp;
  let transactionHash = event.transaction.hash;
  let entityId = transactionHash.concatI32(event.logIndex.toI32());

  // Copy requestIds array element-by-element to avoid WASM memory corruption
  let requestIdsSource = event.params.requestIds;
  let requestIds = new Array<Bytes>(requestIdsSource.length);
  for (let i = 0; i < requestIdsSource.length; i++) {
    requestIds[i] = requestIdsSource[i];
  }

  // Create entity and assign ALL fields right before save
  let entity = new MarketplaceDeliveryWithSignatures(entityId);
  entity.deliveryMech = deliveryMechAddr;
  entity.requester = requester;
  entity.numDeliveries = numDeliveries;
  entity.requestIds = requestIds;
  entity.blockNumber = blockNumber;
  entity.blockTimestamp = blockTimestamp;
  entity.transactionHash = transactionHash;
  entity.save();

  for (let i = 0; i < requestIds.length; i++) {
    persistSignedDeliver(
      new SignedDeliverArgs(
        requestIds[i],
        deliveryMechAddr,
        deliveryMechAddr,
        null,
        blockNumber,
        blockTimestamp,
        transactionHash,
        true,
        null,
        null,
        null
      )
    );
  }

  // Update delivery mech counters for off-chain requests/deliveries
  // On-chain updateNumRequests() increments both numTotalRequests and numTotalDeliveries
  let deliveryMechEntity = getMech(deliveryMechAddr, transactionHash, 'handleMarketplaceDeliveryWithSignatures');
  if (deliveryMechEntity != null) {
    deliveryMechEntity.totalDeliveriesTransactions = deliveryMechEntity.totalDeliveriesTransactions.plus(numDeliveries);
    deliveryMechEntity.receivedRequests = deliveryMechEntity.receivedRequests.plus(numDeliveries);
    deliveryMechEntity.selfDeliveredFromReceived = deliveryMechEntity.selfDeliveredFromReceived.plus(numDeliveries);
    deliveryMechEntity.save();
  }

  let sender = getOrCreateSender(requester);
  // As these requests are made off-chain we assume that the number of requests
  // is the same as number of deliveries, and add the same to `totalRequests`
  sender.totalOffChainRequests = sender.totalOffChainRequests.plus(numDeliveries);
  sender.totalLegacyRequests = sender.totalLegacyRequests.plus(numDeliveries);
  sender.totalLegacyTransactions = sender.totalLegacyTransactions.plus(BigInt.fromI32(1));
  sender.save();

  let global = getGlobal();

  // For this event, total number of deliveries is the same as total number of requests
  global.totalRequests = global.totalRequests.plus(numDeliveries);

  global.totalDeliveries = global.totalDeliveries.plus(numDeliveries);
  global.totalMarketplaceDeliveriesWithSignatures =
    global.totalMarketplaceDeliveriesWithSignatures.plus(BigInt.fromI32(1));

  // 1 for each request and delivery (request is off-chain)
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(2));

  // Off-chain request ATA counting: deliveryMech is always a service multisig
  // So we always count +1 for deliveryMech, and +1 additional if requester is also a service multisig
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  if (!ataTransactionExists(transactionHash)) {
    getOrCreateAtaTransaction(transactionHash, blockNumber, blockTimestamp);

    let ataIncrement = BigInt.fromI32(1); // deliveryMech is always a service multisig

    // Check if requester (sender of the request) is a service multisig (additional +1)
    if (isServiceMultisig(requester)) {
      ataIncrement = ataIncrement.plus(BigInt.fromI32(1));

      // Update requester-level ATA count (using existing sender variable)
      sender.totalLegacyAtaTransactions = sender.totalLegacyAtaTransactions.plus(BigInt.fromI32(1));
      sender.save();
    }

    // Update global ATA count
    global.totalAtaTransactions = global.totalAtaTransactions.plus(ataIncrement);
  }

  global.save();

  // Increment per-agent counters for service derived from requester multisig (off-chain requests)
  let serviceIDForOffChain = getServiceIdFromMultisig(requester);
  if (serviceIDForOffChain !== null) {
    let serviceEntity = Service.load(serviceIDForOffChain.toString());
    if (serviceEntity !== null) {
      let agentIds = serviceEntity.agentIds;
      for (let i = 0; i < agentIds.length; i++) {
        let requestPerAgent = getOrCreateRequestsPerAgent(agentIds[i]);
        requestPerAgent.requestsCount = requestPerAgent.requestsCount.plus(numDeliveries);
        requestPerAgent.save();
      }
    }
  }
}

export function handleDeliverWithSignaturesV1(
  event: DeliverWithSignaturesEventV1
): void {
  persistSignedDeliver(
    new SignedDeliverArgs(
      event.params.requestId,
      event.params.mech,
      event.params.mech,
      null,
      event.block.number,
      event.block.timestamp,
      event.transaction.hash,
      true,
      event.params.deliveryRate,
      event.params.mechServiceMultisig,
      event.params.data
    )
  );
}

export function handleDeliverWithSignaturesV2(
  event: DeliverWithSignaturesEvent
): void {
  persistSignedDeliver(
    new SignedDeliverArgs(
      event.params.requestId,
      event.params.mech,
      event.params.mech,
      null,
      event.block.number,
      event.block.timestamp,
      event.transaction.hash,
      true,
      event.params.deliveryRate,
      event.params.mechServiceMultisig,
      event.params.deliveryData
    )
  );
}

export function handleMarketplaceParamsUpdated(
  event: MarketplaceParamsUpdatedEvent
): void {
  let entity = new MarketplaceParamsUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.fee = event.params.fee;
  entity.minResponseTimeout = event.params.minResponseTimeout;
  entity.maxResponseTimeout = event.params.maxResponseTimeout;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleMarketplaceRequest(event: MarketplaceRequestEvent): void {
  // Cache primitive event params first to avoid WASM memory corruption
  let priorityMech = event.params.priorityMech;
  let requester = event.params.requester;
  let numRequests = event.params.numRequests;
  let blockNumber = event.block.number;
  let blockTimestamp = event.block.timestamp;
  let transactionHash = event.transaction.hash;
  let entityId = transactionHash.concatI32(event.logIndex.toI32());

  // Copy requestIds array element-by-element to avoid WASM memory corruption
  let requestIdsSource = event.params.requestIds;
  let requestIds = new Array<Bytes>(requestIdsSource.length);
  for (let i = 0; i < requestIdsSource.length; i++) {
    requestIds[i] = requestIdsSource[i];
  }

  // Create entity and assign ALL fields right before save
  let entity = new MarketplaceRequest(entityId);
  entity.priorityMech = priorityMech;
  entity.requester = requester;
  entity.numRequests = numRequests;
  entity.requestIds = requestIds;
  entity.blockNumber = blockNumber;
  entity.blockTimestamp = blockTimestamp;
  entity.transactionHash = transactionHash;
  entity.save();

  let sender = getOrCreateSender(requester);

  // // Use Int operations
  sender.totalLegacyTransactions = sender.totalLegacyTransactions.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(BigInt.fromI32(1));
  sender.totalLegacyRequests = sender.totalLegacyRequests.plus(numRequests);
  sender.save();

  // Get service ID from requester's multisig address
  let serviceId = getServiceIdFromMultisig(requester);

  // Get fee info from priority mech for all requests in this batch
  // Note: Requesters can specify a higher maxDeliveryRate in their request input,
  // but the contract locks at most the mech's maxDeliveryRate (see MechMarketplace._requestBatch).
  // So feeUSD here represents the mech's rate, which is the actual amount locked.
  let feeUnit: string | null = null;
  let feeRaw: BigInt | null = null;
  let feeUSD: BigDecimal | null = null;

  // Load maxDeliveryRate from Mech entity (populated by handleCreateMech) to avoid RPC calls
  let createMechEntity = CreateMech.load(priorityMech);
  if (createMechEntity !== null && createMechEntity.serviceId !== null) {
    let mechEntity = Mech.load(createMechEntity.serviceId!.toString());
    if (mechEntity !== null && mechEntity.maxDeliveryRate !== null) {
      feeRaw = mechEntity.maxDeliveryRate;
      if (createMechEntity.mechFactory !== null) {
        feeUnit = getFeeUnitFromMechFactory(createMechEntity.mechFactory!);
        feeUSD = convertFeeToUsd(mechEntity.maxDeliveryRate!, feeUnit);
      }
    }
  }

  // Request entities for each request
  for (let i = 0; i < numRequests.toI32(); i++) {
    let requestId = requestIds[i];

    // Create request entity and assign ALL fields right before save
    // to avoid WASM memory corruption from interleaved entity loads
    let request = getOrCreateRequest(requestId);
    request.sender = sender.id;
    request.blockNumber = blockNumber;
    request.blockTimestamp = blockTimestamp;
    request.transactionHash = transactionHash;
    request.isDelivered = false;
    request.priorityMech = priorityMech;
    request.mech = priorityMech;
    if (feeRaw !== null) {
      request.feeRaw = feeRaw;
    }
    if (feeUnit !== null) {
      request.feeUnit = feeUnit;
    }
    if (feeUSD !== null) {
      request.feeUSD = feeUSD;
    }
    if (serviceId !== null) {
      request.service = serviceId;
    }
    request.save();

    // Now safe to do other entity operations after request is saved
    if (serviceId !== null) {
      let service = Service.load(serviceId);
      if (service !== null) {
        service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
        service.save();
      }
    }

    updateMechCountersOnRequest(priorityMech);

    // Create marketplace-specific request entity
    let marketplaceRequest = getOrCreateRequestToMarketplace(requestId);
    marketplaceRequest.isMarketplace = true;
    marketplaceRequest.isOffChain = false;
    marketplaceRequest.request = request.id;
    marketplaceRequest.save();
  }

  let global = getGlobal();
  global.totalMarketplaceRequests = global.totalMarketplaceRequests.plus(
    BigInt.fromI32(1)
  );
  global.totalRequests = global.totalRequests.plus(numRequests);
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // Simple transaction-level ATA counting: +1 for the entire transaction
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  if (serviceId !== null) {
    if (!ataTransactionExists(transactionHash)) {
      getOrCreateAtaTransaction(transactionHash, blockNumber, blockTimestamp);

      global.totalAtaTransactions = global.totalAtaTransactions.plus(
        BigInt.fromI32(1)
      );
      // Also update sender-level ATA count
      sender.totalLegacyAtaTransactions = sender.totalLegacyAtaTransactions.plus(BigInt.fromI32(1));
      sender.save();
    }
  }
  global.save();

  // Increment per-agent counters for all canonical agents of this service (on-chain requests)
  if (serviceId !== null) {
    let svc = Service.load(serviceId); // Changed from MarketplaceService
    if (svc !== null) {
      let ids = svc.agentIds;
      for (let i = 0; i < ids.length; i++) {
        let requestPerAgent = getOrCreateRequestsPerAgent(ids[i]);
        requestPerAgent.requestsCount = requestPerAgent.requestsCount.plus(numRequests);
        requestPerAgent.save();
      }
    }
  }
}

export function handleOwnerUpdated(event: OwnerUpdatedEvent): void {
  let entity = new OwnerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
