# Autonolas Registry Subgraph (Ethereum Mainnet)

A GraphQL API for indexing the Autonolas component, agent, and service registries on Ethereum mainnet. Tracks creation, updates, ownership transfers, and IPFS metadata resolution for all registered units.

> **User-facing guide**: See [README.md](README.md) for quick start, common queries, and deployment.

## Architecture Overview

### Directory Structure
```
subgraphs/autonolas/
├── schema.graphql          # GraphQL schema (Unit, Service, Global, Builder)
├── subgraph.yaml           # Manifest: 3 data sources on mainnet
├── src/
│   └── registry.ts         # All event handlers + IPFS metadata resolution
├── tests/
│   ├── component-registry.test.ts   # Basic Approval event test
│   └── component-registry-utils.ts  # Mock event factories
├── abis/
│   ├── ComponentRegistry.json
│   ├── AgentRegistry.json
│   └── ServiceRegistry.json
└── package.json            # graph-cli 0.64.0, graph-ts 0.29.1, matchstick 0.6.0
```

### Key Contracts (Ethereum Mainnet)

| Contract | Address | Start Block |
|----------|---------|-------------|
| ComponentRegistry | `0x15bd56669F57192a97dF41A2aa8f4403e9491776` | 15,178,253 |
| AgentRegistry | `0x2F1f7D38e4772884b88f3eCd8B6b9faCdC319112` | 15,178,253 |
| ServiceRegistry | `0x48b6af7B12C71f09e2fC8aF4855De4Ff54e775cA` | 15,178,253 |

---

## Schema Reference

### Unit
Represents any registered component, agent, or service.

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Prefixed identifier: `cm` + tokenId, `ag` + tokenId, or `sr` + tokenId |
| tokenId | `BigInt!` | NFT token ID from the registry |
| publicId | `String!` | Human-readable package ID (AUTHOR/NAME format) |
| packageType | `packageType!` | GraphQL enum: custom, protocol, connection, contract, skill, agent, service, unknown |
| packageHash | `String!` | IPFS hash of the package code |
| image | `String!` | IPFS hash of package image |
| description | `String!` | Package description from metadata |
| metadataHash | `String!` | IPFS hash of metadata file |
| owner | `String!` | Current owner address |
| block | `BigInt!` | Block number of creation/update |
| txHash | `String!` | Transaction hash |

### Service
Extended state for service-type units (beyond what Unit tracks).

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | `Bytes.fromBigInt(serviceId)` — no prefix (unlike Unit which uses `sr`) |
| serviceId | `BigInt!` | Unique service identifier |
| publicId | `String!` | Package ID |
| state | `BigInt!` | Service state (0=PreRegistration, 1=Active, 2=Finished, 3=Deployed, 4=Terminated) |
| agentIds | `[BigInt!]` | List of agent IDs in the service |
| threshold | `BigInt!` | Agent consensus threshold |
| securityDeposit | `BigInt!` | Security deposit amount |
| numberOfInstances | `BigInt!` | Current agent instances |
| maxNumberOfInstances | `BigInt!` | Maximum allowed instances |
| multisig | `String!` | Gnosis Safe multisig address |
| instances | `[String!]` | Deployed agent instance addresses |
| packageHash | `String!` | IPFS code hash |
| metadataHash | `String!` | IPFS metadata hash |
| description | `String!` | Service description |
| owner | `String!` | Owner address |

### Global
Singleton aggregate statistics (id: `""`).

| Field | Type | Notes |
|-------|------|-------|
| totalBuilders | `BigInt!` | Unique addresses that minted components or agents |
| totalAgents | `BigInt!` | Total agents minted |
| totalComponents | `BigInt!` | Total components minted |
| totalServices | `BigInt!` | Total services minted |

### Builder
Tracks unique builders (id: builder address string).

---

## Event Handlers

### Component Registry

