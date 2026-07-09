# Mech Subgraph (Legacy, Gnosis)

A GraphQL API for indexing the legacy Autonolas AI mech infrastructure on Gnosis Chain. Tracks mech creation, request/delivery lifecycle, IPFS metadata parsing, service associations, and ATA (Autonomous Transaction Agent) counting.

> **User-facing guide**: See [README.md](README.md) for quick start, common queries, and deployment.
>
> **Deprecated**: Use the [marketplace](../marketplace/CLAUDE.md) subgraph instead. On Gnosis, the marketplace subgraph merges both legacy mech data (from this subgraph) and new Mech Marketplace data into a single unified API. On other chains, it indexes only new Mech Marketplace data.

## Architecture Overview

### Directory Structure
```
subgraphs/mech/
├── schema.graphql          # GraphQL schema
├── subgraph.yaml           # Manifest: 4 factory versions + AgentRegistry + ServiceRegistryL2
├── src/
│   ├── agent-factory.ts    # Mech creation handlers (4 factory versions)
│   ├── agent-registry.ts   # Agent NFT registry handlers
│   ├── agent-mech.ts       # Request/Deliver handlers (dynamic template)
│   └── registryL2.ts       # Service registry handlers
├── tests/
│   ├── agent-factory.test.ts       # CreateMech event tests
│   ├── agent-factory-utils.ts      # Mock factory events
│   ├── agent-registry.test.ts      # Approval event test
│   ├── agent-registry-utils.ts     # Mock registry events
│   ├── agent-mech.test.ts          # Request/Deliver lifecycle tests
│   ├── agent-mech-utilts.ts        # Mock mech events (note: filename typo is in the repo)
│   └── ipfs_mocks/                 # Mock IPFS data files
│       ├── mech-request.json
│       ├── mech-response.json
│       └── mech-invalid-response.json
└── package.json            # graph-cli 0.98.1, graph-ts 0.38.2, matchstick 0.6.0
```

### Key Contracts (Gnosis)

| Contract | Address | Start Block |
|----------|---------|-------------|
| AgentFactory V1 | `0x88DE734655184a09B70700aE4F72364d1ad23728` | 27,911,512 |
| AgentFactory V2 | `0x4be7A91e67be963806FeFA9C1FD6C53DfC358d94` | 30,662,989 |
| AgentFactory V3 | `0x2acd313b892c9922e470e4950e907d5eaa70fc2a` | 35,714,019 |
| AgentFactory V4 | `0x6d8cbebcad7397c63347d44448147db05e7d17b0` | 36,582,492 |
| AgentRegistry | `0xE49CB081e8d96920C38aA7AB90cb0294ab4Bc8EA` | 27,911,490 |
| ServiceRegistryL2 | `0x9338b5153AE39BB89f50468E608eD9d764B755fD` | 27,871,084 |

### History Pruning

The manifest sets `indexerHints.prune: 300`, so indexers retain only ~300 blocks (~25 min on Gnosis) of entity history. Time-travel queries (`block: {number: N}`) work only near chain head; historical snapshots must be captured by polling, not reconstructed after the fact.

---

## Schema Reference

### Core Entities

#### Request (Mutable)
Individual mech requests with IPFS-parsed content.

| Field | Type | Notes |
|-------|------|-------|
| id | `ID!` | Request ID (requestId hex string) |
| sender | `Sender!` | Requester address |
| ipfsHash | `String!` | IPFS hash of request data |
| prompt | `String` | Parsed prompt from IPFS metadata |
| tool | `String` | Parsed tool from IPFS metadata (array joined) |
| questionTitle | `String` | Extracted question title from prompt |
| service | `Service` | Linked service (via multisig lookup) |
| delivery | `Deliver` | `@derivedFrom(field: "request")`, single nullable delivery |
| blockNumber | `BigInt!` | |
| blockTimestamp | `BigInt!` | |
| transactionHash | `Bytes!` | |

#### Deliver (Immutable)
Mech delivery with IPFS-parsed response.

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Delivery ID |
| request | `Request` | Linked request (only if no prior delivery exists) |
| model | `String!` | Parsed AI model from IPFS metadata |
| toolResponse | `String!` | Parsed response from IPFS metadata (JSON `result` key) |
| service | `Service` | Linked service (via mech → agent → service chain) |

#### MechAgent (Mutable)
Links agent ID → mech address → service.

| Field | Type | Notes |
|-------|------|-------|
| id | `String!` | Agent ID string |
| agentHash | `Bytes` | Agent hash from registry |
| mech | `Bytes` | Mech contract address |
| address | `Bytes` | Duplicate of mech address (set by factory handler) |
| service | `Service` | Associated service |
| totalTransactions | `BigInt!` | Delivery count |

