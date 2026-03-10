# Service Registry Subgraph

A GraphQL API for tracking the lifecycle of Olas services, agent registration, multisig deployments, and daily transaction activity metrics. Indexes ServiceRegistryL2 events and GnosisSafe transactions.

> **User-facing guide**: See [README.md](README.md) for quick start, common queries, and supported networks.

## Architecture Overview

### Directory Structure
```
subgraphs/service-registry/
├── schema.graphql              # GraphQL schema (14 entities)
├── subgraph.template.yaml      # Template manifest with variable substitution
├── subgraph.gnosis.yaml        # Gnosis manifest (specVersion 1.0.0, pruning: 300)
├── subgraph.mode-mainnet.yaml  # Mode manifest (specVersion 0.0.5)
├── networks.json               # Network-specific addresses and blocks (Mode only)
├── src/
│   ├── mapping.ts              # L2 event handlers (ServiceRegistryL2 + GnosisSafe)
│   ├── mapping-eth.ts          # Mainnet event handlers (ServiceRegistry ABI)
│   └── utils.ts                # Entity getters, daily aggregation, deduplication
└── package.json                # graph-cli ^0.97.0, graph-ts ^0.38.0
```

### Key Contracts

| Network | Contract | Address | Start Block |
|---------|----------|---------|-------------|
| Gnosis | ServiceRegistryL2 | `0x9338b5153AE39BB89f50468E608eD9d764B755fD` | 27,871,084 |
| Mode | ServiceRegistryL2 | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | 14,444,011 |

GnosisSafe contracts are indexed dynamically via templates when multisig addresses are discovered.

---

## Schema Reference

### Core Entities

#### Service (Mutable)
| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | serviceId (string) |
| multisig | `Bytes` | Current multisig address (nullable, cleared on termination) |
| agentIds | `[Int!]!` | Registered agent IDs (cleared on termination) |
| creationTimestamp | `BigInt!` | Service creation timestamp |
| configHash | `Bytes` | Service configuration hash (set on L2, not on mainnet) |
| creator | `Creator` | Set on multisig creation (via tx.from), cleared on termination |

#### Multisig (Mutable)
| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Multisig address |
| serviceId | `Int!` | Linked service (default: 0) |
| creator | `Bytes!` | Creator address (from tx.from) |
| creationTimestamp | `BigInt!` | Creation timestamp |
| txHash | `Bytes!` | Transaction hash of creation |
| agentIds | `[Int!]!` | Most-recently-registered agent only (see business rules) |

#### AgentRegistration (Mutable)
| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | `{serviceId}-{agentId}` |
| serviceId | `Int!` | |
| agentId | `Int!` | |
| registrationTimestamp | `BigInt!` | Updated on re-registration |

#### AgentPerformance (Mutable)
| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | agentId (string) |
| txCount | `BigInt!` | Total transactions across all activity |

#### Global (Singleton, id: `""`)
| Field | Type | Notes |
|-------|------|-------|
| txCount | `BigInt!` | Total transactions |
| lastUpdated | `BigInt!` | Last update timestamp |
| totalOperators | `Int!` | Unique operator addresses |

#### Creator (Mutable)
| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Creator address |
| services | `[Service!]!` | `@derivedFrom(field: "creator")` |

#### Operator (Mutable)
| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Operator address |

### Daily Aggregation Entities

| Entity | ID Format | Key Fields | Purpose |
|--------|-----------|------------|---------|
| DailyServiceActivity | `day-{dayTimestamp}-service-{serviceId}` | `service`, `dayTimestamp`, `agentIds` | Active agents per service per day |
| DailyUniqueAgents | `day-{dayTimestamp}` | `dayTimestamp`, `count`, `agents` (derived) | Unique active agents count per day |
| DailyUniqueAgent | `{dailyUniqueAgents.id}-{agent.id}` | `dailyUniqueAgents`, `agent` | Deduplication link |
| DailyAgentPerformance | `day-{dayTimestamp}-agent-{agentId}` | `dayTimestamp`, `agentId`, `txCount` (Int), `activeMultisigCount`, `multisigs` (derived) | Daily tx count + active multisig count per agent |
| DailyAgentMultisig | `{dailyAgentPerformance.id}-{multisig.address}` | `dailyAgentPerformance`, `multisig` | Deduplication link |
| DailyActiveMultisigs | `day-{dayTimestamp}` | `dayTimestamp`, `count`, `multisigs` (derived) | Active multisig count per day |
| DailyActiveMultisig | `{dailyActiveMultisigs.id}-{multisig.address}` | `dailyActiveMultisigs`, `multisig` | Deduplication link |

---

## Event Handlers

### ServiceRegistryL2 (mapping.ts)

| Event | Handler | Key Logic |
|-------|---------|-----------|
| `CreateService` | `handleCreateService` | Creates Service with configHash, empty agentIds, creationTimestamp |
| `RegisterInstance` | `handleRegisterInstance` | Creates/updates AgentRegistration; adds agentId to Service.agentIds (dedup check); tracks Operator uniqueness in Global |
| `CreateMultisigWithAgents` | `handleCreateMultisig` | Creates Multisig entity; sets Service.creator via tx.from; links Service → Multisig address; uses `getMostRecentAgentId()` to store only most-recently-registered agent in multisig.agentIds; stores txHash; instantiates GnosisSafe template |
| `TerminateService` | `handleTerminateService` | Clears service.agentIds, multisig, and creator |

