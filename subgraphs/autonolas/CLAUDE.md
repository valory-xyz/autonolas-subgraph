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
└── package.json            # graph-cli 0.64.0, graph-ts 0.29.1, matchstick 0.5.0
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
| packageHash | `String` | IPFS hash of the package code |
| image | `String` | IPFS hash of package image |
| description | `String` | Package description from metadata |
| metadataHash | `String` | IPFS hash of metadata file |
| owner | `String` | Current owner address |
| block | `BigInt` | Block number of creation/update |
| txHash | `String` | Transaction hash |

### Service
Extended state for service-type units (beyond what Unit tracks).

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | `Bytes.fromBigInt(serviceId)` — no prefix (unlike Unit which uses `sr`) |
| serviceId | `BigInt!` | Unique service identifier |
| publicId | `String` | Package ID |
| state | `BigInt` | Service state (0=PreRegistration, 1=Active, 2=Finished, 3=Deployed, 4=Terminated) |
| agentIds | `[BigInt!]` | List of agent IDs in the service |
| threshold | `BigInt` | Agent consensus threshold |
| securityDeposit | `BigInt` | Security deposit amount |
| numberOfInstances | `BigInt` | Current agent instances |
| maxNumberOfInstances | `BigInt` | Maximum allowed instances |
| multisig | `String` | Gnosis Safe multisig address |
| instances | `[String!]` | Deployed agent instance addresses |
| packageHash | `String` | IPFS code hash |
| metadataHash | `String` | IPFS metadata hash |
| description | `String` | Service description |
| owner | `String` | Owner address |

### Global
Singleton aggregate statistics (id: `""`).

| Field | Type | Notes |
|-------|------|-------|
| totalBuilders | `BigInt` | Unique addresses that minted components or agents |
| totalAgents | `BigInt` | Total agents minted |
| totalComponents | `BigInt` | Total components minted |
| totalServices | `BigInt` | Total services minted |

### Builder
Tracks unique builders (id: builder address string).

---

## Event Handlers

### Component Registry

| Event | Handler | Logic |
|-------|---------|-------|
| `CreateUnit` | `handleCreateComponent` | Fetches owner via `ownerOf()`, creates Unit with `cm` prefix, resolves IPFS metadata |
| `UpdateUnitHash` | `handleUpdateComponent` | Updates existing Unit with new hash, re-resolves IPFS metadata |
| `Transfer` | `handleComponentTransfer` | On mint (from == zero): tracks Builder, increments `Global.totalComponents`. Always updates Unit.owner |

### Agent Registry

| Event | Handler | Logic |
|-------|---------|-------|
| `CreateUnit` | `handleCreateAgent` | Same as component but with `ag` prefix, explicit packageType="agent" |
| `UpdateUnitHash` | `handleUpdateAgent` | Updates existing agent Unit |
| `Transfer` | `handleAgentTransfer` | On mint: tracks Builder, increments `Global.totalAgents`. Updates Unit.owner |

### Service Registry

| Event | Handler | Logic |
|-------|---------|-------|
| `CreateService` | `handleCreateService` | Fetches metadata URI via `tokenURI()`, creates Unit with `sr` prefix, calls `handleServiceUpdate()` |
| `UpdateService` | `handleUpdateService` | Updates Unit, calls `handleServiceUpdate()` |
| `Transfer` | `handleServiceTransfer` | On mint (from == zero): increments `Global.totalServices` (but does NOT create Builder). Always updates Unit.owner and Service.owner |
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

---

## IPFS Metadata Resolution

### Hash Conversion
On-chain bytes32 hashes are converted to IPFS CIDv0 format:
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

### Entity ID Prefixes
- `cm` (0x636d): Components
- `ag` (0x6167): Agents
- `sr` (0x7372): Services

---

## Key Business Rules

1. **Builder Tracking**: A builder is recorded on first component/agent mint (Transfer from zero address). Service mints increment `totalServices` but do NOT create Builder entities.
2. **Ownership via NFT Transfer**: Unit.owner and Service.owner always reflect current NFT owner.
3. **IPFS Failure Handling**: Missing/invalid IPFS metadata is logged but doesn't crash — entity still saved with available fields.
4. **Reverted Calls**: `ownerOf()` on terminated services may revert — defaults to "n/a".
5. **No Immutable Entities**: All entities are mutable (unlike marketplace subgraph).
6. **Scope**: Only tracks the three registries — no marketplace, fees, or other ecosystem contracts.
7. **fullTextSearch and ipfsOnEthereumContracts** features enabled in schema.

---

## Testing

**Framework**: Matchstick v0.5.0

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