#### Service (Mutable)
Aggregated service metrics.

| Field | Type | Notes |
|-------|------|-------|
| id | `String!` | Service ID string |
| totalRequests | `BigInt!` | Requests made by service multisig |
| totalDeliveries | `BigInt!` | Deliveries by service mechs |
| agentIds | `[BigInt!]!` | Current agent composition |
| latestMultisig | `Bytes` | Most recent multisig address |
| historicalMultisigs | `[Bytes!]!` | All past multisig addresses |

#### Sender (Mutable)
Per-address request/transaction aggregation.

| Field | Type | Notes |
|-------|------|-------|
| id | `Bytes!` | Sender address |
| totalRequests | `Int!` | |
| totalTransactions | `Int!` | |
| totalAtaTransactions | `Int!` | ATA-attributed transactions |

#### Global (Mutable, Singleton id: `""`)
Subgraph-wide totals: totalRequests, totalDeliveries, totalTransactions, totalAtaTransactions.

#### AtaTransaction (Immutable)
Deduplicates ATA transactions by tx hash.

---

## Event Handlers

### Agent Factory (agent-factory.ts)

- **handleCreateMech**: Creates `CreateMech` event entity, creates/updates `MechAgent`, instantiates `AgentMech` template for dynamic indexing of the new mech contract.

### Agent Registry (agent-registry.ts)

- **handleCreateAgent**: Creates `CreateAgent` event, creates/updates `MechAgent` with agent hash.
- **handleTransfer**: On mint (from == zero): creates `AgentMultisigAssociation` (agent → multisig mapping), updates `MechAgent.service`.
- **handleUpdateAgentHash**: Updates agent hash on both event entity and `MechAgent`.

### Service Registry (registryL2.ts)

