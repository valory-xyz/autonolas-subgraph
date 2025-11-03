import {
  Address,
  BigInt,
  Bytes,
  dataSource,
  log,
} from '@graphprotocol/graph-ts';
import {
  Global,
  Sender,
  Service,
  Metadata,
  Deliver,
  Request,
  CreateMultisigWithAgents,
  CreateMech,
  Mech,
  RequestsPerAgent,
  AtaTransaction,
  RequestToMarketplace,
  DeliverForMarketplace,
} from '../../generated/schema';
import {
  MechFixedPriceNative,
  MechFixedPriceToken,
  MechNvmSubscriptionNative,
  MechNvmSubscriptionTokenUSDC,
} from '../../generated/templates';
import {
  BASE_MECH_FACTORY_FIXED_PRICE_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_TOKEN,
  BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN,
  GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE,
} from './constants';

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    global.totalMechs = BigInt.fromI32(0);
    global.totalMarketplaceRequests = BigInt.fromI32(0);
    global.totalMarketplaceDeliveries = BigInt.fromI32(0);
    global.totalMarketplaceDeliveriesWithSignatures = BigInt.fromI32(0);
    global.totalRequests = BigInt.fromI32(0);
    global.totalDeliveries = BigInt.fromI32(0);
    global.totalTransactions = BigInt.fromI32(0);
    global.totalAtaTransactions = BigInt.fromI32(0);
  }
  return global;
}

export function getOrCreateSender(address: Bytes): Sender {
  let sender = Sender.load(address);
  if (sender == null) {
    sender = new Sender(address);
    sender.id = address;
    // All fields are required (BigInt!)
    sender.totalRequests = BigInt.fromI32(0);
    sender.totalTransactions = BigInt.fromI32(0);
    sender.totalAtaTransactions = BigInt.fromI32(0);
    sender.totalMarketplaceRequests = BigInt.fromI32(0);
    sender.totalOffChainRequests = BigInt.fromI32(0);
  }
  return sender;
}

export function isServiceMultisig(address: Bytes): boolean {
  let entity = CreateMultisigWithAgents.load(address);
  return entity !== null;
}

export function getOrCreateMetadata(serviceId: BigInt): Metadata {
  let entity = Metadata.load(serviceId.toString());
  if (entity === null) {
    entity = new Metadata(serviceId.toString());
    entity.serviceId = serviceId;
    entity.service = serviceId.toString();
  }
  return entity;
}

export function getOrCreateMarketplaceIndividualDeliver(id: Bytes): Deliver {
  let deliver = Deliver.load(id);
  if (deliver == null) {
    deliver = new Deliver(id); // ID is Bytes, not string
    // Only common fields - no specialized fields here
  }
  return deliver;
}

export function getOrCreateRequest(requestId: Bytes): Request {
  let request = Request.load(requestId);
  if (request == null) {
    request = new Request(requestId);
    // Only common fields - no specialized fields here
  }
  return request;
}

export function getMech(
  mechAddress: Bytes,
  transactionHash: Bytes,
  functionName: string
): Mech | null {
  const serviceId = getServiceIdFromMech(mechAddress);
  if (serviceId === null) {
    log.error(
      'Mech not found - could not find serviceId for mech {} in transaction {} in function {}',
      [
        mechAddress.toHexString(),
        transactionHash.toHexString(),
        functionName,
      ]
    );
    return null;
  }

  let mech = Mech.load(serviceId.toString());
  if (mech == null) {
    log.error(
      'Mech not found - attempted to access mech {} (serviceId {}) in transaction {} in function {} which was not created yet',
      [
        mechAddress.toHexString(),
        serviceId.toString(),
        transactionHash.toHexString(),
        functionName,
      ]
    );
  }
  return mech;
}

export function getOrCreateMultisigWithAgents(
  multisig: Bytes
): CreateMultisigWithAgents {
  let entity = CreateMultisigWithAgents.load(multisig);
  if (entity === null) {
    entity = new CreateMultisigWithAgents(multisig);
  }
  return entity;
}

export function getServiceIdFromMultisig(
  multisigAddress: Bytes
): string | null {
  let multisigEntity = CreateMultisigWithAgents.load(multisigAddress);
  if (multisigEntity !== null) {
    return multisigEntity.serviceId.toString();
  }
  return null;
}

export function getServiceIdFromMech(mechAddress: Bytes): BigInt | null {
  let createMechEntity = CreateMech.load(mechAddress);
  if (createMechEntity !== null && createMechEntity.serviceId !== null) {
    return createMechEntity.serviceId;
  }
  return null;
}

export function getChainId(network: string): i32 {
  const cleanNetwork = network.trim().toLowerCase();

  if (cleanNetwork == 'gnosis' || cleanNetwork == 'xdai') {
    return 100;
  } else if (cleanNetwork == 'base') {
    return 8453;
  }

  log.warning("Unknown network: '{}' (cleaned: '{}'), returning 0", [
    network,
    cleanNetwork,
  ]);
  return 0; // Unknown network
}

