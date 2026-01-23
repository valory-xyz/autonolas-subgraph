# Marketplace Subgraph

A Graph Protocol subgraph for indexing the Olas Mech Marketplace on **Gnosis**, **Base**, **Polygon**, and **Optimism** networks.

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
| Gnosis | `0x735FAAb1c4Ec41128c367AFb5c3baC73509f70bB` | 35827866 |
| Base | `0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020` | 26642705 |
| Polygon | `0x343F2B005cF6D70bA610CD9F1F1927049414B582` | 66632853 |
| Optimism | `0x46C0D07F55d4F9B5Eed2Fc9680B5953e5fd7b461` | 130872124 |

## Quick Start

### Prerequisites

- Node.js >= 18
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
# Start local Graph node (requires Docker)
docker-compose up -d

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
| `Mech` | Legacy AgentMech instance (Gnosis only, uint256 request IDs) | Mutable (aggregated state) |
| `MarketplaceMech` | Marketplace mech instance (Gnosis/Base, bytes32 request IDs) | Mutable (aggregated state) |
| `Sender` | Address that has made requests | Mutable (aggregated state) |
| `ParsedRequest` | IPFS-parsed request content (prompt, tool) | Immutable (event log) |
| `ParsedDelivery` | IPFS-parsed delivery content (response, model) | Immutable (event log) |
| `MarketplaceRequest` | On-chain marketplace request event | Immutable (event log) |
| `MarketplaceDelivery` | On-chain marketplace delivery event | Immutable (event log) |

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
└── delivery: Deliver

Deliver
├── request: Request
├── service: Service
├── marketplaceDeliver: DeliverForMarketplace
└── parsedDelivery: ParsedDelivery
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
  requests(first: 10, where: {parsedRequest_not: null}) {
    id
    parsedRequest {
      prompt
      tool
    }
    delivery {
      parsedDelivery {
        response
        model
      }
    }
  }
}
```

### Query Semantics

| Field | Meaning |
|-------|---------|
| `Service.totalRequests` | Requests made **BY** the service's multisig |
| `Service.totalDeliveries` | Deliveries made **BY** the service's mech |
| `requests(where: {service_: {id}})` | Requests **TO** the service's mech |

> **Note:** `totalRequests` only counts requests where the requester is a registered service multisig. To count all requests received by a service's mech, query requests directly with the service filter.

## Architecture

### Data Sources

1. **MechMarketplace** - Main marketplace contract
2. **ServiceRegistryL2** - Service lifecycle events
3. **Mech Templates** (dynamic) - Per-mech events
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
| Any | USDC | 1:1 peg |
| Gnosis/Base | OLAS | Balancer V2 pool prices |
| Any | NVM Credits | Contract token ratios |

**Scope:** Fee tracking applies only to on-chain marketplace requests (emitted via `MarketplaceRequest` events). Off-chain signed deliveries and legacy AgentMech requests do not have fee data.

## Testing

### Setup Examples

**Mock network context:**
```typescript
import { dataSourceMock } from "matchstick-as/assembly/index";

dataSourceMock.setNetwork("gnosis");  // or "base"
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
