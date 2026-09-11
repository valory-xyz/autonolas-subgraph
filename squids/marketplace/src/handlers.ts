// Event semantics, ported branch-for-branch from the subgraph's
// src/marketplace/*.ts minus the legacy AgentMech path and IPFS fetching.
// Handlers take an explicit EventMeta and a Ctx, so they run without a
// database or network (tests/handlers.test.ts).

import { BigDecimal } from "@subsquid/big-decimal";
import {
  AtaTransaction,
  CreateMech,
  CreateMultisigWithAgents,
  CreateService,
  Deliver,
  DeliverForMarketplace,
  FeeUnit,
  Global,
  IndexerStatus,
  MarketplaceDelivery,
  MarketplaceDeliveryWithSignatures,
  MarketplaceRequest,
  Mech,
  Metadata,
  RegisterInstance,
  Request,
  RequestToMarketplace,
  RequestsPerAgent,
  Sender,
  Service,
  Source,
  TerminateService,
  Transfer,
  UpdateService,
} from "./model";
import { CacheLogger, IEntityCache } from "./entityCache";
import { NativePriceSource, ZERO_USD, convertFeeToUsd } from "./fee";
import {
  EventMeta,
  FEE_UNIT_FALLBACK,
  eventId,
  getFeeUnitFromFactory,
  getPaymentTypeFromFactory,
  isIpfsPayload,
  isMarketplaceTransaction,
  pushUnique,
  serviceEntityId,
  signedDeliverId,
} from "./logic";
import { GLOBAL_ID, INDEXER_STATUS_ID } from "./constants";

export interface Ctx {
  cache: IEntityCache;
  log: CacheLogger;
  price: NativePriceSource;
  /** Per batch (the subgraph's PendingMechData table): mech address -> maxDeliveryRate
   *  from the factory log, consumed by the marketplace CreateMech in the same tx. */
  pendingMechRates: Map<string, bigint>;
  /** Per batch: requestId -> payload from the mech's Request log, consumed by the
   *  MarketplaceRequest that creates the Request entity later in the same tx. */
  pendingRequestPayloads: Map<string, string>;
}

export function newBatchState(): Pick<
  Ctx,
  "pendingMechRates" | "pendingRequestPayloads"
> {
  return { pendingMechRates: new Map(), pendingRequestPayloads: new Map() };
}

// --- Entity helpers -----------------------------------------------------

export async function getGlobal(ctx: Ctx): Promise<Global> {
  const existing = await ctx.cache.get(Global, GLOBAL_ID);
  if (existing != null) return existing;
  const g = new Global({
    id: GLOBAL_ID,
    totalMechs: 0n,
    totalMarketplaceRequests: 0n,
    totalMarketplaceDeliveries: 0n,
    totalMarketplaceDeliveriesWithSignatures: 0n,
    totalRequests: 0n,
    totalDeliveries: 0n,
    totalTransactions: 0n,
    totalAtaTransactions: 0n,
    totalFeesPaidUSD: ZERO_USD,
  });
  ctx.cache.set(Global, g);
  return g;
}

async function getOrCreateSender(ctx: Ctx, address: string): Promise<Sender> {
  const existing = await ctx.cache.get(Sender, address);
  if (existing != null) return existing;
  const s = new Sender({
    id: address,
    totalLegacyRequests: 0n,
    totalLegacyTransactions: 0n,
    totalLegacyAtaTransactions: 0n,
    totalMarketplaceRequests: 0n,
    totalOffChainRequests: 0n,
    totalFeesPaidUSD: ZERO_USD,
  });
  ctx.cache.set(Sender, s);
  return s;
}

/** multisig address -> serviceId (as entity id string), via CreateMultisigWithAgents. */
async function getServiceIdFromMultisig(
  ctx: Ctx,
  multisig: string
): Promise<string | null> {
  const row = await ctx.cache.get(CreateMultisigWithAgents, multisig);
  return row == null ? null : row.serviceId.toString();
}

async function isServiceMultisig(ctx: Ctx, address: string): Promise<boolean> {
  return (await ctx.cache.get(CreateMultisigWithAgents, address)) != null;
}

/** mech address -> serviceId (as entity id string), via CreateMech. */
async function getServiceIdFromMech(
  ctx: Ctx,
  mech: string
): Promise<string | null> {
  const row = await ctx.cache.get(CreateMech, mech);
  return row?.serviceId == null ? null : row.serviceId.toString();
}

/** Mech entity by serviceId, with the service link loaded. */
async function getMechById(ctx: Ctx, serviceId: string): Promise<Mech | undefined> {
  return ctx.cache.get(Mech, serviceId, ["service"]);
}

/** The subgraph's `getMech`: Mech by address, logging (not throwing) when missing. */
async function getMechByAddress(
  ctx: Ctx,
  mech: string,
  txHash: string,
  fn: string
): Promise<Mech | null> {
  const serviceId = await getServiceIdFromMech(ctx, mech);
  if (serviceId == null) {
    ctx.log.error(
      `Mech not found - could not find serviceId for mech ${mech} in ` +
        `transaction ${txHash} in function ${fn}`
    );
    return null;
  }
  const m = await getMechById(ctx, serviceId);
  if (m == null) {
    ctx.log.error(
      `Mech not found - attempted to access mech ${mech} (serviceId ` +
        `${serviceId}) in transaction ${txHash} in function ${fn} which was ` +
        `not created yet`
    );
    return null;
  }
  return m;
}

