// Event semantics, ported branch-for-branch from the subgraph's
// src/*.ts. Pure decision logic lives in logic.ts; this file does the
// store reads/writes and the RPC calls.
//
// Every handler takes an explicit `EventMeta` instead of graph-node's
// ambient `event`, and a cache instead of the global store.

import {
  AgentFundingEvent,
  AgentSafe,
  BondMovement,
  DailyServiceFunds,
  FundsCategory,
  FundsMovement,
  FundsSource,
  IndexerStatus,
  MasterSafe,
  PendingRegistration,
  Service,
  ServiceBondType,
  ServiceIndex,
  ServiceNftCustodyChange,
  StakingContract,
  Token,
  TokenBalance,
} from "./model";
import { EntityCache } from "./entityCache";
import {
  BondQueue,
  agentFundingEventId,
  classifyTransfer,
  dailyServiceFundsId,
  dayTimestamp,
  eventId,
  evictionRowId,
  mergeUnique,
  pushUnique,
  safeDeployedId,
  serviceEntityId,
  tokenBalanceId,
} from "./logic";
import { getSafeConfig, getStakingConfig } from "./rpc";
import {
  CHAIN,
  OLAS,
  ROLE_AGENT,
  ROLE_AGENT_EOA,
  ROLE_MASTER,
  ROLE_MASTER_EOA,
  ROLE_STAKING,
  SERVICE_REGISTRY_L2,
  SERVICE_STATE_DEPLOYED,
  SERVICE_STATE_REGISTERED,
  SERVICE_STATE_STAKED,
  SERVICE_STATE_TERMINATED,
  SERVICE_STATE_UNSTAKED,
  SRTU,
  ZERO_ADDRESS,
  INDEXER_STATUS_ID,
  knownTokenSymbol,
} from "./constants";

export interface EventMeta {
  blockNumber: bigint;
  blockTimestamp: bigint;
  txHash: string;
  logIndex: number;
  /** The contract that emitted the log. */
  address: string;
}

export interface Ctx {
  cache: EntityCache;
  bondQueue: BondQueue;
  log: { warn(msg: string): void; info(msg: string): void };
}

// --- Entity helpers ---------------------------------------------------

async function getOrCreateService(
  ctx: Ctx,
  serviceId: bigint,
  meta: EventMeta
): Promise<Service> {
  const id = serviceEntityId(serviceId);
  const existing = await ctx.cache.get(Service, id);
  if (existing != null) return existing;

  const service = new Service({
    id,
    serviceId,
    agentIds: [],
    operators: [],
    state: SERVICE_STATE_REGISTERED,
    totalOlasRewardsClaimed: 0n,
    registeredTimestamp: meta.blockTimestamp,
    updatedTimestamp: meta.blockTimestamp,
    masterSafe: null,
    agentSafe: null,
    nftCustodian: null,
    currentStakingContract: null,
  });
  ctx.cache.set(Service, service);
  return service;
}

/**
 * First-sighting derivation for a Master Safe.
 *
 * Confirms `address` really is a Gnosis Safe before treating it as one: the
 * service NFT also lands on staking proxies and EOAs, none of which are
 * Master Safes. A real Safe answers getOwners(); everything else reverts.
 * On revert we return null and the caller leaves any existing link alone.
 *
 * Returns null for non-Safes; otherwise creates the entity, emits the
 * SAFE_DEPLOYED anchor row, and tracks the Safe + its Master EOA.
 */
