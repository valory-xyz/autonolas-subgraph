// Event handlers, ported branch-for-branch from the subgraph's
// src/mapping.ts + src/utils.ts. Each takes the cache interface, plain
// EventMeta, and already-decoded params (addresses lowercased at the
// dispatch boundary in main.ts), so they run without a database or network
// in tests/handlers.test.ts.
import {
  AgentPerformance,
  AgentRegistration,
  Creator,
  DailyActiveMultisig,
  DailyActiveMultisigs,
  DailyAgentMultisig,
  DailyAgentPerformance,
  DailyServiceActivity,
  DailyUniqueAgent,
  DailyUniqueAgents,
  ERC8004Agent,
  ERC8004Metadata,
  Global,
  Multisig,
  Operator,
  Service,
} from "./model";
import { IEntityCache } from "./entityCache";
import {
  EventMeta,
  agentRegistrationId,
  bytesToUtf8,
  dailyActiveMultisigId,
  dailyActiveMultisigsId,
  dailyAgentMultisigId,
  dailyAgentPerformanceId,
  dailyServiceActivityId,
  dailyUniqueAgentId,
  dailyUniqueAgentsId,
  dayTimestamp,
  erc8004MetadataId,
  mostRecentAgentId,
  pushUnique,
} from "./logic";
import {
  ERC8004_ECOSYSTEM_KEY,
  ERC8004_ECOSYSTEM_VALUE,
  ERC8004_SERVICE_REGISTRY_KEY,
  GLOBAL_ID,
} from "./constants";

// --- get-or-create helpers (subgraph utils.ts) ------------------------

async function getOrCreateService(
  cache: IEntityCache,
  serviceId: string,
  creationTimestamp: bigint,
): Promise<Service> {
  let service = await cache.get(Service, serviceId);
  if (service == null) {
    service = new Service({
      id: serviceId,
      multisig: null,
      agentIds: [],
      creationTimestamp,
      configHash: null,
      creator: null,
      erc8004Agent: null,
    });
    cache.set(Service, service);
  }
  return service;
}

async function getGlobal(cache: IEntityCache): Promise<Global> {
  let g = await cache.get(Global, GLOBAL_ID);
  if (g == null) {
    g = new Global({
      id: GLOBAL_ID,
      txCount: 0n,
      lastUpdated: 0n,
      totalOperators: 0,
    });
    cache.set(Global, g);
  }
  return g;
}

async function getOrCreateAgentPerformance(
  cache: IEntityCache,
  agentId: number,
): Promise<AgentPerformance> {
  const id = String(agentId);
  let agent = await cache.get(AgentPerformance, id);
  if (agent == null) {
    agent = new AgentPerformance({ id, txCount: 0n });
    cache.set(AgentPerformance, agent);
  }
  return agent;
}

async function getOrCreateERC8004Agent(
  cache: IEntityCache,
  agentId: number,
): Promise<ERC8004Agent> {
  const id = String(agentId);
  let agent = await cache.get(ERC8004Agent, id);
  if (agent == null) {
    agent = new ERC8004Agent({ id, agentWallet: null });
    cache.set(ERC8004Agent, agent);
  }
  return agent;
}

async function getOrCreateERC8004Metadata(
  cache: IEntityCache,
  agent: ERC8004Agent,
  key: string,
): Promise<ERC8004Metadata> {
  const id = erc8004MetadataId(Number(agent.id), key);
  let m = await cache.get(ERC8004Metadata, id);
  if (m == null) {
    m = new ERC8004Metadata({ id, agent, key, value: null });
    cache.set(ERC8004Metadata, m);
  }
  return m;
}

async function updateUniqueOperators(
  cache: IEntityCache,
  operator: string,
): Promise<void> {
  const existed = await cache.get(Operator, operator);
  if (existed != null) return;
  cache.set(Operator, new Operator({ id: operator }));
  const g = await getGlobal(cache);
  g.totalOperators += 1;
  cache.set(Global, g);
}