/** Request with the links the fee path reads (`sender`) loaded. */
async function getRequest(ctx: Ctx, requestId: string): Promise<Request | undefined> {
  return ctx.cache.get(Request, requestId, ["sender", "service"]);
}

async function getService(ctx: Ctx, serviceId: string): Promise<Service | undefined> {
  return ctx.cache.get(Service, serviceId);
}

async function getOrCreateRequestToMarketplace(
  ctx: Ctx,
  requestId: string
): Promise<RequestToMarketplace> {
  const existing = await ctx.cache.get(RequestToMarketplace, requestId, ["request"]);
  if (existing != null) {
    existing.requestIdBytes = requestId;
    return existing;
  }
  return new RequestToMarketplace({ id: requestId, requestIdBytes: requestId });
}

async function getOrCreateDeliverForMarketplace(
  ctx: Ctx,
  requestId: string
): Promise<DeliverForMarketplace> {
  const existing = await ctx.cache.get(DeliverForMarketplace, requestId, ["deliver"]);
  if (existing != null) {
    existing.requestId = requestId;
    existing.requestIdBytes = requestId;
    return existing;
  }
  return new DeliverForMarketplace({
    id: requestId,
    requestId,
    requestIdBytes: requestId,
  });
}

async function ataTransactionExists(ctx: Ctx, txHash: string): Promise<boolean> {
  return (await ctx.cache.get(AtaTransaction, txHash)) != null;
}

function createAtaTransaction(ctx: Ctx, meta: EventMeta): void {
  ctx.cache.set(
    AtaTransaction,
    new AtaTransaction({
      id: meta.txHash,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
    })
  );
}

async function getOrCreateRequestsPerAgent(
  ctx: Ctx,
  agentId: number
): Promise<RequestsPerAgent> {
  const id = agentId.toString();
  const existing = await ctx.cache.get(RequestsPerAgent, id);
  if (existing != null) return existing;
  return new RequestsPerAgent({ id, requestsCount: 0n });
}

async function bumpRequestsPerAgent(
  ctx: Ctx,
  serviceId: string,
  by: bigint
): Promise<void> {
  const service = await getService(ctx, serviceId);
  if (service == null) return;
  for (const agentId of service.agentIds) {
    const row = await getOrCreateRequestsPerAgent(ctx, agentId);
    row.requestsCount += by;
    ctx.cache.set(RequestsPerAgent, row);
  }
}

async function updateServiceMultisig(
  ctx: Ctx,
  serviceId: bigint,
  multisig: string
): Promise<void> {
  const service = await getService(ctx, serviceEntityId(serviceId));
  if (service == null) return;
  service.latestMultisig = multisig;
  service.historicalMultisigs = pushUnique(service.historicalMultisigs, multisig);
  ctx.cache.set(Service, service);
}

// --- Fee helpers --------------------------------------------------------

async function calculateMaxDeliveryRateUSD(
  ctx: Ctx,
  maxDeliveryRate: bigint,
  mechFactory: string,
  blockNumber: bigint
): Promise<BigDecimal> {
  let feeUnit = getFeeUnitFromFactory(mechFactory);
  if (feeUnit == null) {
    ctx.log.warn(
      `Unknown mechFactory for fee unit detection: ${mechFactory}; assuming ${FEE_UNIT_FALLBACK}`
    );
    feeUnit = FEE_UNIT_FALLBACK;
  }
  return convertFeeToUsd(maxDeliveryRate, feeUnit, blockNumber, ctx.price, ctx.log);
}

/**
 * Sets `finalFeeUSD` from the actual deliveryRate and accumulates it on the
 * sender and globally. Scope guard: only on-chain marketplace requests (the
 * ones with a RequestToMarketplace.isMarketplace and a feeUnit) carry fees.
 * Caller guards write-once with `request.finalFeeUSD == null`.
 */
async function updateFeesOnDelivery(
  ctx: Ctx,
  request: Request,
  deliveryRate: bigint,
  blockNumber: bigint
): Promise<void> {
  const rtm = await ctx.cache.get(RequestToMarketplace, request.id);
  if (rtm == null || !rtm.isMarketplace) return;
  if (request.feeUnit == null) return;

  const finalFeeUSD = await convertFeeToUsd(
    deliveryRate,
    request.feeUnit,
    blockNumber,
    ctx.price,
    ctx.log
  );
  request.finalFeeUSD = finalFeeUSD;

  const sender =
    request.sender?.id != null
      ? await ctx.cache.get(Sender, request.sender.id)
      : undefined;
  if (sender != null) {
    sender.totalFeesPaidUSD = sender.totalFeesPaidUSD.plus(finalFeeUSD);
    ctx.cache.set(Sender, sender);
  }

  const global = await getGlobal(ctx);
  global.totalFeesPaidUSD = global.totalFeesPaidUSD.plus(finalFeeUSD);
  ctx.cache.set(Global, global);
}

/** Priority-mech self/other delivery counters. Skips (logs) on a missing mapping. */
async function updateMechCountersOnDelivery(
  ctx: Ctx,
  request: Request,
  deliveryMech: string
): Promise<void> {
  if (request.priorityMech == null) return;
  const priorityServiceId = await getServiceIdFromMech(ctx, request.priorityMech);
  if (priorityServiceId == null) return;
  const priorityMech = await getMechById(ctx, priorityServiceId);
  if (priorityMech == null) return;
  if (request.priorityMech === deliveryMech) {
    priorityMech.selfDeliveredFromReceived += 1n;
  } else {
    priorityMech.deliveredByOthersFromReceived += 1n;
  }
  ctx.cache.set(Mech, priorityMech);
}