async function getOrCreateMasterSafe(
  ctx: Ctx,
  address: string,
  meta: EventMeta
): Promise<MasterSafe | null> {
  const existing = await ctx.cache.get(MasterSafe, address);
  if (existing != null) {
    existing.lastActivityTimestamp = meta.blockTimestamp;
    ctx.cache.set(MasterSafe, existing);
    return existing;
  }

  // Read owners AT this block — see rpc.ts on why `latest` would be wrong.
  const cfg = await getSafeConfig(address, Number(meta.blockNumber));
  if (cfg == null) {
    ctx.log.info(
      `skipping non-Safe recipient ${address} (getOwners reverted/empty) tx ${meta.txHash}`
    );
    return null;
  }

  const masterSafe = new MasterSafe({
    id: address,
    network: CHAIN.name,
    // Pearl's flow guarantees owners[0] == Master EOA (1-of-2 with a
    // non-signing backup).
    owners: cfg.owners,
    masterEoa: cfg.owners[0],
    threshold: cfg.threshold,
    firstSeenTimestamp: meta.blockTimestamp,
    firstSeenBlock: meta.blockNumber,
    // historyFloor* mirror firstSeen* but are the consumer UI's anchor for
    // "History starts here"; separate fields so the contract is explicit.
    historyFloorTimestamp: meta.blockTimestamp,
    historyFloorBlock: meta.blockNumber,
    lastActivityTimestamp: meta.blockTimestamp,
    setupTransferSeen: false,
  });
  ctx.cache.set(MasterSafe, masterSafe);

  // SAFE_DEPLOYED anchor row ("Setup complete" in the wallet UI).
  ctx.cache.set(
    FundsMovement,
    new FundsMovement({
      id: safeDeployedId(address),
      masterSafe,
      category: FundsCategory.SAFE_DEPLOYED,
      source: FundsSource.SEMANTIC,
      amount: 0n,
      from: ZERO_ADDRESS,
      to: address,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );

  await ctx.cache.upsertTracked(
    address,
    ROLE_MASTER,
    address,
    null,
    meta.blockNumber
  );
  if (masterSafe.masterEoa && masterSafe.masterEoa !== ZERO_ADDRESS) {
    await ctx.cache.upsertTracked(
      masterSafe.masterEoa,
      ROLE_MASTER_EOA,
      address,
      null,
      meta.blockNumber
    );
  }
  return masterSafe;
}

async function getOrCreateAgentSafe(
  ctx: Ctx,
  address: string,
  service: Service,
  meta: EventMeta
): Promise<AgentSafe> {
  const existing = await ctx.cache.get(AgentSafe, address);
  if (existing != null) return existing;

  const agentSafe = new AgentSafe({
    id: address,
    service,
    masterSafe: service.masterSafe ?? null,
    createdTimestamp: meta.blockTimestamp,
  });
  ctx.cache.set(AgentSafe, agentSafe);

  const masterSafeId = service.masterSafe?.id ?? null;
  if (masterSafeId != null) {
    await ctx.cache.upsertTracked(
      address,
      ROLE_AGENT,
      masterSafeId,
      service.id,
      meta.blockNumber
    );
    // Operator rows are written ONLY for Pearl-linked services, and the
    // Master Safe itself is skipped: in Pearl the Master Safe IS the service
    // operator, and TrackedAddress is write-once — writing it as AGENT_EOA
    // before its MASTER row landed would permanently poison the role and
    // route the user's entire wallet history to OTHER. The registry is
    // permissionless, so a non-Pearl service must not be able to pre-claim
    // an address that later becomes a Pearl Master Safe.
    for (const operator of service.operators) {
      if (operator === masterSafeId) continue;
      await ctx.cache.upsertTracked(
        operator,
        ROLE_AGENT_EOA,
        masterSafeId,
        service.id,
        meta.blockNumber
      );
    }
  }
  return agentSafe;
}

/**
 * Token metadata is hardcoded, not queried: the ERC20Detailed ABI here has
 * no symbol()/decimals() and Pearl's token set is small and known. First
 * write wins, so a wrong `decimals` would persist forever — an unknown
 * indexed token defaults to 6, NOT 18, because an 18-decimal fallback would
 * misformat amounts by 10^12 in every consumer.
 */
async function getOrCreateToken(ctx: Ctx, address: string): Promise<Token> {
  const existing = await ctx.cache.get(Token, address);
  if (existing != null) return existing;

  const symbol = knownTokenSymbol(address);
  let token: Token;
  if (symbol === "OLAS" || symbol === CHAIN.wrappedNativeSymbol) {
    token = new Token({ id: address, symbol, decimals: 18 });
  } else if (symbol != null) {
    token = new Token({ id: address, symbol, decimals: 6 });
  } else {
    ctx.log.warn(
      `getOrCreateToken: no symbol/decimals resolver for indexed token ${address} on ${CHAIN.name} — constants.ts and the processor's token list are out of sync. Defaulting to UNKNOWN/6.`
    );
    token = new Token({ id: address, symbol: "UNKNOWN", decimals: 6 });
  }
  ctx.cache.set(Token, token);
  return token;
}

/** isDelta: balance += amount (signed). Otherwise an absolute write. */
async function upsertTokenBalance(
  ctx: Ctx,
  safe: string,
  tokenAddress: string,
  amount: bigint,
  meta: EventMeta,
  isDelta: boolean
): Promise<void> {
  const id = tokenBalanceId(safe, tokenAddress);
  let bal = await ctx.cache.get(TokenBalance, id);
  if (bal == null) {
    const token = await getOrCreateToken(ctx, tokenAddress);
    bal = new TokenBalance({
      id,
      safe,
      token,
      // First sighting: the initial balance is `amount` whether it is the
      // first signed delta or an absolute baseline write.
      balance: amount,
      lastUpdatedTimestamp: meta.blockTimestamp,
      lastUpdatedBlock: meta.blockNumber,
    });
  } else {
    bal.balance = isDelta ? bal.balance + amount : amount;
    bal.lastUpdatedTimestamp = meta.blockTimestamp;
    bal.lastUpdatedBlock = meta.blockNumber;
  }
  ctx.cache.set(TokenBalance, bal);
}

async function addDailyOlasReward(
  ctx: Ctx,
  service: Service,
  amount: bigint,
  blockTimestamp: bigint
): Promise<void> {
  const day = dayTimestamp(blockTimestamp);
  const id = dailyServiceFundsId(service.serviceId, day);
  let daily = await ctx.cache.get(DailyServiceFunds, id);
  if (daily == null) {
    daily = new DailyServiceFunds({
      id,
      service,
      dayTimestamp: day,
      olasRewardsClaimed: 0n,
      cumulativeOlasRewardsClaimed: service.totalOlasRewardsClaimed,
    });
  }
  daily.olasRewardsClaimed += amount;
  daily.cumulativeOlasRewardsClaimed = service.totalOlasRewardsClaimed + amount;
  ctx.cache.set(DailyServiceFunds, daily);

  service.totalOlasRewardsClaimed += amount;
  ctx.cache.set(Service, service);
}

/**
 * Backfill a dequeued BondMovement with its serviceId + bondType.
 *
 * FK note: the subgraph could assign a raw address to a relation field
 * because graph-node does not enforce foreign keys. TypeORM does, so a
 * reference is only written when the referenced row actually exists.
 */
async function attributeBond(
  ctx: Ctx,
  bondMovementId: string | null,
  serviceId: bigint,
  bondType: ServiceBondType
): Promise<void> {
  if (bondMovementId == null) return;
  const movement = await ctx.cache.get(BondMovement, bondMovementId);
  if (movement == null) return;

  const service = await ctx.cache.get(Service, serviceEntityId(serviceId));
  movement.bondType = bondType;
  if (service != null) {
    movement.service = service;
    // masterSafe is normally stamped by the SRTU producer; fall back to the
    // Service link for services discovered out of order.
    if (movement.masterSafe == null && service.masterSafe != null) {
      movement.masterSafe = service.masterSafe;
    }
    // The agent link lets the wallet render the agent name on stake /
    // unstake rows. The multisig only exists post-CreateMultisigWithAgents,
    // so it resolves on refunds and re-stakes but is null on the very first
    // deposit (the name still resolves via service.agentIds).
    if (service.agentSafe != null) {
      movement.agentSafe = service.agentSafe;
    }
  }
  ctx.cache.set(BondMovement, movement);
}

// --- ServiceRegistryL2 ------------------------------------------------

export async function handleRegisterInstance(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint; agentId: bigint; operator: string }
): Promise<void> {
  const agentId = Number(e.agentId);
  const id = serviceEntityId(e.serviceId);
  const existing = await ctx.cache.get(Service, id);

  if (existing != null) {
    // CreateMultisigWithAgents already fired — record directly.
    existing.agentIds = pushUnique(existing.agentIds, agentId);
    existing.operators = pushUnique(existing.operators, e.operator);
    existing.updatedTimestamp = meta.blockTimestamp;
    ctx.cache.set(Service, existing);
  } else {
    // Buffer; drained at CreateMultisigWithAgents time.
    let pending = await ctx.cache.get(PendingRegistration, id);
    if (pending == null) {
      pending = new PendingRegistration({ id, agentIds: [], operators: [] });
    }
    pending.agentIds = pushUnique(pending.agentIds, agentId);
    pending.operators = pushUnique(pending.operators, e.operator);
    ctx.cache.set(PendingRegistration, pending);
  }

  // Attribute the AGENT_BOND row enqueued by the preceding
  // registerAgentsTokenDeposit. Deduped: RegisterInstance fires once per
  // agent instance, but only one agent-bond row exists.
  await attributeBond(
    ctx,
    ctx.bondQueue.dequeueAgentBondOnce(meta.txHash, e.serviceId),
    e.serviceId,
    ServiceBondType.AGENT_BOND
  );
}

export async function handleActivateRegistration(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint }
): Promise<void> {
  // The SRTU call runs before this registry call in ServiceManager.
  await attributeBond(
    ctx,
    ctx.bondQueue.dequeue(meta.txHash),
    e.serviceId,
    ServiceBondType.SECURITY_DEPOSIT
  );
}

