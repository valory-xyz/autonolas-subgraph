import { Address, BigDecimal, BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
  CreateMech as CreateMechEvent,
  Deliver as DeliverWithSignaturesEvent,
  MarketplaceDelivery as MarketplaceDeliveryEvent,
  MarketplaceDeliveryWithSignatures as MarketplaceDeliveryWithSignaturesEvent,
  MarketplaceParamsUpdated as MarketplaceParamsUpdatedEvent,
  MarketplaceRequest as MarketplaceRequestEvent,
  OwnerUpdated as OwnerUpdatedEvent,
  SetPaymentTypeBalanceTrackers as SetPaymentTypeBalanceTrackersEvent,
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
  SetPaymentTypeBalanceTrackers,
  Request,
  CreateMech,
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
  getPaymentType,
  getMaxDeliveryRate,
  persistSignedDeliver,
  SignedDeliverArgs,
  getOrCreateDeliverForMarketplace,
} from './utils';
import { getFeeUnitFromMechFactory, convertFeeToUsd } from './fee-utils';

export function handleCreateMech(event: CreateMechEvent): void {
  // Cache event params to avoid repeated access to indexed parameters
  let mech = event.params.mech;
  let serviceId = event.params.serviceId;
  let mechFactory = event.params.mechFactory;

  // Create CreateMech entity (used by getServiceIdFromMech)
  let createMechEntity = CreateMech.load(mech);
  if (createMechEntity === null) {
    createMechEntity = new CreateMech(mech);
  }
  createMechEntity.mech = mech;
  createMechEntity.serviceId = serviceId;
  createMechEntity.mechFactory = mechFactory;
  createMechEntity.source = 'MARKETPLACE';
  createMechEntity.blockNumber = event.block.number;
  createMechEntity.blockTimestamp = event.block.timestamp;
  createMechEntity.transactionHash = event.transaction.hash;
  createMechEntity.save();

  // Perform all external calls FIRST to avoid WASM memory corruption
  // Contract calls can invalidate entity field references in AssemblyScript
  let initialMaxDeliveryRate = getMaxDeliveryRate(mech);
  let paymentType = getPaymentType(mech);
  let service = Service.load(serviceId.toString());

  // Create Mech entity and assign ALL fields right before save
  let mechAgent = new Mech(serviceId.toString());
  mechAgent.address = mech;
  mechAgent.mechFactory = mechFactory;
  mechAgent.owner = event.transaction.from;
  mechAgent.service = serviceId.toString();
  mechAgent.totalDeliveriesTransactions = BigInt.fromI32(0);
  mechAgent.receivedRequests = BigInt.fromI32(0);
  mechAgent.selfDeliveredFromReceived = BigInt.fromI32(0);
  mechAgent.deliveredByOthersFromReceived = BigInt.fromI32(0);
  mechAgent.maxDeliveryRate = initialMaxDeliveryRate;
  mechAgent.karma = BigInt.fromI32(0);
  mechAgent.paymentType = paymentType;
  if (service !== null) {
    mechAgent.configHash = service.configHash;
  }

  mechAgent.save();

  createDataSourceForMechContract(mech, mechFactory);

  let global = getGlobal();
  global.totalMechs = global.totalMechs.plus(BigInt.fromI32(1));
  global.save();
}