- **handleCreateService**: Creates `Service` entity with empty metrics.
- **handleRegisterInstance**: Adds agentId to `service.agentIds`, updates `MechAgent.service` (cross-namespace write — see Key Business Rules #13).
- **handleCreateMultisigWithAgents**: Maps multisig → serviceId, updates `Service.latestMultisig` and `historicalMultisigs`.
- **handleTerminateService**: Clears `service.agentIds`.

### Mech Contract (agent-mech.ts) — Dynamic Template

#### handleRequest
- Creates `Request` entity
- Parses IPFS metadata: `{ipfsHash}/metadata.json` → extracts `prompt`, `tool` (array joined)
- Extracts `questionTitle` from prompt (searches for "With the given question" marker)
- Increments Sender and Global counters
- **ATA detection**: If sender has a `CreateMultisigWithAgents` entity → sender is an ATA → increments ATA counters
- Associates request with service via multisig lookup
- Increments `Service.totalRequests` and `RequestsPerAgentOnchain` for all agents in current composition

#### handleDeliver
- Creates `Deliver` entity
- Parses IPFS response: `{ipfsHash}/{requestId}/metadata.json` → extracts `model` and `result`
- Links to existing `Request` (only if no prior delivery)
- Associates delivery with service via mech → agent → service chain
- Increments `Service.totalDeliveries`, `MechAgent.totalTransactions`
- Increments Global counters; counts the tx as ATA unconditionally with no Sender credit (deduplicated by tx hash via `AtaTransaction` — see Key Business Rules #10)

---

## IPFS Metadata Parsing

### Hash Conversion
```
ipfsHash = 'f01701220' + event.data.toHexString().slice(2)
```

### Request Metadata
Path: `{ipfsHash}/metadata.json`
```json
{
  "prompt": "With the given question \"Will X happen?\"...",
  "tool": ["tool1", "tool2"]
}
```

### Delivery Metadata
Path: `{ipfsHash}/{requestId}/metadata.json`
```json
{
  "result": "{\"p_yes\": 0.75, ...}",
  "metadata": {
    "model": "gpt-4"
  }
}
```

### Fallback & Failure Modes
All IPFS reads are synchronous `ipfs.cat` calls on the indexing critical path (no file data sources) — unretrievable content stalls indexing until graph-node gives up and returns null. Fetch order (`tryGetIpfsResponse`): `{path}/metadata.json` first, then the bare `{path}`.

Field semantics for consumers:
- Requests: unfetchable IPFS data → empty strings for prompt/tool; malformed prompt/tool fields in fetched JSON → `'[unhandled type]'`. Filtering on `'[unhandled type]'` alone misses fetch failures.
- Deliveries: missing response or missing `metadata` key → `'[unhandled type]'` for both model and toolResponse.

Unguarded crash paths (deterministic handler trap → subgraph failure):
- Fetched IPFS content that is not valid JSON — parsing uses non-try `json.fromBytes`/`json.fromString`.
- A delivery payload that has a `metadata` key but lacks `result` or `model` — both are read with non-null assertions in `getResponseMetadata`.

These paths have not fired in production but are not guarded; request calldata is user-supplied (anyone can call `request()` with arbitrary bytes), so do not assume it is well-formed. Only the missing-`metadata` branch is covered by tests (`mech-invalid-response.json` is `{}`).

---

## Key Business Rules

1. **4 Factory Versions**: All emit `CreateMech` events; each creates a new `AgentMech` dynamic data source.
2. **Agent-Multisig Association**: Established on agent NFT mint (Transfer from zero address).
3. **Service Linkage**: Request/Delivery → service via multisig lookup chain.
4. **ATA Recognition**: Sender is ATA if their address has a `CreateMultisigWithAgents` record.
5. **One Delivery Per Request (link only)**: Only the `Request.delivery` link is deduplicated — the first delivery wins; duplicates and deliveries for never-indexed requests are logged as warnings. Global/Service/MechAgent delivery counters still increment on every `Deliver` event, so `totalDeliveries` can exceed the number of distinct delivered requests.
6. **Question Title Extraction**: Searches prompt for "With the given question" marker, extracts text between quotes.
7. **Per-Agent Request Counting**: `RequestsPerAgentOnchain` incremented for all agents in current service composition.
8. **Service Termination**: Clears `agentIds` array (canonical agent set).
9. **ATA Transaction Deduplication**: Uses `AtaTransaction` entity keyed by tx hash to prevent double-counting request + delivery in same tx. Dedup is global per tx hash: the first qualifying event in a transaction claims the `AtaTransaction`; any later event in the same tx (even from a different sender) adds nothing.
10. **ATA Counter Asymmetry**: On requests, ATA credit requires the sender to be a known service multisig and increments both `Global.totalAtaTransactions` and `Sender.totalAtaTransactions`. On deliveries, `Global.totalAtaTransactions` increments unconditionally (the code assumes the delivering mech operator is always a service) and no `Sender` is credited. So `sum(Sender.totalAtaTransactions) < Global.totalAtaTransactions` by design.
11. **Directional Counter Semantics**: `Service.totalRequests` attributes by SENDER (requests the service made through its multisig — the service as mech consumer); `Service.totalDeliveries` attributes by MECH ADDRESS (deliveries produced by the mech the service operates). They describe different roles — for most services one is structurally zero — so never compare them as a request→fulfillment ratio for one service.
12. **Request Identity**: `Request` is keyed solely by `requestId` (hex) — no mech address in the key, no load-or-create. Early AgentMech versions derive `requestId` from `(sender, data)` (`getRequestId`; later versions add a per-sender nonce via `getRequestIdWithNonce`), so on non-nonce mechs re-submitting identical calldata reuses the ID: the entity is overwritten in place (blockNumber/transactionHash reflect the latest submission) while Sender/Global/Service request counters increment per event. `totalRequests` counters can therefore exceed the number of distinct `Request` entities, and `Request.transactionHash` is not guaranteed to be the first-submission tx. Deliveries are matched by `requestId` alone, so a cross-mech requestId collision would attach a delivery to the wrong mech's request.
13. **Agent-ID Namespace Gotcha**: Two unrelated ID spaces write into `MechAgent`. It is created and keyed (hex) by mech AgentRegistry/AgentFactory agent IDs (the NFT per mech), but `handleRegisterInstance` loads `MechAgent` by the ServiceRegistryL2 service-composition agent ID and unconditionally overwrites `MechAgent.service` — last write wins. When the same numeric ID exists in both registries, delivery→service attribution (via `getServiceIdFromMech`) can be clobbered by an unrelated service registration. Relatedly, `RequestsPerAgentOnchain` is keyed by service-composition agent IDs (decimal `toString`), not mech agent IDs — do not join it against `MechAgent` (hex IDs, different namespace).

---

## Testing

**Framework**: Matchstick v0.6.0

### Test Coverage
- `agent-factory.test.ts`: CreateMech event handling, MechAgent entity creation
- `agent-registry.test.ts`: Approval event handling
- `agent-mech.test.ts`: Full request/delivery lifecycle with IPFS mocking, sender/global aggregation, invalid response handling

### IPFS Mocks
- `mech-request.json`: Contains prompt and tool array
- `mech-response.json`: Contains result JSON string, metadata with model
- `mech-invalid-response.json`: Empty object for fallback testing

```bash
yarn test
```