// --- daily aggregates (subgraph mapping.ts update* helpers) -----------

async function updateDailyActivity(
  cache: IEntityCache,
  service: Service,
  meta: EventMeta,
  multisig: Multisig,
): Promise<void> {
  const day = dayTimestamp(meta.blockTimestamp);
  const id = dailyServiceActivityId(day, service.id);
  let row = await cache.get(DailyServiceActivity, id);
  if (row == null) {
    row = new DailyServiceActivity({
      id,
      service,
      dayTimestamp: day,
      agentIds: [],
    });
  }
  row.agentIds = [...multisig.agentIds];
  cache.set(DailyServiceActivity, row);
}

async function updateDailyUniqueAgents(
  cache: IEntityCache,
  meta: EventMeta,
  multisig: Multisig,
): Promise<void> {
  const day = dayTimestamp(meta.blockTimestamp);
  const dailyId = dailyUniqueAgentsId(day);
  let daily = await cache.get(DailyUniqueAgents, dailyId);
  if (daily == null) {
    daily = new DailyUniqueAgents({ id: dailyId, dayTimestamp: day, count: 0 });
    cache.set(DailyUniqueAgents, daily);
  }
  for (const agentId of multisig.agentIds) {
    const agent = await getOrCreateAgentPerformance(cache, agentId);
    const linkId = dailyUniqueAgentId(dailyId, agent.id);
    const existing = await cache.get(DailyUniqueAgent, linkId);
    if (existing != null) continue;
    cache.set(
      DailyUniqueAgent,
      new DailyUniqueAgent({ id: linkId, dailyUniqueAgents: daily, agent }),
    );
    daily.count += 1;
    cache.set(DailyUniqueAgents, daily);
  }
}

async function updateDailyAgentPerformance(
  cache: IEntityCache,
  meta: EventMeta,
  multisig: Multisig,
): Promise<void> {
  const day = dayTimestamp(meta.blockTimestamp);
  for (const agentId of multisig.agentIds) {
    const id = dailyAgentPerformanceId(day, agentId);
    let perf = await cache.get(DailyAgentPerformance, id);
    if (perf == null) {
      perf = new DailyAgentPerformance({
        id,
        dayTimestamp: day,
        agentId,
        txCount: 0,
        activeMultisigCount: 0,
      });
    }
    perf.txCount += 1;
    cache.set(DailyAgentPerformance, perf);

    const linkId = dailyAgentMultisigId(id, multisig.id);
    const link = await cache.get(DailyAgentMultisig, linkId);
    if (link == null) {
      cache.set(
        DailyAgentMultisig,
        new DailyAgentMultisig({
          id: linkId,
          dailyAgentPerformance: perf,
          multisig,
        }),
      );
      perf.activeMultisigCount += 1;
      cache.set(DailyAgentPerformance, perf);
    }

    const agent = await getOrCreateAgentPerformance(cache, agentId);
    agent.txCount += 1n;
    cache.set(AgentPerformance, agent);
  }
}

async function updateDailyActiveMultisigs(
  cache: IEntityCache,
  meta: EventMeta,
  multisig: Multisig,
): Promise<void> {
  const day = dayTimestamp(meta.blockTimestamp);
  const dailyId = dailyActiveMultisigsId(day);
  let daily = await cache.get(DailyActiveMultisigs, dailyId);
  if (daily == null) {
    daily = new DailyActiveMultisigs({ id: dailyId, dayTimestamp: day, count: 0 });
    cache.set(DailyActiveMultisigs, daily);
  }
  const linkId = dailyActiveMultisigId(dailyId, multisig.id);
  const link = await cache.get(DailyActiveMultisig, linkId);
  if (link != null) return;
  cache.set(
    DailyActiveMultisig,
    new DailyActiveMultisig({ id: linkId, dailyActiveMultisigs: daily, multisig }),
  );
  daily.count += 1;
  cache.set(DailyActiveMultisigs, daily);
}

