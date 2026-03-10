# Autonolas Registry Subgraph (Base)

A GraphQL API for indexing the Autonolas service registry on Base network. Tracks service lifecycle, agent instances, multisig associations, and Gnosis Safe transaction activity for services with agent ID 41.

> **User-facing guide**: See [README.md](README.md) for quick start, common queries, and deployment.

## Architecture Overview

### Directory Structure
```
subgraphs/autonolas-base/
├── schema.graphql          # GraphQL schema (Unit, Service, Multisig, DailyActivity)
├── subgraph.yaml           # Manifest: ServiceRegistryL2 + GnosisSafe template on Base
├── src/
│   ├── registryL2.ts       # Service registry event handlers + IPFS metadata
│   └── safe.ts             # GnosisSafe SafeReceived handler + daily activity
├── tests/
│   ├── component-registry.test.ts   # Placeholder test
│   └── component-registry-utils.ts  # Mock event factories
├── abis/
│   └── ServiceRegistryL2.json
└── package.json            # graph-cli 0.64.0, graph-ts 0.32.0, matchstick 0.5.0
```

### Manifest Details
- **specVersion**: 0.0.5
- **apiVersion**: 0.0.7
- **Features**: `fullTextSearch`, `ipfsOnEthereumContracts`

### Key Contracts (Base)

| Contract | Address | Start Block |
|----------|---------|-------------|
| ServiceRegistryL2 | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | 10,827,670 |
| GnosisSafe | Dynamic (per service multisig) | — |

### ABIs
- `./abis/ServiceRegistryL2.json` — local, used by ServiceRegistryL2 data source
- `../../abis/GnosisSafe.json` — from root `abis/` directory, used by both ServiceRegistryL2 data source and GnosisSafe template

---

## Schema Reference

### Unit
Same as the [autonolas subgraph](../autonolas/claude.md#unit) — stores metadata for registered services.

### Service
Tracks service state and configuration. Same fields as [autonolas](../autonolas/claude.md#service).

### Multisig (Immutable)
Links Gnosis Safe multisigs to their services. **Only created for services with agent ID 41.**

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Multisig address |
| service | `Service!` | Reference to Service entity |

### DailyActivity
Aggregates Gnosis Safe transaction activity per UTC day.

| Field | Type | Notes |
|-------|------|-------|
| id | `String!` | `day-{dayTimestamp}` |
| dayTimestamp | `BigInt!` | Unix timestamp normalized to day boundary (÷86400 × 86400) |
| count | `Int!` | Number of unique services with SafeReceived events that day |
| services | `[String!]!` | List of service IDs that had activity |

---

## Event Handlers

### ServiceRegistryL2 Handlers (registryL2.ts)

| Event | Handler | Logic |
|-------|---------|-------|
| `CreateService` | `handleCreateService` | Creates Unit + Service entities, fetches IPFS metadata |
| `UpdateService` | `handleUpdateService` | Updates Unit metadata, calls `handleServiceUpdate()` |
| `Transfer` | `handleServiceTransfer` | Updates owner in Unit and Service |
| `ActivateRegistration` | `handleActivateRegistration` | Refreshes service state |
| `RegisterInstance` | `handleRegisterInstance` | Refreshes service state (updates instances) |
| `DeployService` | `handleDeployService` | Refreshes service state |
| `TerminateService` | `handleTerminateService` | Refreshes service state |
| `OperatorUnbond` | `handleOperatorUnbond` | Refreshes service state |
| `CreateMultisigWithAgents` | `handleCreateMultisigWithAgents` | Creates Multisig entity **only if service has agent 41**; instantiates GnosisSafe template |

### GnosisSafe Handler (safe.ts)

| Event | Handler | Logic |
|-------|---------|-------|
| `SafeReceived` | `handleSafeReceived` | Records daily activity — only counts if: (1) service state == DEPLOYED (4), (2) multisig matches current service multisig, (3) service currently has agent 41. Deduplicates services per day. |

---

## Key Constants

```typescript
TARGET_AGENT_ID = BigInt.fromI32(41)   // Only services with agent 41 get Multisig tracking
DEPLOYED_STATE = BigInt.fromI32(4)     // Only count activity in Deployed state
ONE_DAY = BigInt.fromI32(86400)        // Seconds per day for daily aggregation
Base16HashPrefix = "f01701220"          // IPFS hash prefix conversion
```

---

## Key Business Rules

1. **Agent 41 Filter**: Multisig entities and daily activity tracking are **only** created for services that contain agent ID 41. This is hardcoded.
2. **SafeReceived Eligibility**: Three conditions must all be met: service deployed (state 4), multisig is current, service has agent 41.
3. **Daily Deduplication**: Each service only increments DailyActivity.count once per day.
4. **Service State from Contract**: `handleServiceUpdate()` always fetches fresh on-chain state via `getService()` and `getAgentInstances()`.
5. **IPFS Metadata**: Same resolution pattern as the [autonolas subgraph](../autonolas/claude.md#ipfs-metadata-resolution).
6. **Dynamic Template**: GnosisSafe template instantiated per multisig address on `CreateMultisigWithAgents`.

---

## Differences from Autonolas (Mainnet)

| Feature | autonolas (Mainnet) | autonolas-base (Base) |
|---------|--------------------|-----------------------|
| Network | Ethereum mainnet | Base L2 |
| Registries | Component + Agent + Service | Service only (ServiceRegistryL2) |
| Builder tracking | Yes (on component/agent mint) | No |
| Multisig tracking | No | Yes (agent 41 only) |
| Daily activity | No | Yes (SafeReceived events) |
| Global entity | totalBuilders, totalAgents, totalComponents, totalServices | Not present |

---

## Testing

**Framework**: Matchstick v0.5.0

**Warning**: Test files are auto-generated boilerplate and non-functional. The test imports `handleApproval` from `src/component-registry` (does not exist in this subgraph) and asserts on an `Approval` entity (not in schema). Mock event utilities in `component-registry-utils.ts` cover ComponentRegistry event types but are unused. Tests need to be rewritten against the actual handlers in `src/registryL2.ts` and `src/safe.ts`.

```bash
yarn test
```

---

## Development Workflow

```bash
yarn install        # Install dependencies
yarn codegen        # Generate TypeScript from schema + ABIs
yarn build          # Compile to WebAssembly
yarn test           # Run tests
yarn deploy-base    # Deploy to Studio
```
