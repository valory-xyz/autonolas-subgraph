# Marketplace Subgraph

A Graph Protocol subgraph for indexing the Olas Mech Marketplace on **Gnosis**, **Base**, **Polygon**, **Optimism**, **Ethereum**, **Arbitrum**, and **Celo** networks.

## When to Read This

**README.md (this file)**: User-facing guide for querying, deployment, and quick start
**CLAUDE.md**: Developer-facing context for debugging, adding handlers, and writing tests

## Overview

This subgraph indexes:
- Mech creation and registration
- Request/delivery lifecycle (on-chain and off-chain/signed)
- Service activity metrics
- Fee tracking with USD conversion
- ATA (Autonomous Transaction Agent) counting
- IPFS metadata parsing for prompts/responses

## Networks

| Network | Marketplace Address | Start Block |
|---------|---------------------|-------------|
| Gnosis | `0x735FAAb1c4Ec41128c367AFb5c3baC73509f70bB` | 38661963 |
| Base | `0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020` | 26642705 |
| Polygon | `0x343F2B005cF6D70bA610CD9F1F1927049414B582` | 81028558 |
| Optimism | `0x46C0D07F55d4F9B5Eed2Fc9680B5953e5fd7b461` | 145788454 |
| Ethereum | `0x3d6494CE09a9f40c0B5a92BdBD7c7A9b0e3912b1` | 24427441 |
| Arbitrum | `0xf76953444C35F1FcE2F6CA1b167173357d3F5C17` | 430646886 |
| Celo | `0x17d96ba4532fe91809326092fE4D5606A7B7a0d8` | 58841368 |

## Quick Start

### Prerequisites

- Node.js >= 24 (see root `.nvmrc`, currently 24.4.1)
- Yarn
- Graph CLI (`npm install -g @graphprotocol/graph-cli`)

### Installation

```bash
yarn install
```

### Build

```bash
# Generate types from schema and ABIs
yarn codegen

# Build the subgraph
yarn build

# Build for specific network
graph build subgraph.gnosis.yaml
graph build subgraph.base.yaml
graph build subgraph.polygon.yaml
graph build subgraph.optimism.yaml
graph build subgraph.mainnet.yaml
graph build subgraph.arbitrum.yaml
graph build subgraph.celo.yaml
```

### Test

```bash
# Run all tests
yarn test

# Run specific test file
graph test tests/marketplace/mech-marketplace.test.ts
```

### Local Development

```bash
# Create subgraph on local node
yarn create-local

# Deploy to local node
yarn deploy-local
```

## Schema

### Core Entities

| Entity | Description | Mutability |
|--------|-------------|------------|
| `Service` | Olas service with mech(s), requests, and deliveries | Mutable (aggregated state) |
| `Request` | A request to a mech for AI inference | Mutable (aggregated state) |
| `Deliver` | Delivery of a request response | Mutable (aggregated state) |
| `Mech` | Marketplace mech instance with karma and fee tracking | Mutable (aggregated state) |
| `MarketplaceMech` | Legacy marketplace mech (tracks transactions per service) | Mutable (aggregated state) |
| `Global` | Aggregate counters (marketplace + legacy requests, deliveries, fees) | Mutable (aggregated state) |
| `Sender` | Address that has made requests | Mutable (aggregated state) |
| `ParsedRequest` | IPFS-parsed request content (prompt, tool) | Immutable (event log) |
| `ParsedDelivery` | IPFS-parsed delivery content (response, model, tool, toolHash) | Immutable (event log) |
| `MarketplaceRequest` | On-chain marketplace request event | Immutable (event log) |
| `MarketplaceDelivery` | On-chain marketplace delivery event | Immutable (event log) |
| `AtaTransaction` | Deduplicated ATA transaction record | Immutable (event log) |

### Key Relationships

```
Service
├── marketplaceMechs: [MarketplaceMech]
├── requests: [Request]  (via mech linkage)
└── deliveries: [Deliver]

Request
├── sender: Sender
├── service: Service
├── marketplaceRequest: RequestToMarketplace
├── parsedRequest: ParsedRequest
└── deliveries: [Deliver]

Deliver
├── request: Request
├── service: Service
├── mechDelivery: DeliverForMech
├── marketplaceDelivery: DeliverForMarketplace
└── parsedDelivery: ParsedDelivery  (derived; shares the Deliver's id)

ParsedDelivery
├── deliver: Deliver
└── request: Request
```

## Querying

### Endpoint