async function updateGlobalMetrics(
  cache: IEntityCache,
  meta: EventMeta,
): Promise<void> {
  const g = await getGlobal(cache);
  g.txCount += 1n;
  g.lastUpdated = meta.blockTimestamp;
  cache.set(Global, g);
}

// --- ServiceRegistryL2 ------------------------------------------------

export async function handleCreateService(
  cache: IEntityCache,
  meta: EventMeta,
  p: { serviceId: bigint; configHash: string },
): Promise<void> {
  const service = await getOrCreateService(
    cache,
    p.serviceId.toString(),
    meta.blockTimestamp,
  );
  service.configHash = p.configHash;
  cache.set(Service, service);
}

export async function handleUpdateService(
  cache: IEntityCache,
  _meta: EventMeta,
  p: { serviceId: bigint; configHash: string },
): Promise<void> {
  const service = await cache.get(Service, p.serviceId.toString());
  if (service == null) return;
  service.configHash = p.configHash;
  cache.set(Service, service);
}

export async function handleRegisterInstance(
  cache: IEntityCache,
  meta: EventMeta,
  p: { operator: string; serviceId: bigint; agentId: bigint },
): Promise<void> {
  // Subgraph passes no timestamp here, so a service first seen at
  // registration gets creationTimestamp 0 — kept for parity.
  const service = await getOrCreateService(cache, p.serviceId.toString(), 0n);
  const serviceId = Number(p.serviceId);
  const agentId = Number(p.agentId);

  const regId = agentRegistrationId(serviceId, agentId);
  let reg = await cache.get(AgentRegistration, regId);
  if (reg == null) {
    reg = new AgentRegistration({ id: regId, serviceId, agentId, registrationTimestamp: 0n });
  }
  reg.serviceId = serviceId;
  reg.agentId = agentId;
  reg.registrationTimestamp = meta.blockTimestamp;
  cache.set(AgentRegistration, reg);

  service.agentIds = pushUnique(service.agentIds, agentId);
  cache.set(Service, service);

  await updateUniqueOperators(cache, p.operator);
}

export async function handleCreateMultisig(
  cache: IEntityCache,
  meta: EventMeta,
  p: { serviceId: bigint; multisig: string; txFrom: string },
): Promise<void> {
  const serviceId = p.serviceId.toString();
  const service = await cache.get(Service, serviceId);
  if (service == null) return;

  let creator = await cache.get(Creator, p.txFrom);
  if (creator == null) {
    creator = new Creator({ id: p.txFrom });
    cache.set(Creator, creator);
  }
  service.creator = creator;

  let multisig = await cache.get(Multisig, p.multisig);
  if (multisig == null) {
    multisig = new Multisig({
      id: p.multisig,
      creator: p.txFrom,
      creationTimestamp: meta.blockTimestamp,
      agentIds: [],
      serviceId: 0,
      txHash: meta.txHash,
    });
  }
  service.multisig = multisig.id;
  cache.set(Service, service);

  await cache.addKnownMultisig(p.multisig);

  multisig.serviceId = Number(p.serviceId);
  multisig.txHash = meta.txHash;

  // Most recently registered agent, not all agents — matches the SQL the
  // subgraph mirrors, to avoid double counting.
  const registrations = new Map<number, bigint>();
  for (const agentId of service.agentIds) {
    const reg = await cache.get(
      AgentRegistration,
      agentRegistrationId(Number(p.serviceId), agentId),
    );
    if (reg != null) registrations.set(agentId, reg.registrationTimestamp);
  }
  const recent = mostRecentAgentId(
    service.agentIds,
    (id) => registrations.get(id),
    meta.blockTimestamp,
  );
  if (recent !== -1) {
    multisig.agentIds = [recent];
  } else {
    cache.log.warn(
      `No recent agent found for service ${serviceId}, using all agents`,
    );
    multisig.agentIds = [...service.agentIds];
  }
  cache.set(Multisig, multisig);
}