export async function handleCreateMultisigWithAgents(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint; multisig: string }
): Promise<void> {
  const service = await getOrCreateService(ctx, e.serviceId, meta);
  service.state = SERVICE_STATE_DEPLOYED;
  service.updatedTimestamp = meta.blockTimestamp;

  // Drain PendingRegistration into the Service. The two arrays are
  // independent (an operator can register multiple agents; an agent ID can
  // have multiple operators), so they are deduped separately.
  const pending = await ctx.cache.get(
    PendingRegistration,
    serviceEntityId(e.serviceId)
  );
  if (pending != null) {
    service.agentIds = mergeUnique(service.agentIds, pending.agentIds);
    service.operators = mergeUnique(service.operators, pending.operators);
  }
  ctx.cache.set(Service, service);

  const agentSafe = await getOrCreateAgentSafe(ctx, e.multisig, service, meta);
  service.agentSafe = agentSafe;
  ctx.cache.set(Service, service);

  ctx.cache.set(
    ServiceIndex,
    new ServiceIndex({
      id: serviceEntityId(e.serviceId),
      multisig: e.multisig,
    })
  );
}

/**
 * ERC-721 Transfer of the service NFT. Records every custody change, then
 * tries to resolve the recipient to a Master Safe. Skips the zero address
 * (mint / burn) and known staking proxies — on stake the NFT moves Master
 * Safe -> proxy, and getOwners() on a proxy reverts.
 */