```
https://subgraph.autonolas.tech/subgraphs/name/marketplace-{network}-{version}
```

### Example Queries

**Get service with requests:**
```graphql
{
  service(id: "175") {
    id
    latestMultisig
    totalRequests      # Requests BY this service's multisig
    totalDeliveries    # Deliveries BY this service's mech
  }
}
```

**Get requests TO a service's mech:**
```graphql
{
  requests(where: {service_: {id: "175"}}, first: 100) {
    id
    sender { id }
    isDelivered
    feeUSD
  }
}
```

**Get recent deliveries:**
```graphql
{
  delivers(first: 10, orderBy: blockTimestamp, orderDirection: desc) {
    id
    request { id }
    service { id }
    blockTimestamp
  }
}
```

**Get IPFS-parsed request and delivery data:**
```graphql
{
  requests(first: 10) {
    id
    parsedRequest {
      prompt
      tool
    }
    deliveries {
      id
      parsedDelivery {   # IPFS-parsed response/model/tool/toolHash
        response
        model
        tool
        toolHash
      }
    }
  }
}
```

Or query parsed delivery content directly:
```graphql
{
  parsedDeliveries(first: 10) {
    response
    model
    tool
    toolHash
    request { id }
  }
}
```

### IPFS Metadata Is Asynchronous

Request/delivery IPFS metadata is fetched by background file data sources (`handleParsedRequest`/`handleParsedDelivery`), off the block-indexing critical path. Consequences for consumers:

- `ParsedRequest`/`ParsedDelivery` can lag arbitrarily behind the chain head and never appear at all if the IPFS hash is unreachable. `parsedRequest: null` does not mean no prompt existed.
- The IPFS-parsed `response`/`model`/`tool`/`toolHash` live on `ParsedDelivery`, read via `deliver.parsedDelivery`. Delivery IPFS metadata is parsed in a file-data-source causality region that writes only `ParsedDelivery`, not the chain-owned `Deliver`. `tool` (`metadata.tool`) and `toolHash` (`metadata.tool_hash`, an IPFS CID) are `[unhandled type]` when the payload omits the keys.
- `Global.totalPredictRequests` / `Sender.totalPredictRequests` are not incremented for marketplace requests (the background handler cannot write `Global`/`Sender`); only the legacy Gnosis AgentMech path increments them. Compute predict-request counts as `parsedRequests(where: {questionTitle_not: ""})` instead.
- `questionTitle` is extracted by matching the `With the given question "..."` prompt template (`src/marketplace/request-metadata.ts`). If the trader prompt template changes, `QUESTION_CLOSING_DELIMITERS` must be extended or new requests get `questionTitle: ""`.
- Request/delivery payloads that are not exactly 32 bytes (a raw IPFS digest) are skipped entirely — no IPFS parse, only a log warning.

### Query Semantics

| Field | Meaning |
|-------|---------|
| `Service.totalRequests` | Requests made **BY** the service's multisig |
| `Service.totalDeliveries` | Deliveries made **BY** the service's mech |
| `requests(where: {service_: {id}})` | Requests **TO** the service's mech |
| `Global.totalLegacyRequests` / `totalLegacyDeliveries` | Legacy AgentMech (Gnosis) activity only |
| `Sender.totalLegacyRequests` | Misnomer: all-time requests by this sender across legacy, marketplace, and off-chain signed paths |
| `Sender.totalLegacyTransactions` | Misnomer: all-time request-bearing transactions by this sender (all paths) |
| `Sender.totalMarketplaceRequests` | Misnomer: +1 per marketplace batch event AND +1 per legacy AgentMech request |
| `Global.totalMarketplaceRequests` / `totalMarketplaceDeliveries` / `totalMarketplaceDeliveriesWithSignatures` | Count **events** (one per batch), not individual requests |
| `Global.totalRequests` / `totalDeliveries` | Count individual requests/deliveries across all paths |

> **Note:** `totalRequests` only counts requests where the requester is a registered service multisig. To count all requests received by a service's mech, query requests directly with the service filter.

> **Note:** because batch events count as 1 in `totalMarketplace*` while the aggregate counters add the batch size, `Global.totalMarketplaceRequests + Global.totalLegacyRequests` is expected to be smaller than `Global.totalRequests` — this is by design, not a data bug.

## Architecture

### Data Sources

