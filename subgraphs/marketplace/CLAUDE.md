# Marketplace Subgraph

This document provides context for the marketplace subgraph, the most complex subgraph in the Autonolas ecosystem.

## Overview

The marketplace subgraph indexes mech marketplace activity on **Gnosis**, **Base**, **Polygon**, and **Optimism** networks. It tracks:
- Mech creation and registration
- Request/delivery lifecycle (on-chain and off-chain/signed)
- Service activity metrics
- ATA (Autonomous Transaction Agent) counting
- IPFS metadata parsing for prompts/responses

## Architecture

### Data Sources (defined in `subgraph.*.yaml`)

1. **MechMarketplace** (V1/V2) - Main marketplace contract events
   - `CreateMech` - Registers new mechs
   - `MarketplaceRequest` - On-chain request batches
   - `MarketplaceDelivery` - On-chain delivery confirmations
   - `MarketplaceDeliveryWithSignatures` - Off-chain/signed deliveries
   - `Deliver` (with signatures) - Individual signed delivery events

2. **ServiceRegistryL2** - Service lifecycle events
   - `CreateService` - Creates Service entity
   - `CreateMultisigWithAgents` - Maps multisig address → serviceId
   - `RegisterInstance` - Tracks agent instances
   - `TerminateService` - Clears agent set

3. **Mech Templates** (dynamic data sources) - Per-mech events
   - `MechFixedPriceNative` - Native token payment
   - `MechFixedPriceToken` - ERC20 token payment
   - `MechNvmSubscriptionNative` - NVM subscription (native)
   - `MechNvmSubscriptionTokenUSDC` - NVM subscription (USDC)

### Key Entity Relationships

```
Service (id: serviceId as string)
    ├── Mech (id: serviceId, links via mech.service)
    │   └── maxDeliveryRateUSD (USD-converted rate for cross-payment-type comparison)
    ├── Request[] (links via request.service)
    └── CreateMultisigWithAgents (id: multisig address)

Request (id: requestId bytes as hex)
    ├── RequestToMarketplace (marketplace-specific fields)
    ├── Deliver[] (links via deliver.request)
    ├── ParsedRequest (IPFS-parsed prompt/tool)
    └── Sender (requester address)

Deliver (id: txHash + logIndex)
    ├── DeliverForMarketplace (marketplace-specific fields)
    ├── ParsedDelivery (IPFS-parsed response/model)
    └── Request (links via deliver.request)

CreateMech (id: mech address)
    └── Maps mech address → serviceId

CreateMultisigWithAgents (id: multisig address)
    └── Maps multisig address → serviceId
```

## Fee Conversion and USD Tracking

The subgraph converts all fees to USD for cross-payment-type comparison and mech discoverability.

### Max Delivery Rate USD

Each `Mech` entity has a `maxDeliveryRateUSD: BigDecimal` field that stores the USD-converted maximum delivery rate. This enables:
- Comparing mechs across different payment types (NATIVE, USDC, TOKEN, CREDITS)
- Filtering mechs by price in USD queries
- Mech discoverability based on pricing

**Calculation:**
- Uses `calculateMaxDeliveryRateUSD(maxDeliveryRate, mechFactory)` helper from `utils.ts`
- Detects fee unit from mech factory type (NATIVE, USDC, TOKEN, CREDITS)
- Converts using `convertFeeToUsd()`:
  - Gnosis xDAI: 1:1 USD peg
  - Base ETH: Chainlink price feed
  - USDC: 1:1 USD peg
  - OLAS tokens: Balancer V2 pool prices
  - NVM Credits: Contract-defined token ratios

**Updated when:**
1. `handleCreateMech` - Initial mech creation
2. `updateMaxDeliveryRate` - `MaxDeliveryRateUpdated` event received
3. `refreshMechDeliveryRate` - Rate observed during `Deliver` event

## Critical Code Paths

### 1. Request Flow