/* Create dynamic data source for the new Mech contract based on factory address */
export function createDataSourceForMechContract(
  mech: Address,
  mechFactory: Address
): void {
  const network = dataSource.network();
  const chainId = getChainId(network);
  const mechFactoryAddress = mechFactory.toHexString().toLowerCase();

  log.info(
    'Creating data source for mech: {}, factory: {}, network: {}, chainId: {}',
    [mech.toHexString(), mechFactoryAddress, network, chainId.toString()]
  );

  // Check factory addresses based on chain ID
  if (chainId == 100) {
    if (
      GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceNative.create(mech);
      log.info('Created MechFixedPriceNative data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceToken.create(mech);
      log.info('Created MechFixedPriceToken data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE.toLowerCase() ==
      mechFactoryAddress
    ) {
      MechNvmSubscriptionNative.create(mech);
      log.info('Created MechNvmSubscriptionNative data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else {
      log.warning('Unknown mech factory address on Gnosis: {}', [
        mechFactoryAddress,
      ]);
    }
  } else if (chainId == 8453) {
    if (
      BASE_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceNative.create(mech);
      log.info('Created MechFixedPriceNative data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      BASE_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceToken.create(mech);
      log.info('Created MechFixedPriceToken data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC.toLowerCase() ==
      mechFactoryAddress
    ) {
      MechNvmSubscriptionTokenUSDC.create(mech);
      log.info(
        'Created MechNvmSubscriptionTokenUSDC data source for mech: {}',
        [mech.toHexString()]
      );
    } else {
      log.warning('Unknown mech factory address on Base: {}', [
        mechFactoryAddress,
      ]);
    }
  } else {
    log.warning("Unsupported chain ID: {} for network: '{}'", [
      chainId.toString(),
      network,
    ]);
  }
}

export function getOrCreateRequestsPerAgent(agentId: BigInt): RequestsPerAgent {
  let id = agentId.toString();
  let requestPerAgent = RequestsPerAgent.load(id);
  if (requestPerAgent == null) {
    requestPerAgent = new RequestsPerAgent(id);
    requestPerAgent.requestsCount = BigInt.fromI32(0);
  }
  return requestPerAgent as RequestsPerAgent;
}

/**
 * Shared logic for updating priority mech counters when a delivery occurs
 */
export function updateMechCountersOnDelivery(
  request: Request,
  deliveryMech: Bytes
): void {
  if (request.priorityMech === null) return;
  
  const priorityServiceId = getServiceIdFromMech(request.priorityMech as Bytes);
  if (priorityServiceId === null) return;
  
  let priorityMechEntity = Mech.load(priorityServiceId.toString());
  if (priorityMechEntity === null) return;
  
  // Check if priority mech delivered its own request or another mech delivered it
  if (request.priorityMech!.equals(deliveryMech)) {
    // Self-delivery: decrement undelivered and increment self-delivered counter
    if (priorityMechEntity.undeliveredRequests.gt(BigInt.fromI32(0))) {
      priorityMechEntity.undeliveredRequests = priorityMechEntity.undeliveredRequests.minus(BigInt.fromI32(1));
    }
    priorityMechEntity.selfDeliveredFromReceived = priorityMechEntity.selfDeliveredFromReceived.plus(BigInt.fromI32(1));
  } else {
    // Other-mech delivery: only increment delivered-by-others counter (undelivered stays same)
    priorityMechEntity.deliveredByOthersFromReceived = priorityMechEntity.deliveredByOthersFromReceived.plus(BigInt.fromI32(1));
  }
  
  priorityMechEntity.save();
}

/**
 * Shared logic for updating mech counters when a request is received
 */
export function updateMechCountersOnRequest(mechAddress: Bytes): void {
  const serviceId = getServiceIdFromMech(mechAddress);
  if (serviceId === null) {
    log.warning('updateMechCountersOnRequest: getServiceIdFromMech returned null for mech {}', [mechAddress.toHexString()]);
    return;
  }
  
  let mechEntity = Mech.load(serviceId.toString());
  if (mechEntity !== null) {
    mechEntity.receivedRequests = mechEntity.receivedRequests.plus(BigInt.fromI32(1));
    mechEntity.undeliveredRequests = mechEntity.undeliveredRequests.plus(BigInt.fromI32(1));
    mechEntity.save();
  } else {
    log.warning('updateMechCountersOnRequest: Could not find Mech entity for serviceId {} (from mech {})', [
      serviceId.toString(),
      mechAddress.toHexString()
    ]);
  }
}

/**
 * Check if AtaTransaction exists for a given transaction hash
 * Returns true if transaction already exists, false if newly created
 */
export function ataTransactionExists(txHash: Bytes): boolean {
  return AtaTransaction.load(txHash) !== null;
}

/**
 * Get or create AtaTransaction entity
 */
export function getOrCreateAtaTransaction(
  txHash: Bytes,
  blockNumber: BigInt,
  blockTimestamp: BigInt
): AtaTransaction {
  let transaction = AtaTransaction.load(txHash);
  if (transaction === null) {
    transaction = new AtaTransaction(txHash);
    transaction.blockNumber = blockNumber;
    transaction.blockTimestamp = blockTimestamp;
    transaction.save();
  }
  return transaction as AtaTransaction;
}

/**
 * Get or create RequestToMarketplace entity
 */
export function getOrCreateRequestToMarketplace(requestId: Bytes): RequestToMarketplace {
  let marketplaceRequest = RequestToMarketplace.load(requestId);
  if (marketplaceRequest === null) {
    marketplaceRequest = new RequestToMarketplace(requestId);
    marketplaceRequest.requestId = requestId;
  }
  return marketplaceRequest as RequestToMarketplace;
}

/**
 * Get or create DeliverForMarketplace entity
 */
export function getOrCreateDeliverForMarketplace(requestId: Bytes): DeliverForMarketplace {
  let marketplaceDeliver = DeliverForMarketplace.load(requestId);
  if (marketplaceDeliver === null) {
    marketplaceDeliver = new DeliverForMarketplace(requestId);
    marketplaceDeliver.requestId = requestId;
  }
  return marketplaceDeliver as DeliverForMarketplace;
}
