# Service Registry Subgraph

Tracks the lifecycle of Olas services on Gnosis and Mode: agent registration, multisig creation, service termination, ERC-8004 agent identity, and daily activity metrics.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Schema Reference](#schema-reference)
- [Event Handlers](#event-handlers)
- [Utility Functions](#utility-functions)
- [Multi-Network Pattern](#multi-network-pattern)
- [Key Business Rules](#key-business-rules)
- [Configuration](#configuration)
- [Development Workflow](#development-workflow)
- [Common Queries](#common-queries)

---

## Architecture Overview

### Directory Structure
```
subgraphs/service-registry/
├── schema.graphql
├── subgraph.template.yaml          # Template for per-network manifests
├── subgraph.gnosis.yaml            # Generated from template; includes IdentityRegistryBridger
├── subgraph.mode-mainnet.yaml      # Hand-maintained; no UpdateService or IdentityRegistryBridger
├── networks.json                   # Contract addresses & start blocks per network
├── src/
│   ├── mapping.ts                  # L2 handlers (imports ServiceRegistryL2)
│   ├── bridger.ts                  # IdentityRegistryBridger handlers (Gnosis only)
│   ├── mapping-eth.ts              # Mainnet handlers (scaffolding; no manifest currently wired)
│   └── utils.ts                    # Shared helpers & entity factories
└── package.json                    # graph-cli 0.98.1, graph-ts 0.38.2 (exact pins)
```

### Indexed Contracts

| Contract | Used On | Purpose |
|----------|---------|---------|
| `ServiceRegistry` | Mainnet | Core service management (different ABI, `CreateService` has 1 param) |
| `ServiceRegistryL2` | L2 networks | L2 service management (`CreateService` has 2 params: `serviceId` + `configHash`) |
| `IdentityRegistryBridger` | Gnosis only | ERC-8004 agent identity: links agents to services, sets wallets, manages metadata |
| `GnosisSafe` (template) | All networks | Dynamic — created per multisig to track `ExecutionSuccess` and `ExecutionFromModuleSuccess` |

### Mainnet vs L2 Differences

- **Mainnet** (`mapping-eth.ts`): Scaffolding that imports from the `ServiceRegistry` ABI. `CreateService` event has only `serviceId` (no `configHash`). No mainnet manifest currently exists, so these handlers are not wired to any deployment.
- **L2** (`mapping.ts`): Imports from `ServiceRegistryL2` ABI. `CreateService` event includes `configHash`. Uses generated manifests from `subgraph.template.yaml`.
- Both files share identical handler logic (copy-pasted) and import the same utils.

---

## Schema Reference

### Service
Represents an Olas service with its registered agents and multisig.

| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | Service ID (string) |
| multisig | `Bytes` | Nullable. Set on `CreateMultisigWithAgents`, cleared on `TerminateService` |
| agentIds | `[Int!]!` | Agent IDs registered to this service |
| creationTimestamp | `BigInt!` | Set on `CreateService` |
| configHash | `Bytes` | Nullable. L2 only — set on `CreateService` |
| creator | `Creator` | Nullable. Set on `CreateMultisigWithAgents` from `tx.from`, cleared on terminate |
| erc8004Agent | `ERC8004Agent` | Nullable. Set on `ServiceAgentLinked` |

### ERC8004Agent
Agent identity from the IdentityRegistryBridger contract.

| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | Agent ID (string) |
| service | `Service` | Nullable. `@derivedFrom(field: "erc8004Agent")` |
| agentWallet | `Bytes` | Nullable. Set on `AgentWalletSet` |
| metadata | `[ERC8004Metadata!]` | `@derivedFrom(field: "agent")` |

### ERC8004Metadata
Key-value metadata for ERC-8004 agents. Default entries (`ecosystem: "Olas"`, `serviceRegistry: <serviceId>`) are created on `ServiceAgentLinked`.

| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | `{agentId}-{metadataKey}` |
| agent | `ERC8004Agent!` | |
| key | `String!` | |
| value | `String` | Nullable |

### Multisig
Gnosis Safe wallet created for a service.

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Multisig address |
| serviceId | `Int!` | |
| creator | `Bytes!` | `tx.from` at multisig creation |
| creationTimestamp | `BigInt!` | |
| txHash | `Bytes!` | |
| agentIds | `[Int!]!` | **Most recently registered agent only** (not all agents) to prevent double counting |

### AgentRegistration
Records when an agent was registered to a service. Used to determine most recent agent at multisig creation.

| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | `{serviceId}-{agentId}` |
| serviceId | `Int!` | |
| agentId | `Int!` | |
| registrationTimestamp | `BigInt!` | Updated on each `RegisterInstance` |

### Creator
Service deployer address.

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Creator address |
| services | `[Service!]!` | `@derivedFrom(field: "creator")` |

### Operator
Unique operator addresses (tracked globally).

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Operator address |

### AgentPerformance
Cumulative transaction count per agent (all-time).

| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | Agent ID (string) |
| txCount | `BigInt!` | Total transactions across all multisigs |

### Global
Singleton aggregate statistics (id: `""`).

| Field | Type | Notes |
|-------|------|-------|
| txCount | `BigInt!` | Total multisig transactions |
| lastUpdated | `BigInt!` | Timestamp of last transaction |
| totalOperators | `Int!` | Unique operator count |

### Daily Aggregation Entities

**DailyServiceActivity** — Active agents per service per day.
- ID: `day-{dayTimestamp}-service-{serviceId}`
- Fields: `service`, `dayTimestamp`, `agentIds`

**DailyUniqueAgents** — Unique active agents across all services per day.
- ID: `day-{dayTimestamp}`
- Fields: `dayTimestamp`, `count`, `agents` (derived)
- Uses `DailyUniqueAgent` join entity for deduplication (each agent counted once per day)

**DailyAgentPerformance** — Per-agent daily transaction count and active multisig count.
- ID: `day-{dayTimestamp}-agent-{agentId}`
- Fields: `dayTimestamp`, `agentId`, `txCount`, `activeMultisigCount`, `multisigs` (derived)
- Uses `DailyAgentMultisig` join entity for deduplication

**DailyActiveMultisigs** — System-wide active multisig count per day.
- ID: `day-{dayTimestamp}`
- Fields: `dayTimestamp`, `count`, `multisigs` (derived)
- Uses `DailyActiveMultisig` join entity for deduplication

---

## Event Handlers

### 1. handleCreateService
**File**: `mapping.ts` / `mapping-eth.ts` | **Event**: `CreateService`

- Creates `Service` entity with empty `agentIds` and `creationTimestamp`
- L2 version also stores `configHash`; mainnet version does not

### 2. handleUpdateService
**File**: `mapping.ts` | **Event**: `UpdateService(indexed uint256, bytes32)` (Gnosis manifest and template only; absent from `subgraph.mode-mainnet.yaml`)

- Loads `Service`; if it exists, updates `configHash`

### 3. handleRegisterInstance
**Event**: `RegisterInstance(indexed address, indexed uint256, indexed address, uint256)`

- Loads or creates `Service`
- Creates `AgentRegistration` with timestamp (used later by `getMostRecentAgentId`)
- Adds agent ID to `service.agentIds` (deduplicates)
- Calls `updateUniqueOperators()` — creates `Operator` entity and increments `Global.totalOperators` on first seen

### 4. handleCreateMultisig
**Event**: `CreateMultisigWithAgents(indexed uint256, indexed address)`

- **Guard**: Service must already exist
- Creates `Creator` entity from `tx.from`, links to service
- Creates `Multisig` entity with creator, timestamp, txHash
- **Agent selection**: Uses `getMostRecentAgentId()` to pick only the most recently registered agent (prevents double counting in daily metrics). Falls back to all agents if none found.
- Creates `GnosisSafe` dynamic template for the new multisig address

### 5. handleTerminateService
**Event**: `TerminateService(indexed uint256)`

- Clears `service.agentIds`, `service.multisig`, and `service.creator`

### 6. handleExecutionSuccess / handleExecutionFromModuleSuccess
**Events**: `ExecutionSuccess(bytes32, uint256)` / `ExecutionFromModuleSuccess(indexed address)`

Both handlers have identical logic — triggered by GnosisSafe multisig transactions:
- **Guard**: Multisig and its associated Service must exist
- Updates all daily aggregation entities:
  - `DailyServiceActivity`: Records active agents for this service today
  - `DailyUniqueAgents`: Deduplicates agents active today (via join entity)
  - `DailyAgentPerformance`: Increments per-agent `txCount`, tracks active multisigs per agent (via join entity)
  - `DailyActiveMultisigs`: Deduplicates active multisigs today (via join entity)
- Increments `AgentPerformance.txCount` (cumulative per agent)
- Increments `Global.txCount` and updates `Global.lastUpdated`
- **Agent ID mismatch guard**: Validates `entity.agentId == agentId` in `updateDailyAgentPerformance` to prevent cross-agent contamination

### 7. handleServiceAgentLinked (IdentityRegistryBridger)
**Event**: `ServiceAgentLinked(indexed uint256, indexed uint256)`

- Links an ERC-8004 agent to a service
- Initializes default metadata: `ecosystem: "Olas"`, `serviceRegistry: {serviceId}`

### 8. handleAgentWalletSet (IdentityRegistryBridger)
**Event**: `AgentWalletSet(indexed uint256, indexed uint256, indexed address)`

- Sets `ERC8004Agent.agentWallet`

### 9. handleMetadataSet (IdentityRegistryBridger)
**Event**: `MetadataSet(indexed uint256, indexed uint256, string, bytes)`

- Creates/updates `ERC8004Metadata` with key-value pair

---

## Utility Functions

All in `src/utils.ts`:

| Function | Purpose |
|----------|---------|
| `getDayTimestamp(event)` | UTC midnight: `timestamp / 86400 * 86400` |
| `getOrCreateService(serviceId, timestamp?)` | Load-or-create Service |
| `getOrCreateMultisig(address, event)` | Load-or-create Multisig |
| `getOrCreateDailyServiceActivity(serviceId, event)` | Daily service activity |
| `getOrCreateDailyUniqueAgents(event)` | Daily unique agents counter |
| `getOrCreateDailyAgentPerformance(event, agentId)` | Daily per-agent performance |
| `getOrCreateDailyActiveMultisigs(event)` | Daily active multisigs counter |
| `getGlobal()` | Singleton Global (id: `""`) |
| `getOrCreateAgentPerformance(agentId)` | Cumulative agent performance |
| `getOrCreateOperator(address)` | Load-or-create Operator |
| `updateUniqueOperators(address)` | Create operator + increment `Global.totalOperators` on first seen |
| `getOrCreateServiceCreator(address)` | Load-or-create Creator |
| `createDailyUniqueAgent(dailyUniqueAgents, agent)` | Join entity — deduplicates agents per day, increments `count` |
| `createDailyAgentMultisig(dailyAgentPerformance, multisig)` | Join entity — tracks multisigs per agent per day, increments `activeMultisigCount` |
| `createDailyActiveMultisig(dailyActiveMultisigs, multisig)` | Join entity — deduplicates active multisigs per day, increments `count` |
| `createOrUpdateAgentRegistration(serviceId, agentId, timestamp)` | Records registration timestamp |
| `getMostRecentAgentId(serviceId, agentIds, deploymentTimestamp)` | Finds most recently registered agent before deployment (prevents double counting) |
| `getOrCreateERC8004Agent(agentId)` | Load-or-create ERC8004Agent |
| `getOrCreateERC8004Metadata(agentId, key)` | Load-or-create metadata entry |
| `initializeERC8004DefaultMetadata(agentId, serviceId)` | Sets `ecosystem: "Olas"` and `serviceRegistry: {serviceId}` |

---

## Multi-Network Pattern

Uses **template pattern**: `subgraph.template.yaml` + `networks.json` + `../../scripts/generate-manifests.ts` (repo-root script, run via `yarn generate-manifests`).

- The Gnosis manifest is generated from the template (Mustache syntax: `{{ ServiceRegistryL2.address }}`)
- Mode (`subgraph.mode-mainnet.yaml`) is hand-maintained — omits `UpdateService` and `IdentityRegistryBridger`
- Only the Gnosis manifest (and the template) include the `IdentityRegistryBridger` data source; `subgraph.mode-mainnet.yaml` omits it because the contract does not exist on Mode

> **Gotcha — `yarn generate-manifests` clobbers the Mode manifest.** The script regenerates `subgraph.{network}.yaml` for *every* network in `networks.json` from the template. The template hardcodes the `IdentityRegistryBridger` data source and the `UpdateService` handler, but `networks.json` has no bridger entry for `mode-mainnet`, so regeneration overwrites the hand-curated `subgraph.mode-mainnet.yaml` with literal unreplaced `{{ IdentityRegistryBridger.address }}` / `{{ IdentityRegistryBridger.startBlock }}` placeholders that fail `graph build`. After regenerating (e.g. for a Gnosis address change), restore it: `git checkout -- subgraph.mode-mainnet.yaml`.

### Per-Network Consequences

- On Mode, `Service.erc8004Agent` and all `ERC8004*` entities are always empty (no bridger contract), and `Service.configHash` is frozen at its `CreateService` value (no `UpdateService` handler) — both structural, not data gaps.
- **Compilation constraint**: the bridger handlers must stay in `src/bridger.ts`, separate from `mapping.ts`. A manifest that doesn't declare the `IdentityRegistryBridger` data source never produces `generated/IdentityRegistryBridger`, so any mapping file importing it would break codegen/build for Mode.

### Supported Networks

| Network | Contract | Manifest |
|---------|----------|----------|
| Gnosis | `ServiceRegistryL2` 0x9338b5153AE39BB89f50468E608eD9d764B755fD | `subgraph.gnosis.yaml` |
| Mode | `ServiceRegistryL2` 0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE | `subgraph.mode-mainnet.yaml` |

---

## Key Business Rules

1. **Most Recent Agent Selection**: At multisig creation, only the most recently registered agent is assigned to the multisig (via `getMostRecentAgentId`). This prevents double-counting in daily metrics when a service has multiple agents. Fine print:
   - **Ties**: `getMostRecentAgentId` compares with strict `>` while iterating `service.agentIds` in registration order — when several agents share a registration timestamp (the common single-tx multi-agent registration), the *first* agent in registration order wins, not a well-defined "most recent" one.
   - **Re-registration overwrite**: `AgentRegistration` (id `{serviceId}-{agentId}`) has its `registrationTimestamp` overwritten on every `RegisterInstance`, so attribution at the next multisig creation reflects the latest re-registration, not the original.
   - **Fallback multi-attribution**: if no registration predates the deployment timestamp, the multisig keeps *all* service agents, and each safe transaction then increments every agent's `AgentPerformance`/`DailyAgentPerformance.txCount` while `Global.txCount` increments once per event. Consequence: `sum(AgentPerformance.txCount) >= Global.txCount` — do not treat them as reconcilable.
   - **Snapshot semantics**: `DailyServiceActivity.agentIds` is assigned (not merged) from `multisig.agentIds` on each execution — a last-write snapshot of the multisig's attribution set, not a union of agents active that day.
2. **Daily Deduplication**: All daily entities use join entities (`DailyUniqueAgent`, `DailyAgentMultisig`, `DailyActiveMultisig`) with load-or-create pattern to ensure each item is counted exactly once per day.
3. **Service Termination Clears State — but does not stop counting**: `TerminateService` resets `agentIds`, `multisig`, and `creator` to empty/null. The `Multisig` entity is not deleted and its GnosisSafe data source keeps indexing: subsequent safe transactions still increment `Global.txCount` and all daily/agent metrics, attributed to the `agentIds` captured at multisig creation.
4. **GnosisSafe Dynamic Template**: Created on `CreateMultisigWithAgents`. Both `ExecutionSuccess` and `ExecutionFromModuleSuccess` trigger identical daily metric updates. **Redeploy double-count caveat**: `handleCreateMultisig` calls `GnosisSafeTemplate.create()` unconditionally and graph-node does not deduplicate dynamic data sources — if a terminated service is redeployed reusing the same safe address (the standard Olas redeploy flow), each subsequent execution event is handled once per creation, inflating txCount-style metrics by the redeploy count. The reused `Multisig` entity's `serviceId`/`agentIds`/`txHash` are also overwritten at redeploy (`creator`/`creationTimestamp` keep their first-creation values), so historical `DailyAgentMultisig`/`DailyActiveMultisig` rows dereference the multisig's *new* attribution — treat per-multisig history as current-state-joined, not point-in-time.
5. **Operator Tracking**: Each unique operator address (from `RegisterInstance`) increments `Global.totalOperators` exactly once.
6. **ERC-8004 Identity**: `IdentityRegistryBridger` events manage agent identity (wallet, metadata) independently from service registration. Default metadata (`ecosystem`, `serviceRegistry`) is auto-initialized on `ServiceAgentLinked`.

### ERC-8004 Caveats

- **Ordering dependency**: `handleServiceAgentLinked` requires the `Service` entity to already exist (created by the registry data source). If it doesn't, the link is dropped with a `log.warning` and never retried — `Service.erc8004Agent` stays null even if the service appears later.
- **Default-metadata clobber**: every `ServiceAgentLinked` unconditionally (re)writes `ecosystem = "Olas"` and `serviceRegistry = <serviceId>`. A `MetadataSet` for those keys that lands before the link event (or before a re-link to a different service) is overwritten — last writer wins in event order.
- **Orphans and dangling references**: `AgentWalletSet` creates the `ERC8004Agent` with no service link — `ERC8004Agent.service` being null is not bad data. `MetadataSet` creates the `ERC8004Metadata` row but does *not* create the agent entity, so metadata can reference an `ERC8004Agent` that doesn't exist yet.
- **Byte decoding**: `metadataValue` is raw bytes stored via `.toString()` (UTF-8 decode); non-UTF-8 payloads are stored as garbled text, not hex.
- **ID spaces**: `ERC8004Agent.id` is the identity-registry agent ID — a different ID space from the Olas agent-type IDs used in `Service.agentIds` / `AgentPerformance.id`. Never join them.

---

## Configuration

### Data Sources

| Data Source | Events | Handler File |
|-------------|--------|--------------|
| ServiceRegistryL2 | `CreateService(indexed uint256, bytes32)`, `UpdateService(indexed uint256, bytes32)` (Gnosis only — absent from `subgraph.mode-mainnet.yaml`), `CreateMultisigWithAgents`, `RegisterInstance`, `TerminateService` | `mapping.ts` |
| IdentityRegistryBridger (Gnosis only) | `ServiceAgentLinked`, `AgentWalletSet`, `MetadataSet` | `bridger.ts` |

### Dynamic Template

| Template | Events | Handler File |
|----------|--------|--------------|
| GnosisSafe | `ExecutionSuccess(bytes32, uint256)`, `ExecutionFromModuleSuccess(indexed address)` | `mapping.ts` |

**Spec**: v0.0.5 | **API**: 0.0.6

---

## Development Workflow

```bash
yarn install                        # Install dependencies
yarn codegen                        # Generate TS types (defaults to gnosis)
yarn build                          # Build (defaults to gnosis)
yarn generate-manifests             # Regenerate manifests from template — clobbers subgraph.mode-mainnet.yaml (see gotcha in Multi-Network Pattern)
yarn test                           # Matchstick runner (declared, but no tests/ directory exists yet)
```

Deploy per-network:
```bash
yarn deploy-gnosis
yarn deploy-mode
```

Production deployments go through the GitHub Actions workflow (see the root CLAUDE.md).

---

## Common Queries

### Daily Active Agents per Agent ID
```graphql
{
  dailyAgentPerformances(
    where: { agentId: 40, dayTimestamp_gte: "1672531200" }
    orderBy: dayTimestamp
    orderDirection: desc
  ) {
    dayTimestamp
    activeMultisigCount
  }
}
```

### Daily Active Multisigs (System-Wide)
```graphql
{
  dailyActiveMultisigs(
    orderBy: dayTimestamp
    orderDirection: desc
    where: { dayTimestamp_gte: "1672531200" }
  ) {
    dayTimestamp
    count
  }
}
```

### Total Transactions per Agent
```graphql
{
  agentPerformances(orderBy: txCount, orderDirection: desc) {
    id
    txCount
  }
}
```

### Global Statistics
```graphql
{
  global(id: "") {
    txCount
    totalOperators
  }
}
```