export async function handleServiceNftTransfer(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint; from: string; to: string }
): Promise<void> {
  const service = await getOrCreateService(ctx, e.serviceId, meta);
  service.nftCustodian = e.to;
  service.updatedTimestamp = meta.blockTimestamp;
  ctx.cache.set(Service, service);

  ctx.cache.set(
    ServiceNftCustodyChange,
    new ServiceNftCustodyChange({
      id: eventId(meta.txHash, meta.logIndex),
      service,
      from: e.from,
      to: e.to,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );

  if (e.to === ZERO_ADDRESS) return;
  if ((await ctx.cache.get(StakingContract, e.to)) != null) return;

  // Only link when it resolves, so a stake hop never clobbers the real
  // Master Safe link established at mint.
  const masterSafe = await getOrCreateMasterSafe(ctx, e.to, meta);
  if (masterSafe != null) {
    service.masterSafe = masterSafe;
    ctx.cache.set(Service, service);
  }
}

export async function handleTerminateService(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint }
): Promise<void> {
  const service = await getOrCreateService(ctx, e.serviceId, meta);
  service.state = SERVICE_STATE_TERMINATED;
  service.updatedTimestamp = meta.blockTimestamp;
  ctx.cache.set(Service, service);

  // terminateTokenRefund runs before terminate in ServiceManager.
  await attributeBond(
    ctx,
    ctx.bondQueue.dequeue(meta.txHash),
    e.serviceId,
    ServiceBondType.SECURITY_DEPOSIT
  );
}

export async function handleOperatorUnbond(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint }
): Promise<void> {
  // unbondTokenRefund runs before unbond in ServiceManager.
  await attributeBond(
    ctx,
    ctx.bondQueue.dequeue(meta.txHash),
    e.serviceId,
    ServiceBondType.AGENT_BOND
  );
}

// --- ServiceRegistryTokenUtility --------------------------------------

/** Only addresses already tracked as MASTER, so non-Pearl bonds stay
 * unlinked and never touch TokenBalance. */
async function trackedMasterId(
  ctx: Ctx,
  account: string
): Promise<string | null> {
  const t = await ctx.cache.tracked(account);
  return t != null && t.role === ROLE_MASTER ? t.masterSafeId : null;
}