export function handleMarketplaceDelivery(
  event: MarketplaceDeliveryEvent
): void {
  let successfullDeliveries = BigInt.fromI32(0);  

  let entity = new MarketplaceDelivery(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.deliveryMech = event.params.deliveryMech;
  entity.numDeliveries = event.params.numDeliveries;
  entity.requestIds = event.params.requestIds;
  entity.deliveredRequests = event.params.deliveredRequests;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  // Mark delivered requests as completed and track who delivered
  for (let i = 0; i < event.params.requestIds.length; i++) {
    if (!event.params.deliveredRequests[i]) {
      continue;
    }

    let requestId = event.params.requestIds[i];
    let request = Request.load(requestId.toHexString());
    if (request === null || request.isDelivered) {
      continue;
    }

    request.isDelivered = true;
    request.deliveredByMech = event.params.deliveryMech;
    request.save();
    
    // Update priority mech counters
    updateMechCountersOnDelivery(request, event.params.deliveryMech);
    
    successfullDeliveries = successfullDeliveries.plus(BigInt.fromI32(1));

    // Update service delivery counter for the delivery mech's service
    const deliveryServiceId = getServiceIdFromMech(event.params.deliveryMech);

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
    let deliveryMech = getMech(event.params.deliveryMech, event.transaction.hash, 'handleMarketplaceDelivery');
    if (deliveryMech != null) {
      deliveryMech.totalDeliveriesTransactions = deliveryMech.totalDeliveriesTransactions.plus(successfullDeliveries);
      deliveryMech.save();
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
  let txHash = event.transaction.hash;
  if (!ataTransactionExists(txHash)) {
    getOrCreateAtaTransaction(txHash, event.block.number, event.block.timestamp);
    global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  }
  
  global.save();
}

export function handleMarketplaceDeliveryWithSignatures(
  event: MarketplaceDeliveryWithSignaturesEvent
): void {
  let entity = new MarketplaceDeliveryWithSignatures(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.deliveryMech = event.params.deliveryMech;
  entity.requester = event.params.requester;
  entity.numDeliveries = event.params.numDeliveries;
  entity.requestIds = event.params.requestIds;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  for (let i = 0; i < event.params.requestIds.length; i++) {
    persistSignedDeliver(
      new SignedDeliverArgs(
        event.params.requestIds[i],
        event.params.deliveryMech,
        event.params.deliveryMech,
        null,
        event.block.number,
        event.block.timestamp,
        event.transaction.hash,
        true,
        null,
        null,
        null
      )
    );
  }

  // Update delivery mech counters for off-chain requests/deliveries
  // On-chain updateNumRequests() increments both numTotalRequests and numTotalDeliveries
  let deliveryMech = getMech(event.params.deliveryMech, event.transaction.hash, 'handleMarketplaceDeliveryWithSignatures');
  if (deliveryMech != null) {
    deliveryMech.totalDeliveriesTransactions = deliveryMech.totalDeliveriesTransactions.plus(event.params.numDeliveries);
    deliveryMech.receivedRequests = deliveryMech.receivedRequests.plus(event.params.numDeliveries);
    deliveryMech.selfDeliveredFromReceived = deliveryMech.selfDeliveredFromReceived.plus(event.params.numDeliveries);
    deliveryMech.save();
  }

  let sender = getOrCreateSender(event.params.requester);
  // As these requests are made off-chain we assume that the number of requests 
  // is the same as number of deliveries, and add the same to `totalRequests`
  sender.totalOffChainRequests = sender.totalOffChainRequests.plus(event.params.numDeliveries);
  sender.totalLegacyRequests = sender.totalLegacyRequests.plus(event.params.numDeliveries);
  sender.totalLegacyTransactions = sender.totalLegacyTransactions.plus(BigInt.fromI32(1));
  sender.save();

  let global = getGlobal();

  // For this event, total number of deliveries is the same as total number of requests
  global.totalRequests = global.totalRequests.plus(event.params.numDeliveries);

  global.totalDeliveries = global.totalDeliveries.plus(
    event.params.numDeliveries
  );
  global.totalMarketplaceDeliveriesWithSignatures =
    global.totalMarketplaceDeliveriesWithSignatures.plus(BigInt.fromI32(1));

  // 1 for each request and delivery (request is off-chain)
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(2));

  // Off-chain request ATA counting: deliveryMech is always a service multisig
  // So we always count +1 for deliveryMech, and +1 additional if requester is also a service multisig
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  let txHash = event.transaction.hash;
  
  if (!ataTransactionExists(txHash)) {
    getOrCreateAtaTransaction(txHash, event.block.number, event.block.timestamp);

    let ataIncrement = BigInt.fromI32(1); // deliveryMech is always a service multisig

    // Check if requester (sender of the request) is a service multisig (additional +1)
    if (isServiceMultisig(event.params.requester)) {
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
  let serviceIDForOffChain = getServiceIdFromMultisig(event.params.requester);
  if (serviceIDForOffChain !== null) {
    let serviceEntity = Service.load(serviceIDForOffChain.toString());
    if (serviceEntity !== null) {
      let agentIds = serviceEntity.agentIds;
      for (let i = 0; i < agentIds.length; i++) {
        let requestPerAgent = getOrCreateRequestsPerAgent(agentIds[i]);
        requestPerAgent.requestsCount = requestPerAgent.requestsCount.plus(event.params.numDeliveries);
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
  let entity = new MarketplaceRequest(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.priorityMech = event.params.priorityMech;
  entity.requester = event.params.requester;
  entity.numRequests = event.params.numRequests;
  entity.requestIds = event.params.requestIds;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  let sender = getOrCreateSender(event.params.requester);

  // // Use Int operations
  sender.totalLegacyTransactions = sender.totalLegacyTransactions.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(BigInt.fromI32(1));
  sender.totalLegacyRequests = sender.totalLegacyRequests.plus(event.params.numRequests);
  sender.save();

  // Get service ID from requester's multisig address
  let serviceId = getServiceIdFromMultisig(event.params.requester);

  // Get fee info from priority mech for all requests in this batch
  // Note: Requesters can specify a higher maxDeliveryRate in their request input,
  // but the contract locks at most the mech's maxDeliveryRate (see MechMarketplace._requestBatch).
  // So feeUSD here represents the mech's rate, which is the actual amount locked.
  let feeUnit: string | null = null;
  let feeRaw: BigInt | null = null;
  let feeUSD: BigDecimal | null = null;

  let maxDeliveryRate = getMaxDeliveryRate(Address.fromBytes(event.params.priorityMech));
  if (maxDeliveryRate !== null) {
    feeRaw = maxDeliveryRate;

    // Get mechFactory from CreateMech entity (created when mech was registered)
    let createMechEntity = CreateMech.load(event.params.priorityMech);
    if (createMechEntity !== null && createMechEntity.mechFactory !== null) {
      feeUnit = getFeeUnitFromMechFactory(createMechEntity.mechFactory!);
      feeUSD = convertFeeToUsd(maxDeliveryRate, feeUnit);
    }
  }

  // Request entities for each request
  for (let i = 0; i < event.params.numRequests.toI32(); i++) {
    let request = getOrCreateRequest(event.params.requestIds[i]);
    
    // Common fields only
    request.sender = sender.id;
    request.blockNumber = event.block.number;
    request.blockTimestamp = event.block.timestamp;
    request.transactionHash = event.transaction.hash;
    request.isDelivered = false;
    request.priorityMech = event.params.priorityMech;

    request.mech = event.params.priorityMech; // Mech address

    // Fee tracking
    if (feeRaw !== null) {
      request.feeRaw = feeRaw;
    }
    if (feeUnit !== null) {
      request.feeUnit = feeUnit;
    }
    if (feeUSD !== null) {
      request.feeUSD = feeUSD;
    }
    
    // Use requester's service for request.service and Service.totalRequests (matches mech-marketplace)
    if (serviceId !== null) {
      request.service = serviceId;
      let service = Service.load(serviceId);
      if (service !== null) {
        service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
        service.save();
      }
    }

    // Update per-mech counters for the priority mech
    updateMechCountersOnRequest(event.params.priorityMech);

    request.save();

    // Create marketplace-specific request entity (avoids null fields)
    let marketplaceRequest = getOrCreateRequestToMarketplace(event.params.requestIds[i]);
    marketplaceRequest.isMarketplace = true;
    marketplaceRequest.isOffChain = false;
    marketplaceRequest.request = request.id;
    marketplaceRequest.save();
  }

  let global = getGlobal();
  global.totalMarketplaceRequests = global.totalMarketplaceRequests.plus(
    BigInt.fromI32(1)
  );
  global.totalRequests = global.totalRequests.plus(event.params.numRequests);
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  // Simple transaction-level ATA counting: +1 for the entire transaction
  // Use AtaTransaction to avoid double-counting if Request and Deliver happen in same transaction
  if (serviceId !== null) {
    let txHash = event.transaction.hash;
    
    if (!ataTransactionExists(txHash)) {
      getOrCreateAtaTransaction(txHash, event.block.number, event.block.timestamp);

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
        requestPerAgent.requestsCount = requestPerAgent.requestsCount.plus(event.params.numRequests);
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

export function handleSetPaymentTypeBalanceTrackers(
  event: SetPaymentTypeBalanceTrackersEvent
): void {
  let entity = new SetPaymentTypeBalanceTrackers(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.paymentTypes = event.params.paymentTypes;

  // Convert Address[] to Bytes[] using for loop (closures can cause WASM memory issues)
  let balanceTrackersAddresses = event.params.balanceTrackers;
  let balanceTrackers = new Array<Bytes>(balanceTrackersAddresses.length);
  for (let i = 0; i < balanceTrackersAddresses.length; i++) {
    balanceTrackers[i] = balanceTrackersAddresses[i] as Bytes;
  }
  entity.balanceTrackers = balanceTrackers;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
