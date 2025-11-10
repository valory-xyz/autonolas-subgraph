import {
  Address,
  BigInt,
  Bytes,
  DataSourceContext,
  DataSourceTemplate,
  dataSource,
  ipfs,
  log,
  store,
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
import { MechFixedPriceNative as MechFixedPriceNativeContract } from '../../generated/templates/MechFixedPriceNative/MechFixedPriceNative';
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
    
    // Marketplace-specific counters
    global.totalMechs = BigInt.fromI32(0);
    global.totalMarketplaceRequests = BigInt.fromI32(0);
    global.totalMarketplaceDeliveries = BigInt.fromI32(0);
    global.totalMarketplaceDeliveriesWithSignatures = BigInt.fromI32(0);
    
    // Legacy AgentMech-specific counters
    global.totalLegacyRequests = BigInt.fromI32(0);
    global.totalLegacyDeliveries = BigInt.fromI32(0);
    global.totalLegacyTransactions = BigInt.fromI32(0);
    global.totalLegacyAtaTransactions = BigInt.fromI32(0);
    
    // Combined/aggregate counters
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
  let request = Request.load(requestId.toHexString());
  if (request == null) {
    request = new Request(requestId.toHexString());
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

  let mech = Mech.load(serviceId);
  if (mech == null) {
    log.error(
      'Mech not found - attempted to access mech {} (serviceId {}) in transaction {} in function {} which was not created yet',
      [
        mechAddress.toHexString(),
        serviceId,
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

export function getServiceIdFromMech(mechAddress: Bytes): string | null {
  let createMechEntity = CreateMech.load(mechAddress);
  if (createMechEntity !== null && createMechEntity.serviceId !== null) {
    return createMechEntity.serviceId!.toString();
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
  if (request.priorityMech === null) {
    log.debug("updateMechCountersOnDelivery: request.priorityMech is null, skipping mech counter update", []);
    return;
  }
  
  const priorityServiceId = getServiceIdFromMech(request.priorityMech as Bytes);
  if (priorityServiceId === null) {
    log.debug("updateMechCountersOnDelivery: getServiceIdFromMech returned null for priorityMech {}", [
      (request.priorityMech as Bytes).toHexString(),
    ]);
    return;
  }
  
  let priorityMechEntity = Mech.load(priorityServiceId);
  if (priorityMechEntity === null) {
    log.debug("updateMechCountersOnDelivery: No Mech entity found for priorityServiceId {}", [
      priorityServiceId,
    ]);
    return;
  }
  
  // Check if priority mech delivered its own request or another mech delivered it
  if (request.priorityMech!.equals(deliveryMech)) {
    // Self-delivery: increment self-delivered counter
    priorityMechEntity.selfDeliveredFromReceived = priorityMechEntity.selfDeliveredFromReceived.plus(BigInt.fromI32(1));
  } else {
    // Other-mech delivery: increment delivered-by-others counter
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
  
  let mechEntity = Mech.load(serviceId);
  if (mechEntity !== null) {
    mechEntity.receivedRequests = mechEntity.receivedRequests.plus(BigInt.fromI32(1));
    mechEntity.save();
  } else {
    log.warning('updateMechCountersOnRequest: Could not find Mech entity for serviceId {} (from mech {})', [
      serviceId,
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
  let requestIdHex = requestId.toHexString();
  let marketplaceRequest = RequestToMarketplace.load(requestIdHex);
  if (marketplaceRequest === null) {
    marketplaceRequest = new RequestToMarketplace(requestIdHex);
  }
  marketplaceRequest.requestIdBytes = requestId;
  return marketplaceRequest as RequestToMarketplace;
}

/**
 * Generic function to get paymentType from any payment type contract
 * All payment type contracts implement the same paymentType() function interface,
 * so we can use any binding (MechFixedPriceNative) as a generic binding
 * Returns Bytes if successful, throws error if the call fails
 */
export function getPaymentType(mechAddress: Address): Bytes {
  // All payment type contracts share the same paymentType() interface
  // So we can use any contract binding as a generic binding
  let contract = MechFixedPriceNativeContract.bind(mechAddress);
  let result = contract.try_paymentType();
  if (!result.reverted) {
    return result.value;
  }

  // PaymentType is required - if we can't get it, the subgraph should crash
  log.critical('Failed to get paymentType for mech: {}', [
    mechAddress.toHexString(),
  ]);
  throw new Error(`Failed to get paymentType for mech: ${mechAddress.toHexString()}`);
}

/**
 * Get or create DeliverForMarketplace entity
 */
export function getOrCreateDeliverForMarketplace(requestId: Bytes): DeliverForMarketplace {
  let marketplaceDeliver = DeliverForMarketplace.load(requestId);
  if (marketplaceDeliver === null) {
    marketplaceDeliver = new DeliverForMarketplace(requestId);
  }
  marketplaceDeliver.requestId = requestId.toHexString();
  marketplaceDeliver.requestIdBytes = requestId;
  return marketplaceDeliver as DeliverForMarketplace;
}

function toIpfsHash(payload: Bytes): string {
  return 'f01701220' + payload.toHexString().slice(2);
}

function resolveIpfsRoute(baseHash: string): string {
  let metadataPath = baseHash + '/metadata.json';
  if (ipfs.cat(metadataPath) !== null) {
    return metadataPath;
  }
  return baseHash;
}

function createRequestParser(requestId: string, baseHash: string): void {
  let context = new DataSourceContext();
  context.setString('requestId', requestId);
  context.setString('ipfsBase', baseHash);
  let route = resolveIpfsRoute(baseHash);
  
  log.info('Scheduling Request IPFS parsing: requestId={}, baseHash={}, route={}', [
    requestId,
    baseHash,
    route
  ]);
  
  DataSourceTemplate.createWithContext('MechParsedRequest', [route], context);
}

function createDeliverParser(
  deliveryId: Bytes,
  requestId: Bytes,
  baseHash: string
): void {
  let context = new DataSourceContext();
  context.setBytes('deliveryId', deliveryId);
  context.setString('ipfsBase', baseHash);

  // Convert bytes32 requestId to decimal string for IPFS path
  // bytes32 in Ethereum is big-endian, need to reverse for BigInt
  let reversedBytes = Bytes.fromUint8Array(requestId.reverse());
  let requestIdDecimal = BigInt.fromUnsignedBytes(reversedBytes).toString();
  let baseRoute = baseHash + '/' + requestIdDecimal;
  let route = resolveIpfsRoute(baseRoute);
  
  log.info('Scheduling Deliver IPFS parsing: deliveryId={}, requestId(hex)={}, requestId(decimal)={}, baseHash={}, route={}', [
    deliveryId.toHexString(),
    requestId.toHexString(),
    requestIdDecimal,
    baseHash,
    route
  ]);
  
  DataSourceTemplate.createWithContext('MechParsedDeliver', [route], context);
}

export function scheduleDeliverParser(
  deliveryId: Bytes,
  requestId: Bytes,
  baseHash: string
): void {
  createDeliverParser(deliveryId, requestId, baseHash);
}

export function scheduleRequestParser(
  requestId: string,
  baseHash: string
): void {
  createRequestParser(requestId, baseHash);
}

function attachRequestIpfs(
  requestId: Bytes,
  payload: Bytes,
  request: Request
): string | null {
  if (payload.length !== 32) {
    log.warning('Request {} has payload of length {}, skipping IPFS parsing.', [
      requestId.toHexString(),
      payload.length.toString(),
    ]);
    return null;
  }

  let baseHash = toIpfsHash(payload);
  let marketplaceRequest = getOrCreateRequestToMarketplace(requestId);
  marketplaceRequest.ipfsHashBytes = payload;
  marketplaceRequest.request = request.id;
  marketplaceRequest.save();
  return baseHash;
}

export function attachDeliverIpfs(
  deliver: DeliverForMarketplace,
  payload: Bytes
): string | null {
  if (payload.length !== 32) {
    log.warning('Deliver payload has length {}, skipping IPFS parsing.', [
      payload.length.toString(),
    ]);
    return null;
  }

  let baseHash = toIpfsHash(payload);
  deliver.ipfsHashBytes = payload;
  return baseHash;
}
export class OnChainDeliverArgs {
  txHash: Bytes;
  logIndex: i32;
  mech: Bytes;
  requestId: Bytes;
  payload: Bytes;
  deliveryRate: BigInt;
  mechServiceMultisig: Bytes;
  sender: Bytes;
  blockNumber: BigInt;
  blockTimestamp: BigInt;

  constructor(
    txHash: Bytes,
    logIndex: i32,
    mech: Bytes,
    requestId: Bytes,
    payload: Bytes,
    deliveryRate: BigInt,
    mechServiceMultisig: Bytes,
    sender: Bytes,
    blockNumber: BigInt,
    blockTimestamp: BigInt
  ) {
    this.txHash = txHash;
    this.logIndex = logIndex;
    this.mech = mech;
    this.requestId = requestId;
    this.payload = payload;
    this.deliveryRate = deliveryRate;
    this.mechServiceMultisig = mechServiceMultisig;
    this.sender = sender;
    this.blockNumber = blockNumber;
    this.blockTimestamp = blockTimestamp;
  }
}

export class OnChainRequestArgs {
  requestId: Bytes;
  mech: Bytes;
  payload: Bytes;
  sender: Bytes;
  blockNumber: BigInt;
  blockTimestamp: BigInt;
  transactionHash: Bytes;

  constructor(
    requestId: Bytes,
    mech: Bytes,
    payload: Bytes,
    sender: Bytes,
    blockNumber: BigInt,
    blockTimestamp: BigInt,
    transactionHash: Bytes
  ) {
    this.requestId = requestId;
    this.mech = mech;
    this.payload = payload;
    this.sender = sender;
    this.blockNumber = blockNumber;
    this.blockTimestamp = blockTimestamp;
    this.transactionHash = transactionHash;
  }
}

export function processOnChainDeliver(args: OnChainDeliverArgs): void {
  const deliverId = args.txHash.concatI32(args.logIndex);
  let deliver = getOrCreateMarketplaceIndividualDeliver(deliverId);

  assignDeliverBasics(deliver, args);
  attachRequestToDeliver(deliver, args);
  const serviceId = ensureServiceForDeliver(deliver, args.mech);
  incrementServiceDeliveries(serviceId);
  deliver.save();

  finalizeGlobalForDeliver(args);
  persistMarketplaceDeliver(args, deliver.id);
}

export function processOnChainRequest(args: OnChainRequestArgs): void {
  let request = getOrCreateRequest(args.requestId);
  let sender = getOrCreateSender(args.sender);
  request.sender = sender.id;

  const serviceId = requireServiceId(args.mech, 'Request');
  populateRequestCoreFields(request, args, serviceId);
  updateMechCountersOnRequest(args.mech);

  if (!isMarketplaceRequestEntity(args.requestId)) {
    applyDirectRequestCounters(sender, serviceId, args, request);
  }

  request.save();
  let requestBaseHash = attachRequestIpfs(args.requestId, args.payload, request);
  if (requestBaseHash !== null) {
    scheduleRequestParser(request.id, requestBaseHash);
  }
}

export function logRevokeRequest(mechAddress: Bytes, requestId: Bytes): void {
  log.info(
    'RevokeRequest: Mech {} failed to deliver request {} (rejected by marketplace)',
    [mechAddress.toHexString(), requestId.toHexString()]
  );
}

export function updateMaxDeliveryRate(mechAddress: Bytes, maxDeliveryRate: BigInt): void {
  const serviceId = getServiceIdFromMech(mechAddress);
  if (serviceId === null) {
    throw new Error(
      `MaxDeliveryRateUpdated: Could not find serviceId for mech ${mechAddress.toHexString()}. CreateMech mapping missing.`
    );
  }

  let mech = Mech.load(serviceId);
  if (mech === null) {
    throw new Error(
      `MaxDeliveryRateUpdated: Mech entity not found for serviceId ${serviceId}`
    );
  }

  mech.maxDeliveryRate = maxDeliveryRate;
  mech.save();
}

function assignDeliverBasics(deliver: Deliver, args: OnChainDeliverArgs): void {
  deliver.mech = args.mech;
  deliver.blockNumber = args.blockNumber;
  deliver.blockTimestamp = args.blockTimestamp;
  deliver.transactionHash = args.txHash;
  deliver.sender = args.sender;
}

function attachRequestToDeliver(deliver: Deliver, args: OnChainDeliverArgs): void {
  let request = Request.load(args.requestId.toHexString());
  if (request === null) {
    log.warning('Deliver: Request {} not found for delivery transaction', [
      args.requestId.toHexString(),
    ]);
    return;
  }

  deliver.request = request.id;

  if (request.isDelivered) {
    return;
  }

  request.isDelivered = true;
  request.deliveredByMech = args.mech;
  request.save();
  updateMechCountersOnDelivery(request, args.mech);
}

function ensureServiceForDeliver(deliver: Deliver, mech: Bytes): string {
  const serviceId = requireServiceId(mech, 'Deliver');
  deliver.service = serviceId;
  return serviceId;
}

function incrementServiceDeliveries(serviceId: string): void {
  let service = Service.load(serviceId);
  if (service === null) {
    return;
  }
  service.totalDeliveries = service.totalDeliveries.plus(BigInt.fromI32(1));
  service.save();
}

function finalizeGlobalForDeliver(args: OnChainDeliverArgs): void {
  let global = getGlobal();
  global.totalDeliveries = global.totalDeliveries.plus(BigInt.fromI32(1));
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));

  if (!ataTransactionExists(args.txHash)) {
    getOrCreateAtaTransaction(args.txHash, args.blockNumber, args.blockTimestamp);
    global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  }
  global.save();
}

function persistMarketplaceDeliver(args: OnChainDeliverArgs, deliverId: Bytes): void {
  let marketplaceDeliver = getOrCreateDeliverForMarketplace(args.requestId);
  marketplaceDeliver.mechServiceMultisig = args.mechServiceMultisig;
  marketplaceDeliver.deliveryRate = args.deliveryRate;
  marketplaceDeliver.isMarketplace = true;
  marketplaceDeliver.isOffChain = false;
  marketplaceDeliver.deliver = deliverId;
  let baseHash = attachDeliverIpfs(marketplaceDeliver, args.payload);
  marketplaceDeliver.save();
  if (baseHash !== null) {
    createDeliverParser(deliverId, args.requestId, baseHash);
  }
}

function requireServiceId(mech: Bytes, context: string): string {
  const serviceId = getServiceIdFromMech(mech);
  if (serviceId === null) {
    throw new Error(
      `${context}: Could not find serviceId for mech ${mech.toHexString()}. CreateMech mapping missing.`
    );
  }
  return serviceId;
}

function populateRequestCoreFields(
  request: Request,
  args: OnChainRequestArgs,
  serviceId: string
): void {
  request.mech = args.mech;
  request.service = serviceId;
  request.blockNumber = args.blockNumber;
  request.blockTimestamp = args.blockTimestamp;
  request.transactionHash = args.transactionHash;
  request.isDelivered = false;
  request.priorityMech = args.mech;
}

function isMarketplaceRequestEntity(requestId: Bytes): boolean {
  return store.get('RequestToMarketplace', requestId.toHexString()) !== null;
}

function applyDirectRequestCounters(
  sender: Sender,
  serviceId: string,
  args: OnChainRequestArgs,
  request: Request
): void {
  incrementServiceRequests(serviceId);
  let global = incrementGlobalRequests(args);
  incrementSenderRequests(sender);
  countAtaRequestIfNeeded(args, sender, global);
  createStandaloneMarketplaceRequest(args, request);
  global.save();
}

function incrementServiceRequests(serviceId: string): void {
  let service = Service.load(serviceId);
  if (service === null) {
    return;
  }
  service.totalRequests = service.totalRequests.plus(BigInt.fromI32(1));
  service.save();
}

function incrementGlobalRequests(args: OnChainRequestArgs): Global {
  let global = getGlobal();
  global.totalRequests = global.totalRequests.plus(BigInt.fromI32(1));
  global.totalTransactions = global.totalTransactions.plus(BigInt.fromI32(1));
  return global;
}

function incrementSenderRequests(sender: Sender): void {
  sender.totalRequests = sender.totalRequests.plus(BigInt.fromI32(1));
  sender.totalMarketplaceRequests = sender.totalMarketplaceRequests.plus(
    BigInt.fromI32(1)
  );
  sender.save();
}

function countAtaRequestIfNeeded(
  args: OnChainRequestArgs,
  sender: Sender,
  global: Global
): void {
  let serviceIdForRequest = getServiceIdFromMultisig(args.sender);
  if (serviceIdForRequest === null) {
    return;
  }

  if (ataTransactionExists(args.transactionHash)) {
    return;
  }

  getOrCreateAtaTransaction(args.transactionHash, args.blockNumber, args.blockTimestamp);
  global.totalAtaTransactions = global.totalAtaTransactions.plus(BigInt.fromI32(1));
  sender.totalAtaTransactions = sender.totalAtaTransactions.plus(BigInt.fromI32(1));
  sender.save();
}

function createStandaloneMarketplaceRequest(
  args: OnChainRequestArgs,
  request: Request
): void {
  let marketplaceRequest = getOrCreateRequestToMarketplace(args.requestId);
  marketplaceRequest.ipfsHashBytes = args.payload;
  marketplaceRequest.isMarketplace = false;
  marketplaceRequest.isOffChain = false;
  marketplaceRequest.request = request.id;
  marketplaceRequest.save();
}