export async function handleTerminateService(
  cache: IEntityCache,
  _meta: EventMeta,
  p: { serviceId: bigint },
): Promise<void> {
  const service = await cache.get(Service, p.serviceId.toString());
  if (service == null) return;
  service.agentIds = [];
  service.multisig = null;
  service.creator = null;
  cache.set(Service, service);
}

// --- GnosisSafe (any known service multisig) --------------------------

/**
 * Shared body of handleExecutionSuccess / handleExecutionFromModuleSuccess.
 * The dispatcher has already confirmed `address` is a known multisig.
 */
export async function handleSafeExecution(
  cache: IEntityCache,
  meta: EventMeta,
  p: { address: string },
): Promise<void> {
  const multisig = await cache.get(Multisig, p.address);
  if (multisig == null) {
    // The in-memory filter admitted an address the table does not have:
    // the only visible symptom of the two drifting (e.g. after a reorg).
    cache.log.warn(
      `Multisig ${p.address} passed the known-multisig filter but has no row at block ${meta.blockNumber}`,
    );
    return;
  }
  const service = await cache.get(Service, String(multisig.serviceId));
  if (service == null) {
    cache.log.warn(
      `Service ${multisig.serviceId} not found for multisig ${p.address}`,
    );
    return;
  }
  await updateDailyActivity(cache, service, meta, multisig);
  await updateDailyUniqueAgents(cache, meta, multisig);
  await updateDailyAgentPerformance(cache, meta, multisig);
  await updateDailyActiveMultisigs(cache, meta, multisig);
  await updateGlobalMetrics(cache, meta);
}

// --- IdentityRegistryBridger (ERC-8004) --------------------------------

export async function handleServiceAgentLinked(
  cache: IEntityCache,
  _meta: EventMeta,
  p: { serviceId: bigint; agentId: bigint },
): Promise<void> {
  const service = await cache.get(Service, p.serviceId.toString());
  if (service == null) {
    cache.log.warn(
      `Service ${p.serviceId} not found for ServiceAgentLinked event`,
    );
    return;
  }
  const agentId = Number(p.agentId);
  const agent = await getOrCreateERC8004Agent(cache, agentId);
  // Service.erc8004Agent is unique in the store; relinking an agent to
  // another service must release the old holder or the batch fails forever.
  const holder = await cache.findServiceByErc8004Agent(agent.id);
  if (holder != null && holder.id !== service.id) {
    cache.log.warn(
      `ERC-8004 agent ${agent.id} relinked from service ${holder.id} to ${service.id}`,
    );
    holder.erc8004Agent = null;
    cache.set(Service, holder);
  }
  service.erc8004Agent = agent;
  cache.set(Service, service);

  // Default metadata; overwritten if the matching MetadataSet fires.
  const eco = await getOrCreateERC8004Metadata(cache, agent, ERC8004_ECOSYSTEM_KEY);
  eco.value = ERC8004_ECOSYSTEM_VALUE;
  cache.set(ERC8004Metadata, eco);
  const reg = await getOrCreateERC8004Metadata(
    cache,
    agent,
    ERC8004_SERVICE_REGISTRY_KEY,
  );
  reg.value = p.serviceId.toString();
  cache.set(ERC8004Metadata, reg);
}

export async function handleAgentWalletSet(
  cache: IEntityCache,
  _meta: EventMeta,
  p: { agentId: bigint; multisig: string },
): Promise<void> {
  const agent = await getOrCreateERC8004Agent(cache, Number(p.agentId));
  agent.agentWallet = p.multisig;
  cache.set(ERC8004Agent, agent);
}

export async function handleMetadataSet(
  cache: IEntityCache,
  _meta: EventMeta,
  p: { agentId: bigint; metadataKey: string; metadataValue: string },
): Promise<void> {
  const agent = await getOrCreateERC8004Agent(cache, Number(p.agentId));
  const m = await getOrCreateERC8004Metadata(cache, agent, p.metadataKey);
  m.value = bytesToUtf8(p.metadataValue);
  cache.set(ERC8004Metadata, m);
}