**Marketplace Request** (`handleMarketplaceRequest` in `mech-marketplace.ts`):
```
MarketplaceRequest event
    → Creates Request entity for each requestId
    → Gets serviceId via getServiceIdFromMultisig(requester)
    → If serviceId found: sets request.service AND increments Service.totalRequests
    → Creates RequestToMarketplace entity (isMarketplace=true)
    → Updates Sender counters
    → Updates Global counters
```

**Mech Template Request** (`handleTemplateRequest` → `processOnChainRequest` in `utils.ts`):
```
Request event (from mech contract)
    → Gets/creates Request entity
    → Gets serviceId via getServiceIdFromMech(mech)
    → Sets request.service = serviceId
    → Does NOT increment Service.totalRequests
    → Attaches IPFS data, parses request content
```

### 2. Delivery Flow

**Marketplace Delivery** (`handleMarketplaceDelivery`):
```
MarketplaceDelivery event
    → Marks each delivered request as isDelivered=true
    → Updates Mech counters (receivedRequests, selfDelivered, deliveredByOthers)
    → Increments Service.totalDeliveries for delivery mech's service
    → Creates DeliverForMarketplace entity
```

**Mech Template Delivery** (`handleTemplateDeliver` → `processOnChainDeliver`):
```
Deliver event (from mech contract)
    → Creates Deliver entity
    → Attaches to Request, marks as delivered
    → Sets deliver.service via getServiceIdFromMech
    → Increments Service.totalDeliveries (if not marketplace tx)
    → Parses IPFS delivery content
```

**Signed Delivery** (`handleMarketplaceDeliveryWithSignatures` or `handleDeliverWithSignaturesV*`):
```
Off-chain request/delivery pair
    → Creates Request and Deliver entities
    → No prior MarketplaceRequest event needed
    → Updates counters as if both request and delivery happened
```

### 3. Service ID Lookup Functions

| Function | Lookup Key | Entity | Purpose |
|----------|------------|--------|---------|
| `getServiceIdFromMultisig(address)` | Multisig address | `CreateMultisigWithAgents` | Find service from requester address |
| `getServiceIdFromMech(address)` | Mech address | `CreateMech` | Find service from mech address |
| `isServiceMultisig(address)` | Multisig address | `CreateMultisigWithAgents` | Check if address is a service multisig |

## Important: Service.totalRequests Semantics

`Service.totalRequests` counts requests made **BY** the service's multisig (demand-side), NOT requests **TO** the service's mech (supply-side).

**To count requests received by a service's mech, use:**
```graphql
requests(where: {service_: {id: "175"}}, first: 1000) {
  id
}
```

**NOT:**
```graphql
service(id: "175") {
  totalRequests  # This only counts requests BY the service
}
```

## File Structure

```
src/
├── marketplace/
│   ├── mech-marketplace.ts         # Main marketplace handlers
│   ├── utils.ts                    # Shared utilities, processOnChain* functions
│   ├── constants.ts                # Contract addresses per network
│   ├── fee-utils.ts                # USD conversion functions (feature branch)
│   ├── mech-fixed-price-native.ts  # Native payment mech template
│   ├── mech-fixed-price-token.ts   # Token payment mech template
│   ├── mech-nvm-subscription-*.ts  # NVM subscription mech templates
│   ├── service-registry-l-2.ts     # Service registry handlers
│   ├── complementary-service-metadata.ts
│   └── karma.ts                    # Karma tracking handlers
├── utils.ts                        # Root-level utilities
├── agent-mech.ts                   # Legacy AgentMech handlers (Gnosis only)
├── agent-registry.ts               # Agent registry handlers
├── agent-factory.ts                # Legacy mech factory handlers
└── registryL2.ts                   # L2 registry handlers

tests/
├── marketplace/                    # Marketplace-specific tests
│   ├── mech-marketplace.test.ts
│   ├── mech-fixed-price-native.test.ts
│   └── ...
├── fees/                           # Fee utility tests (feature branch)
├── *.test.ts                       # Other test files
├── *-utils.ts                      # Test utilities
└── ipfs_mocks/                     # Mock IPFS data for tests
```

## Common Commands

