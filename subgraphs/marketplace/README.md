# Marketplace Subgraph

A Graph Protocol subgraph for indexing the Olas Mech Marketplace on **Gnosis** and **Base** networks.

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

| Entity | Description |
|--------|-------------|
| `Service` | Olas service with mech(s), requests, and deliveries |
| `Request` | A request to a mech for AI inference |
| `Deliver` | Delivery of a request response |
| `Mech` / `MarketplaceMech` | Mech contract instance |
| `Sender` | Address that has made requests |

### Key Relationships

```
Service
├── mechs: [MarketplaceMech]
├── requests: [Request]  (via mech linkage)
└── deliveries: [Deliver]

Request
├── sender: Sender
├── service: Service
├── marketplaceRequest: RequestToMarketplace
└── delivery: Deliver

Deliver
├── request: Request
├── service: Service
└── marketplaceDeliver: DeliverForMarketplace
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
| Base | ETH | Chainlink price feed |
| Any | OLAS | Balancer V2 pool prices |
| Any | NVM Credits | Contract token ratios |

## Project Structure

```
src/
├── marketplace/
│   ├── mech-marketplace.ts    # Main marketplace handlers
│   ├── utils.ts               # Shared utilities
│   ├── fee-utils.ts           # USD conversion
│   ├── constants.ts           # Contract addresses
│   └── mech-*.ts              # Mech template handlers
├── utils.ts                   # Root utilities
└── *.ts                       # Other handlers

tests/
├── marketplace/               # Marketplace tests
├── fees/                      # Fee utility tests
└── *.test.ts                  # Other tests
```

## Deployment

Production deployments use GitHub Actions:

1. Go to Actions tab
2. Select "Run workflow"
3. Choose environment, subgraph, version, manifest

Naming convention: `marketplace-{network}-v{version}` (e.g., `marketplace-gnosis-v1_0_0`)

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Detailed technical context for AI assistants
- [docs/](./docs/) - Additional documentation

## License

MIT