1. **MechMarketplace** (V1/V2) - Main marketplace contract
2. **MechFactory** - Factory contracts that emit type-specific `CreateMech*` events with `maxDeliveryRate`
   - `MechFactoryFixedPriceNative`
   - `MechFactoryFixedPriceToken`
   - `MechFactoryFixedPriceTokenUSDC`
   - `MechFactoryNvmSubscriptionNative`
   - `MechFactoryNvmSubscriptionTokenUSDC`
3. **ServiceRegistryL2** - Service lifecycle events
4. **Karma** - Mech karma tracking
5. **ComplementaryServiceMetadata** - Service metadata updates
6. **Mech Templates** (dynamic) - Per-mech events
   - `MechFixedPriceNative`
   - `MechFixedPriceToken`
   - `MechNvmSubscriptionNative`
   - `MechNvmSubscriptionTokenUSDC`

### Fee Tracking

Fees are converted to USD using:

| Network | Token | Method |
|---------|-------|--------|
| Gnosis | xDAI | 1:1 peg |
| Base | ETH | Chainlink ETH/USD price feed |
| Polygon | POL | Chainlink POL/USD price feed |
| Optimism | ETH | Chainlink ETH/USD price feed |
| Ethereum | ETH | Chainlink ETH/USD price feed |
| Arbitrum | ETH | Chainlink ETH/USD price feed |
| Celo | CELO | Chainlink CELO/USD price feed |
| Any | USDC | 1:1 peg |
| Gnosis/Base/Arbitrum | OLAS | Balancer V2 pool prices |
| Ethereum | OLAS | Uniswap V2 pool price |
| Any | NVM Credits | Contract token ratios |

**Scope:** Fee tracking applies only to on-chain marketplace requests (emitted via `MarketplaceRequest` events). Off-chain signed deliveries and legacy AgentMech requests do not have fee data.

**Semantics and caveats:**

- `Request.feeUSD` is the estimated fee locked at request time (the priority mech's `maxDeliveryRate` converted to USD at that block). `Request.finalFeeUSD` is the actual fee, computed exactly once when the delivery carrying `deliveryRate` is indexed. `Sender.totalFeesPaidUSD` and `Global.totalFeesPaidUSD` accumulate only `finalFeeUSD` — use it for spend analytics; `feeUSD` is an upper-bound estimate and summing it overstates spend.
- Conversions read the price source at the block being indexed (Chainlink `latestRoundData`, Balancer/Uniswap pool reserves) — there is no TWAP or historical smoothing, so `totalFeesPaidUSD` may differ slightly between deployments due to price feed timing (see `scripts/README.md`).
- All conversion failures are non-fatal and return **$0** with only a log warning: reverted Chainlink calls, empty/zero DEX pools, unknown fee units, OLAS (TOKEN) fees on Celo (no pricing pool exists), and NVM Credits on networks other than Gnosis/Base. USD totals are therefore lower bounds; raw amounts are preserved in `Request.feeRaw` and `DeliverForMarketplace.deliveryRate`.
- NVM subscription Credits convert via hardcoded 0.99 ratios in `src/marketplace/constants.ts` that mirror immutable contract values — they are not read on-chain. A new NVM plan with a different ratio requires updating `constants.ts`.

## Testing

### Setup Examples

**Mock network context:**
```typescript
import { dataSourceMock } from "matchstick-as/assembly/index";

dataSourceMock.setNetwork("gnosis");  // or "base", "matic", "optimism", "mainnet", "arbitrum-one", "celo"
```

**Mock contract calls:**
```typescript
import { createMockedFunction } from "matchstick-as/assembly/index";
import { Address, ethereum, BigInt } from "@graphprotocol/graph-ts";

// Mock Chainlink price feed
createMockedFunction(
  Address.fromString("0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"),
  "latestRoundData",
  "latestRoundData():(uint80,int256,uint256,uint256,uint80)"
)
  .returns([
    ethereum.Value.fromI32(0),
    ethereum.Value.fromSignedBigInt(BigInt.fromString("200000000000")), // $2000 ETH
    ethereum.Value.fromI32(0),
    ethereum.Value.fromI32(0),
    ethereum.Value.fromI32(0)
  ]);
```

For more test patterns, see [CLAUDE.md](./CLAUDE.md#testing-notes).

## Deployment

Production deployments use GitHub Actions:

1. Go to Actions tab
2. Select "Run workflow"
3. Choose environment, subgraph, version, manifest

Naming convention: `marketplace-{network}-v{version}` (e.g., `marketplace-gnosis-v1_0_0`)

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Detailed technical context for developers and AI assistants

## License

MIT