/**
 * Fires once per activateRegistrationTokenDeposit (security deposit) and
 * once per registerAgentsTokenDeposit (agent bond). The two share an event
 * signature and carry no serviceId, so the row is created here without
 * serviceId/bondType and enqueued; the following ServiceRegistryL2 event
 * backfills them. If no such event follows, the row stays unattributed
 * (amount preserved).
 *
 * TokenBalance: the raw Master Safe <-> SRTU transfer is suppressed in
 * classifyTransfer, so the bond's balance effect is booked HERE, exactly
 * once — otherwise the Master Safe balance would overstate by the bonded
 * amount for the whole staking period.
 */
export async function handleTokenDeposit(
  ctx: Ctx,
  meta: EventMeta,
  e: { account: string; token: string; amount: bigint }
): Promise<void> {
  const id = eventId(meta.txHash, meta.logIndex);
  const masterSafeId = await trackedMasterId(ctx, e.account);

  ctx.cache.set(
    BondMovement,
    new BondMovement({
      id,
      category: FundsCategory.SERVICE_BOND_DEPOSIT,
      source: FundsSource.SEMANTIC,
      token: e.token,
      amount: e.amount,
      from: e.account,
      to: meta.address,
      masterSafe: masterSafeId ? new MasterSafe({ id: masterSafeId }) : null,
      service: null,
      agentSafe: null,
      bondType: null,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );

  if (masterSafeId != null) {
    // Bond leaves the Master Safe -> debit.
    await upsertTokenBalance(ctx, e.account, e.token, -e.amount, meta, true);
  }
  ctx.bondQueue.enqueue(meta.txHash, id);
}

export async function handleTokenRefund(
  ctx: Ctx,
  meta: EventMeta,
  e: { account: string; token: string; amount: bigint }
): Promise<void> {
  const id = eventId(meta.txHash, meta.logIndex);
  const masterSafeId = await trackedMasterId(ctx, e.account);

  ctx.cache.set(
    BondMovement,
    new BondMovement({
      id,
      category: FundsCategory.SERVICE_BOND_REFUND,
      source: FundsSource.SEMANTIC,
      token: e.token,
      amount: e.amount,
      from: meta.address,
      to: e.account,
      masterSafe: masterSafeId ? new MasterSafe({ id: masterSafeId }) : null,
      service: null,
      agentSafe: null,
      bondType: null,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );

  if (masterSafeId != null) {
    // Bond returns to the Master Safe -> credit.
    await upsertTokenBalance(ctx, e.account, e.token, e.amount, meta, true);
  }
  ctx.bondQueue.enqueue(meta.txHash, id);
}

// --- StakingFactory ---------------------------------------------------

export async function handleInstanceCreated(
  ctx: Ctx,
  meta: EventMeta,
  e: { instance: string; implementation: string },
  isAllowed: boolean
): Promise<void> {
  if (!isAllowed) return;
  if ((await ctx.cache.get(StakingContract, e.instance)) != null) return;

  // Fields are delegated to the implementation, so call on the proxy.
  const cfg = await getStakingConfig(e.instance);
  if (cfg == null) {
    ctx.log.warn(
      `StakingProxy ${e.instance} config call reverted (impl=${e.implementation}, tx=${meta.txHash}); skipping`
    );
    return;
  }

  ctx.cache.set(
    StakingContract,
    new StakingContract({
      id: e.instance,
      implementation: e.implementation,
      minStakingDeposit: cfg.minStakingDeposit,
      numAgentInstances: cfg.numAgentInstances,
      createdBlock: meta.blockNumber,
      createdTimestamp: meta.blockTimestamp,
    })
  );

  // Register the proxy so classifyTransfer's hot path recognises
  // staking-reward sends via the single tracked-address lookup.
  await ctx.cache.upsertTracked(
    e.instance,
    ROLE_STAKING,
    null,
    null,
    meta.blockNumber
  );
}

// --- StakingProxy -----------------------------------------------------

/**
 * `owner` is the Master Safe (ServiceStaked carries it explicitly), so this
 * is the canonical Master Safe + Agent Safe discovery path — the NFT
 * Transfer path is secondary.
 */
export async function handleServiceStaked(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint; owner: string; multisig: string }
): Promise<void> {
  const service = await getOrCreateService(ctx, e.serviceId, meta);
  service.state = SERVICE_STATE_STAKED;
  service.currentStakingContract = new StakingContract({ id: meta.address });
  service.updatedTimestamp = meta.blockTimestamp;

  const masterSafe = await getOrCreateMasterSafe(ctx, e.owner, meta);
  if (masterSafe != null) service.masterSafe = masterSafe;
  ctx.cache.set(Service, service);

  const agentSafe = await getOrCreateAgentSafe(ctx, e.multisig, service, meta);
  service.agentSafe = agentSafe;
  ctx.cache.set(Service, service);
}

/**
 * The subgraph fell back to the raw `owner` / `multisig` address when the
 * Service had no resolved link. graph-node tolerates that dangling
 * reference; TypeORM's FK does not, so the relation is left null instead.
 * `from`/`to` still carry the raw addresses, so no information is lost.
 */
async function stakingRewardRow(
  ctx: Ctx,
  meta: EventMeta,
  service: Service,
  category: FundsCategory,
  amount: bigint,
  epoch: bigint,
  to: string,
  id: string
): Promise<void> {
  ctx.cache.set(
    FundsMovement,
    new FundsMovement({
      id,
      service,
      masterSafe: service.masterSafe ?? null,
      agentSafe: service.agentSafe ?? null,
      stakingContract: new StakingContract({ id: meta.address }),
      epoch,
      category,
      source: FundsSource.SEMANTIC,
      token: category === FundsCategory.SERVICE_EVICTED ? null : OLAS,
      amount,
      from: meta.address,
      to,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    })
  );
}

export async function handleRewardClaimed(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint; multisig: string; reward: bigint; epoch: bigint }
): Promise<void> {
  const service = await getOrCreateService(ctx, e.serviceId, meta);
  await stakingRewardRow(
    ctx,
    meta,
    service,
    FundsCategory.STAKING_REWARD_CLAIM,
    e.reward,
    e.epoch,
    e.multisig,
    eventId(meta.txHash, meta.logIndex)
  );
  await addDailyOlasReward(ctx, service, e.reward, meta.blockTimestamp);
  service.updatedTimestamp = meta.blockTimestamp;
  ctx.cache.set(Service, service);
}

export async function handleAnyUnstake(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint; multisig: string; reward: bigint; epoch: bigint }
): Promise<void> {
  const service = await getOrCreateService(ctx, e.serviceId, meta);
  await stakingRewardRow(
    ctx,
    meta,
    service,
    FundsCategory.UNSTAKE_REWARD,
    e.reward,
    e.epoch,
    e.multisig,
    eventId(meta.txHash, meta.logIndex)
  );
  if (e.reward > 0n) {
    await addDailyOlasReward(ctx, service, e.reward, meta.blockTimestamp);
  }
  service.state = SERVICE_STATE_UNSTAKED;
  service.currentStakingContract = null;
  service.updatedTimestamp = meta.blockTimestamp;
  ctx.cache.set(Service, service);
}

/**
 * Informational: eviction itself moves no funds. One zero-amount row per
 * affected service so the wallet can render an "Evicted from staking"
 * entry; any follow-up reward/refund transfers fire as their own events.
 */
export async function handleServicesEvicted(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceIds: readonly bigint[]; multisigs: readonly string[]; epoch: bigint }
): Promise<void> {
  for (let i = 0; i < e.serviceIds.length; i++) {
    const service = await getOrCreateService(ctx, e.serviceIds[i], meta);
    const multisig = i < e.multisigs.length ? e.multisigs[i] : ZERO_ADDRESS;
    await stakingRewardRow(
      ctx,
      meta,
      service,
      FundsCategory.SERVICE_EVICTED,
      0n,
      e.epoch,
      multisig,
      evictionRowId(meta.txHash, meta.logIndex, i)
    );
  }
}