async function updateMechCountersOnRequest(ctx: Ctx, mech: string): Promise<void> {
  const serviceId = await getServiceIdFromMech(ctx, mech);
  if (serviceId == null) {
    ctx.log.warn(
      `updateMechCountersOnRequest: getServiceIdFromMech returned null for mech ${mech}`
    );
    return;
  }
  const m = await getMechById(ctx, serviceId);
  if (m == null) {
    ctx.log.warn(
      `updateMechCountersOnRequest: Could not find Mech entity for serviceId ` +
        `${serviceId} (from mech ${mech})`
    );
    return;
  }
  m.receivedRequests += 1n;
  ctx.cache.set(Mech, m);
}

/**
 * `Mech.maxDeliveryRate` self-heals from an observed deliveryRate when it is
 * null (factory event unindexed at CreateMech) or has drifted.
 */
async function refreshMechDeliveryRate(
  ctx: Ctx,
  mech: string,
  deliveryRate: bigint,
  blockNumber: bigint
): Promise<void> {
  const serviceId = await getServiceIdFromMech(ctx, mech);
  if (serviceId == null) return;
  const m = await getMechById(ctx, serviceId);
  if (m == null) return;
  if (m.maxDeliveryRate == null || m.maxDeliveryRate !== deliveryRate) {
    const createMech = await ctx.cache.get(CreateMech, mech);
    if (createMech?.mechFactory != null) {
      m.maxDeliveryRateUSD = await calculateMaxDeliveryRateUSD(
        ctx,
        deliveryRate,
        createMech.mechFactory,
        blockNumber
      );
    }
    m.maxDeliveryRate = deliveryRate;
    ctx.cache.set(Mech, m);
  }
}

async function incrementServiceDeliveries(ctx: Ctx, serviceId: string): Promise<void> {
  const service = await getService(ctx, serviceId);
  if (service == null) return;
  service.totalDeliveries += 1n;
  ctx.cache.set(Service, service);
}

// =======================================================================
// ServiceRegistryL2
// =======================================================================