### ServiceRegistry (mapping-eth.ts)

Same handlers as mapping.ts with two differences:
- Imports from `ServiceRegistry` ABI instead of `ServiceRegistryL2`
- `handleCreateService` does NOT set `configHash` (only calls `getOrCreateService`)

### GnosisSafe Template (mapping.ts / mapping-eth.ts)

| Event | Handler | Key Logic |
|-------|---------|-----------|
| `ExecutionSuccess` | `handleExecutionSuccess` | For each agent in multisig.agentIds: updates daily agent performance (txCount + multisig dedup), daily unique agents, daily service activity, daily active multisigs, and global metrics |
| `ExecutionFromModuleSuccess` | `handleExecutionFromModuleSuccess` | Identical logic to ExecutionSuccess |

---

## Utility Functions (utils.ts)

### Entity Getters/Creators
| Function | Purpose |
|----------|---------|
| `getOrCreateService(serviceId, timestamp?)` | Creates Service with empty agentIds, default timestamp 0 |
| `getOrCreateMultisig(address, event)` | Creates Multisig with creator from tx.from, txHash, default serviceId 0 |
| `getOrCreateAgentPerformance(agentId)` | Gets/creates per-agent global stats (txCount: BigInt) |
| `getOrCreateOperator(address)` | Creates Operator entity |
| `getOrCreateServiceCreator(address)` | Creates Creator entity |
| `getGlobal()` | Gets/creates singleton Global entity (id: `""`) |

### Daily Aggregation Getters
| Function | Purpose |
|----------|---------|
| `getOrCreateDailyServiceActivity(serviceId, event)` | Creates with composite ID |
| `getOrCreateDailyUniqueAgents(event)` | Creates with `day-{timestamp}` ID |
| `getOrCreateDailyAgentPerformance(event, agentId)` | Creates with `day-{timestamp}-agent-{agentId}` ID |
| `getOrCreateDailyActiveMultisigs(event)` | Creates with `day-{timestamp}` ID |

### Daily Deduplication Creators
| Function | Purpose |
|----------|---------|
| `createDailyUniqueAgent(dailyUniqueAgents, agent)` | Links agent to day; increments count only on first link |
| `createDailyAgentMultisig(dailyAgentPerformance, multisig)` | Links multisig to agent per day; increments activeMultisigCount |
| `createDailyActiveMultisig(dailyActiveMultisigs, multisig)` | Links multisig to day; increments count |

### Helpers
| Function | Purpose |
|----------|---------|
| `getDayTimestamp(event)` | Normalizes timestamp to UTC day boundary (`timestamp / 86400 * 86400`) |
| `createOrUpdateAgentRegistration(serviceId, agentId, timestamp)` | Creates/updates registration with timestamp |
| `getMostRecentAgentId(serviceId, agentIds, deploymentTimestamp)` | Finds agent registered most recently before multisig deployment by iterating service's agentIds |
| `updateUniqueOperators(address)` | Creates Operator if new; increments Global.totalOperators |

---

## Key Business Rules

1. **Most-Recent-Agent Selection**: When creating a multisig, only the most-recently-registered agent (by `registrationTimestamp`) is stored in `multisig.agentIds`. Falls back to all service agents if no matching registration found. This prevents double-counting in analytics.
2. **Daily Deduplication**: All daily aggregations check for existing entities before incrementing counts. Uses composite IDs for uniqueness.
3. **Day Boundaries**: Timestamps normalized to UTC day: `timestamp / 86400 * 86400`.
4. **Creator Set at Multisig Time**: `Service.creator` is set via `transaction.from` when multisig is created, not when service is created.
5. **Service Termination Clears State**: Terminating a service clears agentIds, multisig, and creator.
6. **Operator Uniqueness**: First-time operator registration increments `Global.totalOperators`.
7. **Template Instantiation**: GnosisSafe template instantiated per multisig to track ExecutionSuccess events.
8. **Pruning**: Set to 300 blocks in Gnosis manifest for storage optimization (not set for Mode).
9. **Mainnet vs L2 Difference**: `mapping-eth.ts` does not set `configHash` on service creation; `mapping.ts` does.
10. **Agent ID Validation**: `updateDailyAgentPerformance` includes a safety check that entity.agentId matches expected agentId to prevent cross-agent data corruption.

---

## Configuration

### Template-Based Manifests
`subgraph.template.yaml` uses `{{variable}}` placeholders substituted from `networks.json`:
- `{{ network }}`, `{{ ServiceRegistryL2.address }}`, `{{ ServiceRegistryL2.startBlock }}`

**Known issue**: The template hardcodes `network: mode-mainnet` on the GnosisSafe template (line 44) instead of using `{{ network }}`.

### networks.json
Currently only contains Mode network configuration. Gnosis config is hardcoded directly in `subgraph.gnosis.yaml`.

### Manifest Differences
| Property | Gnosis | Mode |
|----------|--------|------|
| specVersion | 1.0.0 | 0.0.5 |
| Pruning | 300 blocks | None |

### Entity List in Manifests
Manifests declare `Agent` and `GlobalMetrics` in their entity lists, but the actual schema uses `AgentPerformance` and `Global`. These names are informational only and don't affect compilation.

---

## Development Workflow

```bash
yarn install    # Install dependencies
yarn codegen    # Generate TypeScript from schema + ABIs (uses gnosis manifest)
yarn build      # Compile to WebAssembly (uses gnosis manifest)
yarn test       # Run tests (no test files currently exist)
```
