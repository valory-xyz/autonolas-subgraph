# Olas Mech Marketplace Subgraph

A GraphQL subgraph for indexing and querying data from the Olas Mech Marketplace ecosystem on Gnosis Chain and Base.

## Overview

The Olas Mech Marketplace Subgraph tracks on-chain activity related to autonomous AI agents (Mechs) and their marketplace interactions. This subgraph provides a comprehensive view of mech creation, service requests, deliveries, and marketplace transactions across the Olas ecosystem.

## Supported Networks

- **Gnosis Chain**
- **Base**

## Tracked Contracts

### Core Contracts

1. **MechMarketplace** (v1 and v2)
   - **Gnosis**: `0x735FAAb1c4Ec41128c367AFb5c3baC73509f70bB`
   - **Base**: `0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020`
   - Handles mech creation, senders, marketplace requests, and deliveries

2. **ServiceRegistryL2** 
   - **Gnosis**: `0x9338b5153AE39BB89f50468E608eD9d764B755fD`
   - **Base**: `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE`
   - Manages service lifecycle

3. **ComplementaryServiceMetadata**
   - **Gnosis**: `0x0598081D48FB80B0A7E52FAD2905AE9beCd6fC69`
   - **Base**: `0x28C1edC7CEd549F7f80B732fDC19f0370160707d`
   - Stores additional metadata for services

### Dynamic Contract Templates

The subgraph also dynamically tracks individual Mech contracts created through the marketplace. Mech smart contracts can be distinguish by their payment model as follows:

- **MechFixedPriceNative** - Mechs with fixed native token pricing (supported on both Base and Gnosis)
- **MechFixedPriceToken** - Mechs with fixed ERC-20 OLAS token pricing  (supported on both Base and Gnosis)  
- **MechNvmSubscriptionNative** - Mechs with nvm native (xDAI) token subscription model  (supported on Gnosis)
- **MechNvmSubscriptionTokenUSDC** - Mechs with USDC subscription model (supported on Base)

## Entities

### Core Entities

#### Mech & Service Management
- `Mech` - Individual mech instances with addresses and metadata
- `Service` - Service configurations and hashes
- `CreateMech` - Mech creation events
- `Metadata` - Service metadata associations

#### Request & Delivery System
- `Request` - Service requests made to mechs
- `Deliver` - Delivery responses by mechs
- `MarketplaceRequest` - Batch requests through the marketplace
- `MarketplaceDelivery` - Batch deliveries through the marketplace
- `MarketplaceDeliveryWithSignatures` - Delivery off-chain requests with signatures

#### User & Analytics
- `Sender` - Request senders with aggregated statistics
- `Global` - Global marketplace statistics and counters

### Service Registry Entities

#### Service Lifecycle
- `CreateService` - Service creation events
- `UpdateService` - Service configuration updates
- `DeployService` - Service deployment events
- `TerminateService` - Service termination events
- `ActivateRegistration` - Service registration activation

#### Operator Management
- `RegisterInstance` - Agent instance registrations
- `OperatorUnbond` - Operator unbonding events
- `OperatorSlashed` - Operator slashing events
- `CreateMultisigWithAgents` - Multisig creation for services

#### Financial Operations
- `Deposit` - Deposits to service registry
- `Refund` - Refunds from service registry
- `Drain` - Fund drainage events

#### Administrative
- `Transfer` - NFT transfers
- `Approval` - NFT approvals
- `ApprovalForAll` - Bulk NFT approvals
- `BaseURIChanged` - Metadata URI updates
- `OwnerUpdated` / `ServiceRegistryL2OwnerUpdated` - Ownership changes
- `ManagerUpdated` - Manager role updates
- `DrainerUpdated` - Drainer role updates

### Marketplace Administration
- `MarketplaceParamsUpdated` - Marketplace parameter changes
- `ImplementationUpdated` - Contract implementation updates
- `SetMechFactoryStatuses` - Mech factory status changes
- `SetPaymentTypeBalanceTrackers` - Payment tracking configurations

## Key Features

### Real-time Tracking
- Mech creation and deployment
- Service requests and deliveries through the MarketPlace
- Marketplace transactions
- Payment flows (native tokens and USDC)

### Analytics & Aggregations
- Global marketplace statistics
- Per-sender request/delivery counts
- Transaction volume tracking
- Service lifecycle monitoring

### Multi-Chain Support
- Consistent schema across Gnosis and Base
- Network-specific contract addresses
- Cross-chain analytics capabilities

## Deployment

### Prerequisites
- Node.js and Yarn
- Graph CLI (`@graphprotocol/graph-cli`)

### Scripts

```bash
# Generate TypeScript types from schema
yarn codegen subgraph.{network}.yaml

# Build the subgraph
yarn build subgraph.{network}.yaml

# Generate network-specific manifests
yarn generate-manifests

# Deploy to Gnosis
yarn deploy-gnosis

# Deploy to Base  
yarn deploy-base

# Run tests
yarn test
```

## GraphQL Queries

### Example Queries

#### Get Recent Mech Creations
```graphql
query RecentMechs {
  createMechs(first: 10, orderBy: blockTimestamp, orderDirection: desc) {
    id
    mech
    serviceId
    mechFactory
    blockTimestamp
  }
}
```

#### Get Global Statistics
```graphql
query GlobalStats {
  globals {
    id
    totalMechs
    totalMarketplaceRequests
    totalMarketplaceDeliveries
    totalMarketplaceDeliveriesWithSignatures
    totalRequests
    totalDeliveries
    MMActivityCount
    totalAtaTransactions
  }
}
```

#### Get Sender Activity
```graphql
query SenderActivity($address: Bytes!) {
  sender(id: $address) {
    totalRequests
    totalMarketplaceRequests
    totalOffChainRequests
    requests(first: 10, orderBy: blockTimestamp, orderDirection: desc) {
      requestId
      ipfsHash
      mech
      blockTimestamp
    }
  }
}
```

#### Get MarketplaceRequests
```graphql
query MarketplaceRequests {
  marketplaceRequests {
    id
    priorityMech
    numRequests
    requester
    requestIds
    # sender object is no longer embedded here; query Sender separately if needed
  }
}
```

#### Get MarketplaceDeliveries
```graphql
query MarketplaceDeliveries {
  marketplaceDeliveries {
    id
    deliveryMech
    requesters
    numDeliveries
    requestIds
  }
}
```

#### Get Requests
```graphql
query Requests {
  requests {
    id
    requestId
    mech
    blockTimestamp
    sender {
      id
      totalRequests
    }
  }
}
```

#### Get Deliveries
```graphql
query Deliveries {
  deliveries {
    id
    requestId
    mech
    blockTimestamp
    deliveryRate
    ipfsHash
    request {
      id
      requestId
    }
  }
}
```

## Development

### File Structure
- `schema.graphql` - GraphQL schema definition
- `src/` - TypeScript event handlers
- `abis/` - Contract ABI files
- `subgraph.*.yaml` - Network-specific configurations
- `tests/` - Subgraph tests

### Testing
The subgraph includes comprehensive tests using Matchstick:
```bash
yarn test
```