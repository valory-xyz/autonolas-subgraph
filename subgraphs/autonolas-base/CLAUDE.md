# Autonolas Registry Subgraph (Base)

A GraphQL API for indexing the Autonolas service registry on Base network. Tracks service lifecycle, agent instances, multisig associations, and daily native-ETH receipt activity (`SafeReceived`) for services with agent ID 41.

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
└── package.json            # graph-cli 0.64.0, graph-ts 0.29.1, matchstick-as 0.6.0
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
Same as the [autonolas subgraph](../autonolas/CLAUDE.md#unit) — stores metadata for registered services.

### Service
Tracks service state and configuration. Same fields as [autonolas](../autonolas/CLAUDE.md#service).

### Multisig (Immutable)
Links Gnosis Safe multisigs to their services. **Only created for services with agent ID 41.**

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Multisig address |
| service | `Service!` | Reference to Service entity |

### DailyActivity
Aggregates `SafeReceived` (bare native-ETH receipt) activity per UTC day — see business rule 3 for what "activity" means here.

| Field | Type | Notes |
|-------|------|-------|
| id | `String!` | `day-{dayTimestamp}` |
| dayTimestamp | `BigInt!` | Unix timestamp normalized to day boundary (÷86400 × 86400) |
| count | `Int!` | Number of unique services with SafeReceived events that day |
| services | `[String!]!` | Byte-hex Service entity IDs (e.g. `"0x2c"`), **not** numeric serviceIds — see Entity ID Encoding |

### Entity ID Encoding

- `Service.id = Bytes.fromBigInt(serviceId)` — BigInt's **little-endian** bytes (serviceId 1 → `0x01`, 258 → `0x0201`).
- `Unit.id = ServiceTypePrefix ++ those bytes`. Gotcha: `ServiceTypePrefix = Bytes.fromHexString("sr")`, and `"sr"` is not valid hex — graph-ts parses it to a single `0x00` byte, **not** ASCII `0x7372`. Verified against production: serviceId 1 → Unit id `0x0001`, Service id `0x01`.
- `DailyActivity.services` entries are `multisig.service.toHexString()` — i.e. these byte-hex Service IDs. Join them to `Service.id` directly; do not hand-build IDs from numeric serviceIds using ASCII/big-endian assumptions.

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
2. **SafeReceived Eligibility**: Three conditions must all be met: service deployed (state 4), multisig is current, service has agent 41. The guards read the **stored** Service entity, which reflects on-chain state as of the *last ServiceRegistryL2 event* for that service — not necessarily the state at the SafeReceived block.
3. **What "activity" means**: the GnosisSafe template subscribes only to `SafeReceived`, which a Safe emits from its `receive()` fallback — a plain native-ETH transfer with empty calldata sent **to** the multisig. It does not fire on `execTransaction` (the agent's own outgoing transactions), module executions, ERC-20 transfers, or calls carrying data. `DailyActivity.count` is therefore "distinct eligible services whose multisig received a bare ETH transfer that UTC day" — a funding/top-up proxy, not an executed-transaction metric. For executed-transaction counts on Base, use the service-registry subgraph (`ExecutionSuccess`/`ExecutionFromModuleSuccess`).
4. **Daily Deduplication**: Each service only increments DailyActivity.count once per day. DailyActivity is append-only: once counted for a day, a service stays counted even if it terminates or changes multisig later that day — counts are monotone within a day and never retroactively adjusted.
5. **Agent-41 gate timing and permanence**: the check in `handleCreateMultisigWithAgents` runs against fresh on-chain state at that event's block (`handleServiceUpdate` runs first). Outcomes are permanent in both directions: (a) if the service lacked agent 41 at that moment, no GnosisSafe template is instantiated — that safe's SafeReceived events go unindexed even if agent 41 is added later; indexing only starts if a **new** `CreateMultisigWithAgents` event fires for the address, and dynamic data sources index from their creation block forward, so events before that are never backfilled; (b) `Multisig` is immutable and the handler early-returns for known addresses, so a safe address reused across services stays linked to the **first** agent-41 service forever. In the reuse case, SafeReceived events are attributed to the original service and then usually dropped by the current-multisig guard — the newer service's activity is silently uncounted.
6. **Service State from Contract**: `handleServiceUpdate()` always fetches fresh on-chain state via `getService()` and `getAgentInstances()`.
7. **IPFS Metadata**: Same resolution pattern as the [autonolas subgraph](../autonolas/CLAUDE.md#ipfs-metadata-resolution), but note it sits on the indexing critical path: every registry event except `Transfer` synchronously re-fetches service metadata inside `updateServiceState` (Create/Update fetch twice — once for the Unit, once for the Service), and 2-part package names trigger up to 4 extra `ipfs.cat` probes (`tryGetPackageType`). A failed fetch saves sentinels (`publicId`/`packageHash`/`description`/`image` = `"n/a"`, `packageType` = `"unknown"`) that are only repaired by the *next* event for that service — there is no retry mechanism. Consumers should treat `"n/a"` as "metadata fetch failed at last index time", not "absent on-chain". (`getMetadata` never returns null — it returns a `MetadataNotFound` sentinel — so the null-check else-branches in `storeUnit`/`updateServiceState` are dead code.)
8. **Dynamic Template**: GnosisSafe template instantiated per multisig address on `CreateMultisigWithAgents`.

---

## Failure Modes & Deployment Status

- **Unguarded eth_calls**: `getService`, `getAgentInstances`, and `tokenURI` in `updateServiceState`, plus the `tokenURI`/`ownerOf` calls in `handleCreateService`/`handleUpdateService`, are direct calls (not `try_`-wrapped) — any revert is a deterministic fatal error that permanently fails the deployment. Only the `ownerOf` inside `updateServiceState` uses `try_`.
- **Force-cast IPFS JSON**: `getMetadata` casts `code_uri` and `name` with `as JSONValue` before calling `.toString()` — metadata missing either key (or a non-object JSON root) traps the handler.
- **Force-cast loads in safe.ts**: `handleSafeReceived` non-null-casts `Multisig.load()`/`Service.load()`. This is safe only while GnosisSafe templates are created exclusively in `handleCreateMultisigWithAgents` *after* the Multisig entity is saved — preserve that invariant.
- **Known state (as of 2026-07)**: the self-hosted deployment at `subgraph.autonolas.tech/subgraphs/name/autonolas-base` is failed (`indexing_error`, stalled around block 42.0M) and serves a schema *without* Multisig/DailyActivity — it predates the agent-41 code in this repo. Any redeploy re-indexes from block 10,827,670 and will re-hit whatever event caused the halt unless the fragile calls above are guarded first.

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

**Framework**: Matchstick v0.6.0 (matchstick-as)

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
```

> **Note**: The `yarn deploy-base` script is broken — it references a nonexistent `profiles/l2/subgraph.base.yaml` manifest (the only manifest is `./subgraph.yaml`). Production deployments go through the GitHub Actions deploy workflow described in the root [CLAUDE.md](../../CLAUDE.md). Also, `package.json`'s `name` and the `create-local`/`deploy-local` slug are `autonolas` — identical to `subgraphs/autonolas` — so the two subgraphs collide on a shared local graph-node.