// --- Transfers (ERC-20 + native) --------------------------------------

/**
 * Shared body for ERC-20 Transfer and Safe SafeReceived. `token` is null
 * for the native path.
 *
 * This is the hot path — it runs on every indexed transfer, ~133 per block
 * on Polygon — so the tracked-address lookups are served from the in-memory
 * index and the whole function exits at the first guard for the ~99.99% of
 * transfers that touch nothing of ours.
 */
async function handleTransfer(
  ctx: Ctx,
  meta: EventMeta,
  from: string,
  to: string,
  amount: bigint,
  token: string | null
): Promise<void> {
  const fromTracked = await ctx.cache.tracked(from);
  const toTracked = await ctx.cache.tracked(to);
  const fromIsSrtu = from === SRTU;
  const toIsSrtu = to === SRTU;

  if (fromTracked == null && toTracked == null && !fromIsSrtu && !toIsSrtu) {
    return; // not ours — the overwhelming majority
  }

  // Only load the MasterSafe when the setup-transfer gate can actually
  // fire; this branch runs on every ordinary deposit otherwise.
  let setupSeen = false;
  if (toTracked?.role === ROLE_MASTER && fromTracked?.role === ROLE_MASTER_EOA) {
    const ms = await ctx.cache.get(MasterSafe, toTracked.id);
    setupSeen = ms?.setupTransferSeen ?? true;
  }

  const c = classifyTransfer({
    fromTracked,
    toTracked,
    fromIsSrtu,
    toIsSrtu,
    fromIsServiceRegistry: from === SERVICE_REGISTRY_L2,
    toMasterSetupTransferSeen: setupSeen,
  });
  if (c == null) return;

  // OLAS Agent Safe -> Master Safe gets its own category so the wallet can
  // exclude it at query time instead of fetch-then-filter. These dominate
  // the ledger (staking-reward sweeps) and are not user actions. We do NOT
  // try to tell a reward sweep from a manual OLAS return — both bucket
  // here. The token is not visible inside classifyTransfer, so the split
  // happens here.
  let category = c.category;
  if (category === FundsCategory.AGENT_TO_MASTER && token === OLAS) {
    category = FundsCategory.AGENT_OLAS_TO_MASTER;
  }

  const row = new FundsMovement({
    id: eventId(meta.txHash, meta.logIndex),
    service: c.serviceId ? new Service({ id: c.serviceId }) : null,
    masterSafe: c.masterSafeId ? new MasterSafe({ id: c.masterSafeId }) : null,
    agentSafe: c.agentSafeId ? new AgentSafe({ id: c.agentSafeId }) : null,
    stakingContract: null,
    epoch: null,
    category,
    source: FundsSource.RAW_TRANSFER,
    agentFundingEvent: null,
    token,
    amount,
    from,
    to,
    blockNumber: meta.blockNumber,
    blockTimestamp: meta.blockTimestamp,
    transactionHash: meta.txHash,
  });

  // SAFE_SETUP_TRANSFER -> flip the flag so subsequent hops are
  // MASTER_FUNDING_IN.
  if (category === FundsCategory.SAFE_SETUP_TRANSFER && c.masterSafeId) {
    const ms = await ctx.cache.get(MasterSafe, c.masterSafeId);
    if (ms != null && !ms.setupTransferSeen) {
      ms.setupTransferSeen = true;
      ctx.cache.set(MasterSafe, ms);
    }
  }

  // MASTER_TO_AGENT -> group under an AgentFundingEvent so the wallet can
  // render one row per funding action across tokens.
  if (
    category === FundsCategory.MASTER_TO_AGENT &&
    c.masterSafeId != null &&
    c.serviceId != null
  ) {
    const afeId = agentFundingEventId(meta.txHash, c.masterSafeId, c.serviceId);
    let afe = await ctx.cache.get(AgentFundingEvent, afeId);
    if (afe == null) {
      afe = new AgentFundingEvent({
        id: afeId,
        service: new Service({ id: c.serviceId }),
        masterSafe: new MasterSafe({ id: c.masterSafeId }),
        txHash: meta.txHash,
        blockTimestamp: meta.blockTimestamp,
        totalNativeAmount: 0n,
        totalOlasAmount: 0n,
      });
    }
    // totalOlasAmount is OLAS-only and totalNativeAmount native-only, so a
    // same-tx OLAS + stablecoin funding never sums mixed-decimal raw units
    // into one number. Non-OLAS ERC-20 legs still link via `transfers`.
    if (token === null) afe.totalNativeAmount += amount;
    else if (token === OLAS) afe.totalOlasAmount += amount;
    ctx.cache.set(AgentFundingEvent, afe);
    row.agentFundingEvent = afe;
  }

  ctx.cache.set(FundsMovement, row);

  // --- TokenBalance. Native (token === null) has no Token entity, so
  // balances are ERC-20 only, as in the subgraph.
  if (token === null) return;

  const credits: FundsCategory[] = [
    FundsCategory.SAFE_SETUP_TRANSFER,
    FundsCategory.MASTER_FUNDING_IN,
    FundsCategory.AGENT_TO_MASTER,
    FundsCategory.AGENT_OLAS_TO_MASTER,
    FundsCategory.APP_TO_AGENT,
    FundsCategory.STAKING_REWARD_CLAIM,
  ];
  const debits: FundsCategory[] = [
    FundsCategory.MASTER_WITHDRAWAL,
    FundsCategory.MASTER_TO_AGENT,
    FundsCategory.AGENT_TO_APP,
    FundsCategory.AGENT_TO_MASTER,
    FundsCategory.AGENT_OLAS_TO_MASTER,
  ];
  if (credits.includes(category)) {
    await upsertTokenBalance(ctx, to, token, amount, meta, true);
  }
  if (debits.includes(category)) {
    await upsertTokenBalance(ctx, from, token, -amount, meta, true);
  }
  // MASTER_TO_AGENT moves both sides.
  if (category === FundsCategory.MASTER_TO_AGENT) {
    await upsertTokenBalance(ctx, to, token, amount, meta, true);
  }
  // Master Safe -> Master Safe: credited above as MASTER_FUNDING_IN for the
  // recipient; debit the sender too.
  if (c.senderMasterId != null) {
    await upsertTokenBalance(ctx, from, token, -amount, meta, true);
  }
}