```bash
# Install dependencies
yarn install

# Generate types from schema and ABIs
yarn codegen

# Build subgraph
yarn build

# Run all tests
yarn test

# Run specific test file
graph test tests/marketplace/mech-marketplace.test.ts

# Build specific network manifest
graph build subgraph.gnosis.yaml
graph build subgraph.base.yaml
```

## API Versions

Both networks use Graph Protocol API version `0.0.9`:

| Network | API Version |
|---------|-------------|
| Gnosis  | 0.0.9       |
| Base    | 0.0.9       |

**Note**: Base was originally deployed with `apiVersion: 0.0.7` but was upgraded to `0.0.9` to fix WASM memory corruption bugs that caused entity save operations to corrupt memory pointers.

## Entity Mutability

- **Immutable** (`@entity(immutable: true)`): Event logs that never change
  - `MarketplaceRequest`, `MarketplaceDelivery`, `CreateService`, `Transfer`, etc.
  - `ParsedRequest`, `ParsedDelivery`, `AtaTransaction`

- **Mutable** (`@entity(immutable: false)`): Aggregated state that updates
  - `Request`, `Deliver`, `Mech`, `Service`, `Global`, `Sender`

## Testing Notes

Tests use Matchstick framework. Key patterns:
- `clearStore()` - Reset entity store between tests
- `dataSourceMock.setNetwork()` - Mock network context (gnosis, base)
- `createMockedFunction()` - Mock contract calls
- Tests must explicitly create `CreateMultisigWithAgents` entities for `getServiceIdFromMultisig` to work
- Tests must create `CreateMech` entities for `getServiceIdFromMech` to work

## Contract Addresses

### Gnosis
- Marketplace: `0x735FAAb1c4Ec41128c367AFb5c3baC73509f70bB`
- MechFactory (FixedPriceNative): `0x8b299c20F87e3fcBfF0e1B86dC0acC06AB6993EF`
- MechFactory (FixedPriceToken): `0x31ffDC795FDF36696B8eDF7583A3D115995a45FA`
- MechFactory (NvmSubscriptionNative): `0x65fd74C29463afe08c879a3020323DD7DF02DA57`

### Base
- Marketplace: `0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020`
- MechFactory (FixedPriceNative): `0x2E008211f34b25A7d7c102403c6C2C3B665a1abe`
- MechFactory (FixedPriceToken): `0x97371B1C0cDA1D04dFc43DFb50a04645b7Bc9BEe`
- MechFactory (FixedPriceTokenUSDC): `0x5B70A66fe68c4c86FFd724B58cc56049c70e9D3D`
- MechFactory (NvmSubscriptionNative): `0x847bBE8b474e0820215f818858e23F5f5591855A`
- MechFactory (NvmSubscriptionTokenUSDC): `0x7beD01f8482fF686F025628e7780ca6C1f0559fc`

### Polygon
- Marketplace: `0x343F2B005cF6D70bA610CD9F1F1927049414B582`
- MechFactory (FixedPriceNative): `0x87f89F94033305791B6269AE2F9cF4e09983E56e`
- MechFactory (FixedPriceToken): `0xa0DA53447C0f6C4987964d8463da7e6628B30f82`
- MechFactory (FixedPriceTokenUSDC): `0x85899f9d8C058A5BBBaF344ea0f0b63c0CcBe851`
- MechFactory (NvmSubscriptionTokenUSDC): `0x43fB32f25dce34EB76c78C7A42C8F40F84BCD237`

### Optimism
- Marketplace: `0x46C0D07F55d4F9B5Eed2Fc9680B5953e5fd7b461`
- MechFactory (FixedPriceNative): `0xf76953444C35F1FcE2F6CA1b167173357d3F5C17`
- MechFactory (FixedPriceToken): `0x26Ea2dC7ce1b41d0AD0E0521535655d7a94b684c`
- MechFactory (FixedPriceTokenUSDC): `0x93111f6C267068A5d7356114D61d0f09bFD53a54`
- MechFactory (NvmSubscriptionTokenUSDC): `0x02C26437B292D86c5F4F21bbCcE0771948274f84`