| Event | Handler | Logic |
|-------|---------|-------|
| `CreateUnit` | `handleCreateComponent` | Fetches owner via `ownerOf()`, creates Unit with `cm` prefix, resolves IPFS metadata |
| `UpdateUnitHash` | `handleUpdateComponent` | Updates existing Unit with new hash, re-resolves IPFS metadata |
| `Transfer` | `handleComponentTransfer` | On mint (from == zero): tracks Builder, increments `Global.totalComponents`. Updates Unit.owner if the entity exists (at mint it doesn't yet — see business rule 2) |

### Agent Registry

| Event | Handler | Logic |
|-------|---------|-------|
| `CreateUnit` | `handleCreateAgent` | Same as component but with `ag` prefix, explicit packageType="agent" |
| `UpdateUnitHash` | `handleUpdateAgent` | Updates existing agent Unit |
| `Transfer` | `handleAgentTransfer` | On mint: tracks Builder, increments `Global.totalAgents`. Updates Unit.owner if the entity exists |

### Service Registry

| Event | Handler | Logic |
|-------|---------|-------|
| `CreateService` | `handleCreateService` | Fetches metadata URI via `tokenURI()`, creates Unit with `sr` prefix, calls `handleServiceUpdate()` |
| `UpdateService` | `handleUpdateService` | Updates Unit, calls `handleServiceUpdate()` |
| `Transfer` | `handleServiceTransfer` | On mint (from == zero): increments `Global.totalServices` (but does NOT create Builder). Updates Unit.owner and Service.owner if those entities exist |
| `ActivateRegistration` | `handleActivateRegistration` | Calls `handleServiceUpdate()` to refresh state |
| `RegisterInstance` | `handleRegisterInstance` | Calls `handleServiceUpdate()` to update instances |
| `DeployService` | `handleDeployService` | Calls `handleServiceUpdate()` |
| `TerminateService` | `handleTerminateService` | Calls `handleServiceUpdate()` |
| `OperatorUnbond` | `handleOperatorUnbond` | Calls `handleServiceUpdate()` |

### handleServiceUpdate (Core Helper)

Called by all service-related handlers. Fetches full on-chain state via `ServiceRegistry.getService(serviceId)`:
- Pulls state, agentIds, configHash, threshold, securityDeposit, instances, maxInstances, multisig
- Calls `getAgentInstances()` for deployed instance addresses
- Fetches owner via `ownerOf()` (defaults to "n/a" if reverted)
- Resolves IPFS metadata for publicId, packageHash, description

**End-of-block semantics**: graph-node executes eth_calls against end-of-block state, not per-log state. If multiple lifecycle events for a service land in one block (common when activate/register/deploy are batched via a multisig or timelock), every handler writes the same final-state snapshot and intermediate states are never observable. Read `Service.state` as "state at the end of the last block containing any lifecycle event", not an event-by-event state machine.

**Cost**: each of the 7 service events triggers ~4 eth_calls (`getService`, `getAgentInstances`, `try_ownerOf`, `tokenURI`) plus at least 1 IPFS fetch — `CreateService`/`UpdateService` do roughly double (they also run `createOrUpdateUnit`). This is the dominant sync cost for service-heavy blocks.

---

## IPFS Metadata Resolution

### Hash Conversion
On-chain bytes32 hashes are converted to a base16-multibase IPFS CIDv1 (`f` = base16, `01` = CIDv1, `70` = dag-pb, `1220` = sha2-256/32):
```
Base16HashPrefix = "f01701220"
ipfsHash = Base16HashPrefix + onChainHash.toHexString().slice(2)
```

### Metadata JSON Structure
```json
{
  "code_uri": "ipfs://Qm...",
  "name": "PACKAGE_TYPE/AUTHOR/NAME/VERSION",
  "image": "ipfs://Qm...",
  "description": "..."
}
```

### Name Field Parsing & Package Type Detection

The `name` field supports multiple formats (handled in order):

1. **4 parts** (`PACKAGE_TYPE/AUTHOR/NAME/VERSION`): publicId = `AUTHOR/NAME`, packageType from first segment
2. **3 parts** (`PACKAGE_TYPE/AUTHOR/NAME:VERSION`): same as above, strips version after `:`
3. **2 parts** (`AUTHOR/NAME:VERSION`): publicId = `AUTHOR/NAME`, packageType detected by IPFS file probe
4. **Fallback**: publicId = raw name string, packageType = "unknown"

For format 3, package type is probed by checking IPFS for: `protocol.yaml`, `connection.yaml`, `contract.yaml`, `skill.yaml` (first match wins, else "unknown").

### IPFS on the Critical Path — Consequences

All IPFS fetches happen synchronously inside event handlers (unlike marketplace, which moved IPFS off the indexing critical path). Implications:

- **`"n/a"` in `publicId`/`packageHash` means "IPFS was unavailable at index time"**, not "metadata doesn't exist" (`image`/`description` can also be `"n/a"` when fetched metadata simply omits those keys). There is no retry: the fields stay frozen until a later on-chain event for that unit re-runs `getMetadata` (`UpdateUnitHash`; for services, any lifecycle event). Consequently, a full re-sync can produce different values than the current deployment.
- **Indexing speed is IPFS-latency-bound**: every unit create/update does at least 1 blocking `ipfs.cat`; 2-part-name components add up to 4 sequential yaml probes, and their `packageType` classification is itself availability-dependent — it can land on `unknown` spuriously.
- **Deployment constraint**: the `ipfsOnEthereumContracts` feature (business rule 8) is deprecated and non-deterministic, restricting this subgraph to self-hosted graph-node — it cannot be published to The Graph decentralized network. Relevant to any migration off graph-cli 0.64.0 (Tier 3 Wave 3): newer specVersions may reject the flag.

### Entity ID Prefixes
The prefix strings are passed through `Bytes.fromHexString`, which hex-parses them and stops at the first non-hex character — so the stored prefix bytes are NOT the ASCII encodings of the strings:
- `cm` (stored as byte `0x0c`): Components
- `ag` (stored as byte `0x0a`): Agents
- `sr` (stored as byte `0x00`): Services

IDs used in queries must be constructed with the same `Bytes.fromHexString` quirk to match. The tokenId part is `Bytes.fromBigInt`, i.e. little-endian two's-complement signed bytes (256 → `0001`, 128 → `8000` with a sign byte) — see README "Entity ID Formats" for worked examples.

---

## Key Business Rules

1. **Builder Tracking**: A builder is recorded on first component/agent mint (Transfer from zero address). Service mints increment `totalServices` but do NOT create Builder entities. The Builder id is the mint **recipient** (`to`), not `tx.from` — units minted to a DAO/multisig credit the multisig. `Global` totals are mint counters and are never decremented.
2. **Handler Ordering at Mint**: Within a mint tx, the ERC721 `Transfer(0x0 → owner)` log precedes `CreateUnit`/`CreateService`. The Transfer handler therefore intentionally (a) increments `Global` counters and creates the Builder, and (b) finds no Unit/Service entity and skips the owner write — the null-load branch is the expected mint path, not a bug. The entity is created by the later create handler, which reads the owner via `ownerOf()` (correct because the mint already completed). Do not create entities in Transfer handlers or move mint counting into create handlers.
3. **Ownership via NFT Transfer**: Unit.owner and Service.owner always reflect current NFT owner.
4. **IPFS Failure Handling**: If the metadata file is missing (`ipfs.cat` returns null), the entity is still saved with "n/a" placeholder fields — silently: the `log.error` branch in `storeUnit` is unreachable because `getMetadata` always returns a truthy sentinel. Malformed metadata JSON, or a metadata object missing `code_uri`/`name`, aborts the handler (`json.fromString` + non-null casts) — a deterministic failure that halts indexing until a fixed build is redeployed. A second fatal path: for **component** units whose metadata `name` has 3 or 4 segments, `packageType` is copied verbatim (lowercased) from the first segment with no check against the closed `packageType` enum — an out-of-enum value (e.g. `component`) fails entity validation at save. Agents and services are immune (explicit `"agent"`/`"service"` override). Since unit metadata is publisher-controlled IPFS content, both fatal paths are reachable by anyone who mints a unit; hardening would mean `json.try_fromString`, null-checking `code_uri`/`name`, and mapping unrecognized package types to `unknown`.
5. **Reverted Calls**: The guard is the exception, not the rule. The ONLY `try_` call in the mapping is `try_ownerOf` inside `updateServiceState` (terminated services may revert — defaults to "n/a"). Every other eth_call — `ownerOf` in all six unit/service create/update handlers, `tokenURI` (×3), `getService`, `getAgentInstances` — is the non-`try_` variant, so a revert is a deterministic subgraph failure. Prefer `try_` variants when adding or touching handlers.
6. **No Immutable Entities**: All entities are mutable (unlike marketplace subgraph).
7. **Scope**: Only tracks the three registries — no marketplace, fees, or other ecosystem contracts.
8. **fullTextSearch and ipfsOnEthereumContracts** features declared in the manifest (`subgraph.yaml`). Note: `schema.graphql` defines no `@fulltext` directive, so `fullTextSearch` is declared but unused.

---

## Testing

**Framework**: Matchstick v0.6.0

**Warning**: Test files are auto-generated boilerplate and non-functional. The test imports `handleApproval` from `src/component-registry` (does not exist) and asserts on an `Approval` entity (not in schema). Mock event utilities in `component-registry-utils.ts` cover all event types but are unused. Tests need to be rewritten against the actual handlers in `src/registry.ts`.

```bash
yarn test
```

---

## Development Workflow

```bash
yarn install    # Install dependencies
yarn codegen    # Generate TypeScript from schema + ABIs
yarn build      # Compile to WebAssembly
yarn test       # Run tests
```