export async function handleErc20Transfer(
  ctx: Ctx,
  meta: EventMeta,
  e: { from: string; to: string; value: bigint }
): Promise<void> {
  await handleTransfer(ctx, meta, e.from, e.to, e.value, meta.address);
}

/** Native inbound. Fires for any plain native transfer landing on a Safe. */
export async function handleSafeReceived(
  ctx: Ctx,
  meta: EventMeta,
  e: { sender: string; value: bigint }
): Promise<void> {
  await handleTransfer(ctx, meta, e.sender, meta.address, e.value, null);
}

// --- Safe owner upkeep ------------------------------------------------
//
// Only Master Safes are updated; Agent Safe owner lists are out of scope
// (their signers are indexed via Service.operators).

export async function handleSafeAddedOwner(
  ctx: Ctx,
  meta: EventMeta,
  e: { owner: string }
): Promise<void> {
  const ms = await ctx.cache.get(MasterSafe, meta.address);
  if (ms == null) return;
  if (ms.owners.includes(e.owner)) return;
  ms.owners = [...ms.owners, e.owner];
  ms.lastActivityTimestamp = meta.blockTimestamp;
  ctx.cache.set(MasterSafe, ms);
}

export async function handleSafeRemovedOwner(
  ctx: Ctx,
  meta: EventMeta,
  e: { owner: string }
): Promise<void> {
  const ms = await ctx.cache.get(MasterSafe, meta.address);
  if (ms == null) return;
  ms.owners = ms.owners.filter((o) => o !== e.owner);
  // If the removed owner was masterEoa (owners[0]), promote the next
  // signer. Pearl's onboarding makes the Master EOA owners[0] and does not
  // rotate it in normal operation, so this is defensive.
  if (ms.owners.length > 0 && ms.masterEoa === e.owner) {
    ms.masterEoa = ms.owners[0];
  }
  ms.lastActivityTimestamp = meta.blockTimestamp;
  ctx.cache.set(MasterSafe, ms);
}

export async function handleSafeChangedThreshold(
  ctx: Ctx,
  meta: EventMeta,
  e: { threshold: bigint }
): Promise<void> {
  const ms = await ctx.cache.get(MasterSafe, meta.address);
  if (ms == null) return;
  ms.threshold = e.threshold;
  ms.lastActivityTimestamp = meta.blockTimestamp;
  ctx.cache.set(MasterSafe, ms);
}

// --- IndexerStatus ----------------------------------------------------

/**
 * Written once per batch. Replaces the Graph's `_meta { block { number
 * timestamp } }`, which OpenReader has no equivalent for — Subsquid exposes
 * only `squidStatus { height }`, a block number with no timestamp, and
 * Pearl's computeIsDataDelayed needs the timestamp.
 */
export function writeIndexerStatus(
  ctx: Ctx,
  blockNumber: bigint,
  blockTimestamp: bigint
): void {
  ctx.cache.set(
    IndexerStatus,
    new IndexerStatus({
      id: INDEXER_STATUS_ID,
      blockNumber,
      blockTimestamp,
    })
  );
}