export async function handleCreateService(
  ctx: Ctx,
  meta: EventMeta,
  p: { serviceId: bigint; configHash: string }
): Promise<void> {
  ctx.cache.set(
    CreateService,
    new CreateService({
      id: eventId(meta.txHash, meta.logIndex),
      serviceId: p.serviceId,
      configHash: p.configHash,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );
  // A fresh Service, as in the subgraph (CreateService fires once per id).
  ctx.cache.set(
    Service,
    new Service({
      id: serviceEntityId(p.serviceId),
      serviceId: p.serviceId,
      configHash: p.configHash,
      latestMultisig: null,
      historicalMultisigs: [],
      totalRequests: 0n,
      totalDeliveries: 0n,
      agentIds: [],
    })
  );
}

export async function handleCreateMultisigWithAgents(
  ctx: Ctx,
  meta: EventMeta,
  p: { serviceId: bigint; multisig: string }
): Promise<void> {
  // Write-once lookup row: a multisig re-deployed for the same (or another)
  // service keeps its first mapping; only the Service's latest/historical
  // multisig list moves.
  const existing = await ctx.cache.get(CreateMultisigWithAgents, p.multisig);
  if (existing == null) {
    ctx.cache.set(
      CreateMultisigWithAgents,
      new CreateMultisigWithAgents({
        id: p.multisig,
        serviceId: p.serviceId,
        multisig: p.multisig,
        blockNumber: meta.blockNumber,
        blockTimestamp: meta.blockTimestamp,
        transactionHash: meta.txHash,
      })
    );
  }
  await updateServiceMultisig(ctx, p.serviceId, p.multisig);
}

export async function handleRegisterInstance(
  ctx: Ctx,
  meta: EventMeta,
  p: { operator: string; serviceId: bigint; agentInstance: string; agentId: bigint }
): Promise<void> {
  ctx.cache.set(
    RegisterInstance,
    new RegisterInstance({
      id: eventId(meta.txHash, meta.logIndex),
      operator: p.operator,
      serviceId: p.serviceId,
      agentInstance: p.agentInstance,
      agentId: p.agentId,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );
  // Maintain the current canonical agent set for the service.
  const service = await getService(ctx, serviceEntityId(p.serviceId));
  if (service == null) return;
  const agentId = Number(p.agentId);
  if (service.agentIds.indexOf(agentId) === -1) {
    service.agentIds = [...service.agentIds, agentId];
    ctx.cache.set(Service, service);
  }
}

export async function handleTerminateService(
  ctx: Ctx,
  meta: EventMeta,
  p: { serviceId: bigint }
): Promise<void> {
  ctx.cache.set(
    TerminateService,
    new TerminateService({
      id: eventId(meta.txHash, meta.logIndex),
      serviceId: p.serviceId,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );
  const service = await getService(ctx, serviceEntityId(p.serviceId));
  if (service == null) return;
  service.agentIds = [];
  ctx.cache.set(Service, service);
}

/** ServiceRegistryL2 ERC-721 Transfer: the service NFT owner is the Mech owner. */
export async function handleServiceTransfer(
  ctx: Ctx,
  meta: EventMeta,
  p: { from: string; to: string; id: bigint }
): Promise<void> {
  ctx.cache.set(
    Transfer,
    new Transfer({
      id: eventId(meta.txHash, meta.logIndex),
      from: p.from,
      to: p.to,
      serviceId: p.id,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );
  const mech = await getMechById(ctx, serviceEntityId(p.id));
  if (mech == null) return;
  mech.owner = p.to;
  ctx.cache.set(Mech, mech);
}

export async function handleUpdateService(
  ctx: Ctx,
  meta: EventMeta,
  p: { serviceId: bigint; configHash: string }
): Promise<void> {
  ctx.cache.set(
    UpdateService,
    new UpdateService({
      id: eventId(meta.txHash, meta.logIndex),
      serviceId: p.serviceId,
      configHash: p.configHash,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );
  const id = serviceEntityId(p.serviceId);
  const service = await getService(ctx, id);
  if (service != null) {
    service.configHash = p.configHash;
    ctx.cache.set(Service, service);
  }
  const mech = await getMechById(ctx, id);
  if (mech != null) {
    mech.configHash = p.configHash;
    ctx.cache.set(Mech, mech);
  }
}

// =======================================================================
// ComplementaryServiceMetadata
// =======================================================================

export async function handleComplementaryMetadataUpdated(
  ctx: Ctx,
  meta: EventMeta,
  p: { serviceId: bigint; hash: string }
): Promise<void> {
  const id = serviceEntityId(p.serviceId);
  let row = await ctx.cache.get(Metadata, id, ["service"]);
  if (row == null) {
    // The subgraph links `service` by id unconditionally; TypeORM enforces
    // the FK, so the link is set only when the Service row exists (it does
    // for every real service — the registry is indexed from deployment).
    const service = await getService(ctx, id);
    row = new Metadata({
      id,
      serviceIdRaw: p.serviceId,
      service: service ?? null,
      mech: null,
    });
  }
  row.metadata = p.hash;
  const mech = await getMechById(ctx, id);
  if (mech != null) row.mech = mech.address;
  ctx.cache.set(Metadata, row);
}

// =======================================================================
// MechFactory*: capture maxDeliveryRate for the marketplace CreateMech
// =======================================================================

export function handleMechFactoryCreate(
  ctx: Ctx,
  _meta: EventMeta,
  p: { mech: string; serviceId: bigint; maxDeliveryRate: bigint }
): void {
  ctx.pendingMechRates.set(p.mech, p.maxDeliveryRate);
}

// =======================================================================
// MechMarketplace
// =======================================================================

export async function handleCreateMech(
  ctx: Ctx,
  meta: EventMeta,
  p: { mech: string; serviceId: bigint; mechFactory: string }
): Promise<void> {
  // CreateMech lookup row (mech address -> serviceId), used everywhere a
  // mech address must be resolved to its Mech entity.
  const createMech =
    (await ctx.cache.get(CreateMech, p.mech)) ?? new CreateMech({ id: p.mech });
  createMech.mech = p.mech;
  createMech.serviceId = p.serviceId;
  createMech.mechFactory = p.mechFactory;
  createMech.source = Source.MARKETPLACE;
  createMech.blockNumber = meta.blockNumber;
  createMech.blockTimestamp = meta.blockTimestamp;
  createMech.transactionHash = meta.txHash;
  ctx.cache.set(CreateMech, createMech);

  // Payment type from the factory address (static table, no RPC). Throws on
  // an unknown factory — see logic.getPaymentTypeFromFactory.
  const paymentType = getPaymentTypeFromFactory(p.mechFactory);

  const serviceId = serviceEntityId(p.serviceId);
  const service = await getService(ctx, serviceId);

  // Mech.id is the serviceId. A service creating a second mech overwrites
  // this entity in place (address/factory/paymentType change, counters
  // restart) — identical to the subgraph's `new Mech(serviceId)` + save.
  const mech = new Mech({
    id: serviceId,
    address: p.mech,
    mechFactory: p.mechFactory,
    configHash: service?.configHash ?? null,
    owner: meta.txFrom ?? p.mech,
    service: service ?? null,
    totalDeliveriesTransactions: 0n,
    receivedRequests: 0n,
    selfDeliveredFromReceived: 0n,
    deliveredByOthersFromReceived: 0n,
    maxDeliveryRate: null,
    maxDeliveryRateUSD: null,
    karma: 0n,
    paymentType,
  });

  // maxDeliveryRate from the factory event earlier in this transaction.
  const pendingRate = ctx.pendingMechRates.get(p.mech);
  if (pendingRate != null) {
    mech.maxDeliveryRate = pendingRate;
    mech.maxDeliveryRateUSD = await calculateMaxDeliveryRateUSD(
      ctx,
      pendingRate,
      p.mechFactory,
      meta.blockNumber
    );
    ctx.pendingMechRates.delete(p.mech);
  } else {
    ctx.log.warn(
      `PendingMechData not found for mech ${p.mech}. maxDeliveryRate will be null.`
    );
  }
  ctx.cache.set(Mech, mech);

  const global = await getGlobal(ctx);
  global.totalMechs += 1n;
  ctx.cache.set(Global, global);
}

export async function handleMarketplaceRequest(
  ctx: Ctx,
  meta: EventMeta,
  p: {
    priorityMech: string;
    requester: string;
    numRequests: bigint;
    requestIds: string[];
  }
): Promise<void> {
  ctx.cache.set(
    MarketplaceRequest,
    new MarketplaceRequest({
      id: eventId(meta.txHash, meta.logIndex),
      priorityMech: p.priorityMech,
      requester: p.requester,
      numRequests: p.numRequests,
      requestIds: [...p.requestIds],
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );

  const sender = await getOrCreateSender(ctx, p.requester);
  sender.totalLegacyTransactions += 1n;
  sender.totalMarketplaceRequests += 1n;
  sender.totalLegacyRequests += p.numRequests;
  ctx.cache.set(Sender, sender);

  // Demand-side attribution: the requester is a service multisig or not.
  const serviceId = await getServiceIdFromMultisig(ctx, p.requester);
  const service = serviceId == null ? undefined : await getService(ctx, serviceId);

  // Fee info from the priority mech's stored maxDeliveryRate (no RPC).
  // Requesters may pass a higher rate, but the contract locks at most the
  // mech's rate, so this is the amount actually locked.
  let feeUnit: FeeUnit | null = null;
  let feeRaw: bigint | null = null;
  let feeUSD: BigDecimal | null = null;
  const priorityCreateMech = await ctx.cache.get(CreateMech, p.priorityMech);
  if (priorityCreateMech?.serviceId != null) {
    const priorityMech = await getMechById(ctx, priorityCreateMech.serviceId.toString());
    if (priorityMech?.maxDeliveryRate != null) {
      feeRaw = priorityMech.maxDeliveryRate;
      if (priorityCreateMech.mechFactory != null) {
        let unit = getFeeUnitFromFactory(priorityCreateMech.mechFactory);
        if (unit == null) {
          ctx.log.warn(
            `Unknown mechFactory for fee unit detection: ` +
              `${priorityCreateMech.mechFactory}; assuming ${FEE_UNIT_FALLBACK}`
          );
          unit = FEE_UNIT_FALLBACK;
        }
        feeUnit = unit as FeeUnit;
        feeUSD = await convertFeeToUsd(
          priorityMech.maxDeliveryRate,
          unit,
          meta.blockNumber,
          ctx.price,
          ctx.log
        );
      }
    }
  }

  for (const requestId of p.requestIds) {
    const request =
      (await getRequest(ctx, requestId)) ?? new Request({ id: requestId });
    request.sender = sender;
    request.blockNumber = meta.blockNumber;
    request.blockTimestamp = meta.blockTimestamp;
    request.transactionHash = meta.txHash;
    request.isDelivered = false;
    request.priorityMech = p.priorityMech;
    request.mech = p.priorityMech;
    if (feeRaw != null) request.feeRaw = feeRaw;
    if (feeUnit != null) request.feeUnit = feeUnit;
    if (feeUSD != null) request.feeUSD = feeUSD;
    if (service != null) request.service = service;
    ctx.cache.set(Request, request);

    if (service != null) {
      service.totalRequests += 1n;
      ctx.cache.set(Service, service);
    }

    await updateMechCountersOnRequest(ctx, p.priorityMech);

    const rtm = await getOrCreateRequestToMarketplace(ctx, requestId);
    rtm.isMarketplace = true;
    rtm.isOffChain = false;
    rtm.request = request;
    // Payload parked by the mech's Request log earlier in this tx.
    const payload = ctx.pendingRequestPayloads.get(requestId);
    if (payload != null) {
      rtm.ipfsHashBytes = payload;
      ctx.pendingRequestPayloads.delete(requestId);
    }
    ctx.cache.set(RequestToMarketplace, rtm);
  }

  const global = await getGlobal(ctx);
  global.totalMarketplaceRequests += 1n;
  global.totalRequests += p.numRequests;
  global.totalTransactions += 1n;

  // Transaction-level ATA counting: +1 per tx, only when the requester is a
  // known service multisig; deduplicated against deliveries in the same tx.
  if (serviceId != null && !(await ataTransactionExists(ctx, meta.txHash))) {
    createAtaTransaction(ctx, meta);
    global.totalAtaTransactions += 1n;
    sender.totalLegacyAtaTransactions += 1n;
    ctx.cache.set(Sender, sender);
  }
  ctx.cache.set(Global, global);

  if (serviceId != null) {
    await bumpRequestsPerAgent(ctx, serviceId, p.numRequests);
  }
}

export async function handleMarketplaceDelivery(
  ctx: Ctx,
  meta: EventMeta,
  p: {
    deliveryMech: string;
    numDeliveries: bigint;
    requestIds: string[];
    deliveredRequests: boolean[];
  }
): Promise<void> {
  ctx.cache.set(
    MarketplaceDelivery,
    new MarketplaceDelivery({
      id: eventId(meta.txHash, meta.logIndex),
      deliveryMech: p.deliveryMech,
      numDeliveries: p.numDeliveries,
      requestIds: [...p.requestIds],
      deliveredRequests: [...p.deliveredRequests],
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );

  let successfulDeliveries = 0n;
  const deliveryServiceId = await getServiceIdFromMech(ctx, p.deliveryMech);

  for (let i = 0; i < p.requestIds.length; i++) {
    if (!p.deliveredRequests[i]) continue;
    const requestId = p.requestIds[i];
    const request = await getRequest(ctx, requestId);
    if (request == null || request.isDelivered) continue;

    request.isDelivered = true;
    request.deliveredByMech = p.deliveryMech;
    ctx.cache.set(Request, request);

    await updateMechCountersOnDelivery(ctx, request, p.deliveryMech);
    successfulDeliveries += 1n;

    // The Deliver row comes from the mech's Deliver log later in this tx.
    const dfm = await getOrCreateDeliverForMarketplace(ctx, requestId);
    dfm.isMarketplace = true;
    dfm.isOffChain = false;
    ctx.cache.set(DeliverForMarketplace, dfm);

    if (deliveryServiceId != null) {
      await incrementServiceDeliveries(ctx, deliveryServiceId);
    }
  }

  // Matches on-chain numTotalDeliveries: only successful deliveries count.
  if (successfulDeliveries > 0n) {
    const deliveryMech = await getMechByAddress(
      ctx,
      p.deliveryMech,
      meta.txHash,
      "handleMarketplaceDelivery"
    );
    if (deliveryMech != null) {
      deliveryMech.totalDeliveriesTransactions += successfulDeliveries;
      ctx.cache.set(Mech, deliveryMech);
    }
  }

  const global = await getGlobal(ctx);
  global.totalDeliveries += successfulDeliveries;
  global.totalMarketplaceDeliveries += 1n;
  global.totalTransactions += 1n;
  // On-chain delivery ATA counting: the delivery mech is always operated by
  // a service multisig, so count unconditionally (deduplicated per tx).
  if (!(await ataTransactionExists(ctx, meta.txHash))) {
    createAtaTransaction(ctx, meta);
    global.totalAtaTransactions += 1n;
  }
  ctx.cache.set(Global, global);
}

interface SignedDeliverArgs {
  requestId: string;
  mech: string;
  sender: string | null;
  fallbackSender: string | null;
  meta: EventMeta;
  isOffChain: boolean;
  deliveryRate: bigint | null;
  mechServiceMultisig: string | null;
  payload: string | null;
}

/**
 * Signed delivery, keyed txHash-requestId. Called from BOTH the per-request
 * marketplace `Deliver` (rate + multisig + payload) and the batch
 * `MarketplaceDeliveryWithSignatures` (neither); the null-guards make the two
 * writes compose in either log order.
 */
async function persistSignedDeliver(ctx: Ctx, a: SignedDeliverArgs): Promise<void> {
  const serviceId = await getServiceIdFromMech(ctx, a.mech);
  const service = serviceId == null ? undefined : await getService(ctx, serviceId);
  const deliverId = signedDeliverId(a.meta.txHash, a.requestId);

  const deliver =
    (await ctx.cache.get(Deliver, deliverId)) ?? new Deliver({ id: deliverId });
  deliver.requestIdBytes = a.requestId;
  deliver.mech = a.mech;
  deliver.blockNumber = a.meta.blockNumber;
  deliver.blockTimestamp = a.meta.blockTimestamp;
  deliver.transactionHash = a.meta.txHash;
  deliver.request = null;
  deliver.sender = a.sender ?? a.fallbackSender ?? a.mech;
  if (service != null) deliver.service = service;
  ctx.cache.set(Deliver, deliver);

  // finalFeeUSD for signed deliveries of an on-chain request (write-once).
  if (a.deliveryRate != null) {
    const request = await getRequest(ctx, a.requestId);
    if (request != null && request.finalFeeUSD == null) {
      await updateFeesOnDelivery(ctx, request, a.deliveryRate, a.meta.blockNumber);
      ctx.cache.set(Request, request);
    }
  }

  const dfm = await getOrCreateDeliverForMarketplace(ctx, a.requestId);
  dfm.isMarketplace = true;
  dfm.isOffChain = a.isOffChain;
  dfm.deliver = deliver;
  if (a.deliveryRate != null) dfm.deliveryRate = a.deliveryRate;
  if (a.mechServiceMultisig != null) dfm.mechServiceMultisig = a.mechServiceMultisig;
  if (a.payload != null) {
    if (isIpfsPayload(a.payload)) {
      dfm.ipfsHashBytes = a.payload;
    } else {
      ctx.log.warn(
        `Deliver payload has length ${(a.payload.length - 2) / 2}, skipping IPFS hash.`
      );
    }
  }
  ctx.cache.set(DeliverForMarketplace, dfm);
}

export async function handleMarketplaceDeliveryWithSignatures(
  ctx: Ctx,
  meta: EventMeta,
  p: {
    deliveryMech: string;
    requester: string;
    numDeliveries: bigint;
    requestIds: string[];
  }
): Promise<void> {
  ctx.cache.set(
    MarketplaceDeliveryWithSignatures,
    new MarketplaceDeliveryWithSignatures({
      id: eventId(meta.txHash, meta.logIndex),
      deliveryMech: p.deliveryMech,
      requester: p.requester,
      numDeliveries: p.numDeliveries,
      requestIds: [...p.requestIds],
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );

  for (const requestId of p.requestIds) {
    await persistSignedDeliver(ctx, {
      requestId,
      mech: p.deliveryMech,
      sender: p.deliveryMech,
      fallbackSender: null,
      meta,
      isOffChain: true,
      deliveryRate: null,
      mechServiceMultisig: null,
      payload: null,
    });
  }

  // On-chain updateNumRequests() bumps both numTotalRequests and
  // numTotalDeliveries for off-chain batches; mirror it on the mech.
  const deliveryMech = await getMechByAddress(
    ctx,
    p.deliveryMech,
    meta.txHash,
    "handleMarketplaceDeliveryWithSignatures"
  );
  if (deliveryMech != null) {
    deliveryMech.totalDeliveriesTransactions += p.numDeliveries;
    deliveryMech.receivedRequests += p.numDeliveries;
    deliveryMech.selfDeliveredFromReceived += p.numDeliveries;
    ctx.cache.set(Mech, deliveryMech);
  }

  // Off-chain requests: one request per delivery is assumed.
  const sender = await getOrCreateSender(ctx, p.requester);
  sender.totalOffChainRequests += p.numDeliveries;
  sender.totalLegacyRequests += p.numDeliveries;
  sender.totalLegacyTransactions += 1n;
  ctx.cache.set(Sender, sender);

  const global = await getGlobal(ctx);
  global.totalRequests += p.numDeliveries;
  global.totalDeliveries += p.numDeliveries;
  global.totalMarketplaceDeliveriesWithSignatures += 1n;
  // 1 for the request side and 1 for the delivery side (request is off-chain).
  global.totalTransactions += 2n;

  // ATA: +1 for the delivery mech (always a service multisig), +1 more if
  // the requester is one too — the only path that can add 2 in one tx.
  if (!(await ataTransactionExists(ctx, meta.txHash))) {
    createAtaTransaction(ctx, meta);
    let ataIncrement = 1n;
    if (await isServiceMultisig(ctx, p.requester)) {
      ataIncrement += 1n;
      sender.totalLegacyAtaTransactions += 1n;
      ctx.cache.set(Sender, sender);
    }
    global.totalAtaTransactions += ataIncrement;
  }
  ctx.cache.set(Global, global);

  const requesterServiceId = await getServiceIdFromMultisig(ctx, p.requester);
  if (requesterServiceId != null) {
    await bumpRequestsPerAgent(ctx, requesterServiceId, p.numDeliveries);
  }
}

/** Marketplace V2 `Deliver` — the per-request half of a signed delivery. */
export async function handleDeliverWithSignatures(
  ctx: Ctx,
  meta: EventMeta,
  p: {
    mech: string;
    mechServiceMultisig: string;
    requestId: string;
    deliveryRate: bigint;
    deliveryData: string;
  }
): Promise<void> {
  await persistSignedDeliver(ctx, {
    requestId: p.requestId,
    mech: p.mech,
    sender: p.mech,
    fallbackSender: null,
    meta,
    isOffChain: true,
    deliveryRate: p.deliveryRate,
    mechServiceMultisig: p.mechServiceMultisig,
    payload: p.deliveryData,
  });
}

// =======================================================================
// Karma
// =======================================================================

export async function handleMechKarmaChanged(
  ctx: Ctx,
  _meta: EventMeta,
  p: { mech: string; karmaChange: bigint }
): Promise<void> {
  // Karma events can legitimately reference mechs this squid does not know
  // (missing-mapping policy: skip with a log, never throw).
  const serviceId = await getServiceIdFromMech(ctx, p.mech);
  if (serviceId == null) {
    ctx.log.warn(
      `MechKarmaChanged: Could not find serviceId for mech ${p.mech}. Skipping karma update.`
    );
    return;
  }
  const mech = await getMechById(ctx, serviceId);
  if (mech == null) {
    ctx.log.warn(
      `MechKarmaChanged: Mech entity not found for serviceId ${serviceId}. Skipping karma update.`
    );
    return;
  }
  mech.karma += p.karmaChange;
  ctx.cache.set(Mech, mech);
}

// =======================================================================
// Mech contracts (the subgraph's per-mech templates). Subscribed by topic
// without an address filter: handlers return `false` for unknown emitters;
// for a KNOWN mech a missing Mech entity throws, as in the subgraph.
// =======================================================================

/** OlasMech `Request(mech, requestId, data)`; the emitter is the mech. */
export async function handleMechRequest(
  ctx: Ctx,
  meta: EventMeta,
  p: { requestId: string; data: string }
): Promise<boolean> {
  const mech = meta.address;
  const serviceId = await getServiceIdFromMech(ctx, mech);
  if (serviceId == null) return false; // foreign emitter

  const isMarketplaceTx = isMarketplaceTransaction(meta.txTo);
  let request: Request | undefined;

  if (!isMarketplaceTx) {
    // Direct-to-mech request. The subgraph increments NO request counters on
    // this path; kept as-is.
    const senderAddress = meta.txFrom ?? mech;
    const sender = await getOrCreateSender(ctx, senderAddress);
    const service = await getService(ctx, serviceId);
    request = (await getRequest(ctx, p.requestId)) ?? new Request({ id: p.requestId });
    request.sender = sender;
    request.mech = mech;
    request.service = service ?? null;
    request.blockNumber = meta.blockNumber;
    request.blockTimestamp = meta.blockTimestamp;
    request.transactionHash = meta.txHash;
    request.isDelivered = false;
    request.priorityMech = mech;
    ctx.cache.set(Request, request);
  }

  // Raw payload: stored (never fetched) when it is a 32-byte IPFS digest.
  if (!isIpfsPayload(p.data)) {
    ctx.log.warn(
      `Request ${p.requestId} has payload of length ${(p.data.length - 2) / 2}, ` +
        `skipping IPFS hash.`
    );
    return true;
  }
  const existingRtm = await ctx.cache.get(RequestToMarketplace, p.requestId, ["request"]);
  if (existingRtm != null) {
    existingRtm.ipfsHashBytes = p.data;
    ctx.cache.set(RequestToMarketplace, existingRtm);
  } else if (request != null) {
    const rtm = await getOrCreateRequestToMarketplace(ctx, p.requestId);
    rtm.ipfsHashBytes = p.data;
    rtm.request = request;
    ctx.cache.set(RequestToMarketplace, rtm);
  } else {
    // Marketplace tx: MarketplaceRequest creates the Request later and picks
    // the payload up from here.
    ctx.pendingRequestPayloads.set(p.requestId, p.data);
  }
  return true;
}

/** OlasMech `Deliver(mech, mechServiceMultisig, requestId, deliveryRate, data)`; the emitter is the mech. */
export async function handleMechDeliver(
  ctx: Ctx,
  meta: EventMeta,
  p: {
    mechServiceMultisig: string;
    requestId: string;
    deliveryRate: bigint;
    data: string;
  }
): Promise<boolean> {
  const mech = meta.address;
  const serviceId = await getServiceIdFromMech(ctx, mech);
  if (serviceId == null) return false; // foreign emitter

  const isMarketplaceTx = isMarketplaceTransaction(meta.txTo);
  const deliverId = eventId(meta.txHash, meta.logIndex);
  const request = await getRequest(ctx, p.requestId);
  let isNewDelivery = false;

  // The write-once guard is finalFeeUSD == null, NOT !isDelivered: on the
  // marketplace path MarketplaceDelivery already set isDelivered but had no
  // rate; this log carries it.
  if (request != null && request.finalFeeUSD == null) {
    if (!request.isDelivered) {
      isNewDelivery = true;
      request.isDelivered = true;
      request.deliveredByMech = mech;
      if (!isMarketplaceTx) {
        await updateMechCountersOnDelivery(ctx, request, mech);
      }
    }
    await updateFeesOnDelivery(ctx, request, p.deliveryRate, meta.blockNumber);
    ctx.cache.set(Request, request);
  }

  const service = await getService(ctx, serviceId);
  const deliver =
    (await ctx.cache.get(Deliver, deliverId)) ?? new Deliver({ id: deliverId });
  deliver.requestIdBytes = p.requestId;
  deliver.mech = mech;
  deliver.blockNumber = meta.blockNumber;
  deliver.blockTimestamp = meta.blockTimestamp;
  deliver.transactionHash = meta.txHash;
  deliver.sender = meta.txFrom ?? mech;
  deliver.service = service ?? null;
  deliver.request = request ?? null;
  ctx.cache.set(Deliver, deliver);

  if (!isMarketplaceTx && isNewDelivery) {
    await incrementServiceDeliveries(ctx, serviceId);
  }
  if (!isMarketplaceTx) {
    // Direct delivery: ATA only, no Global.totalDeliveries (subgraph parity).
    const global = await getGlobal(ctx);
    if (!(await ataTransactionExists(ctx, meta.txHash))) {
      createAtaTransaction(ctx, meta);
      global.totalAtaTransactions += 1n;
    }
    ctx.cache.set(Global, global);
  }

  // `isMarketplace` is true even on the direct path (subgraph parity).
  const dfm = await getOrCreateDeliverForMarketplace(ctx, p.requestId);
  dfm.mechServiceMultisig = p.mechServiceMultisig;
  dfm.deliveryRate = p.deliveryRate;
  dfm.isMarketplace = true;
  dfm.isOffChain = false;
  dfm.deliver = deliver;
  if (isIpfsPayload(p.data)) {
    dfm.ipfsHashBytes = p.data;
  } else {
    ctx.log.warn(
      `Deliver payload has length ${(p.data.length - 2) / 2}, skipping IPFS hash.`
    );
  }
  ctx.cache.set(DeliverForMarketplace, dfm);

  await refreshMechDeliveryRate(ctx, mech, p.deliveryRate, meta.blockNumber);
  return true;
}

export async function handleMaxDeliveryRateUpdated(
  ctx: Ctx,
  meta: EventMeta,
  p: { maxDeliveryRate: bigint }
): Promise<boolean> {
  const mech = meta.address;
  const serviceId = await getServiceIdFromMech(ctx, mech);
  if (serviceId == null) return false; // foreign emitter

  const m = await getMechById(ctx, serviceId);
  if (m == null) {
    throw new Error(
      `MaxDeliveryRateUpdated: Mech entity not found for serviceId ${serviceId}`
    );
  }
  const createMech = await ctx.cache.get(CreateMech, mech);
  if (createMech?.mechFactory != null) {
    m.maxDeliveryRateUSD = await calculateMaxDeliveryRateUSD(
      ctx,
      p.maxDeliveryRate,
      createMech.mechFactory,
      meta.blockNumber
    );
  }
  m.maxDeliveryRate = p.maxDeliveryRate;
  ctx.cache.set(Mech, m);
  return true;
}

// =======================================================================
// Operational
// =======================================================================

export function writeIndexerStatus(
  ctx: Ctx,
  blockNumber: bigint,
  blockTimestamp: bigint
): void {
  ctx.cache.set(
    IndexerStatus,
    new IndexerStatus({ id: INDEXER_STATUS_ID, blockNumber, blockTimestamp })
  );
}
