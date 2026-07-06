# Marketplace Subgraph

This document provides context for the marketplace subgraph, the most complex subgraph in the Autonolas ecosystem.

## Overview

The marketplace subgraph indexes mech marketplace activity on **Gnosis**, **Base**, **Polygon**, **Optimism**, **Ethereum**, **Arbitrum**, and **Celo** networks. It tracks:
- Mech creation and registration
- Request/delivery lifecycle (on-chain and off-chain/signed)
- Service activity metrics
- ATA (Autonomous Transaction Agent) counting
- Mech karma tracking
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
   - `UpdateService` - Service configuration changes
   - `Transfer` - Service ownership transfer
   - Note: handlers for `ActivateRegistration`, `DeployService`, `Deposit`, and `OwnerUpdated` exist in `service-registry-l-2.ts` but are not wired in any manifest

3. **MechFactory** - Factory contracts that emit type-specific `CreateMech*` events (e.g. `CreateMechFixedPriceNative`) with `maxDeliveryRate`, all handled by `handleMechFactoryCreate`
   - `MechFactoryFixedPriceNative` - Native token payment factory
   - `MechFactoryFixedPriceToken` - ERC20 token payment factory
   - `MechFactoryFixedPriceTokenUSDC` - USDC payment factory
   - `MechFactoryNvmSubscriptionNative` - NVM subscription (native) factory
   - `MechFactoryNvmSubscriptionTokenUSDC` - NVM subscription (USDC) factory

4. **Mech Templates** (dynamic data sources) - Per-mech events
   - `MechFixedPriceNative` - Native token payment
   - `MechFixedPriceToken` - ERC20 token payment
   - `MechNvmSubscriptionNative` - NVM subscription (native)
   - `MechNvmSubscriptionTokenUSDC` - NVM subscription (USDC)
   - Each template handles: `Request`, `Deliver`, `RevokeRequest`, `MaxDeliveryRateUpdated`

5. **Karma** - Mech karma tracking contract
   - `MechKarmaChanged` - Updates cumulative karma on Mech entity

6. **ComplementaryServiceMetadata** - Service metadata updates
   - `ComplementaryMetadataUpdated` - Updates complementary metadata for services (handler `handleComplementaryMetadataUpdated`)

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

Deliver (id: txHash + logIndex on-chain; txHash + requestId for signed deliveries)
    ├── marketplaceDelivery: DeliverForMarketplace (marketplace-specific fields)
    ├── mechDelivery: DeliverForMech (mech-specific fields)
    ├── parsedDelivery: ParsedDelivery (IPFS-parsed response/model/tool/toolHash; derived, shares the Deliver's id)
    └── request: Request

CreateMech (id: mech address)
    └── Maps mech address → serviceId

CreateMultisigWithAgents (id: multisig address)
    └── Maps multisig address → serviceId

PendingMechData (id: mech address as hex) [temporary]
    └── Cross-handler state transfer for maxDeliveryRate
```

### Cross-Handler State Transfer

MechFactory and MechMarketplace contracts emit mech-creation events in the same transaction:
- **MechFactory** fires first (log index N) with a type-specific `CreateMech*` event (e.g. `CreateMechFixedPriceNative`) carrying the `maxDeliveryRate` param
- **MechMarketplace** fires second (log index N+1) with the plain `CreateMech` event, without `maxDeliveryRate`

To avoid RPC calls (which can fail with "Block gas limit exceeded" on some nodes), we use a temporary `PendingMechData` entity:

1. `handleMechFactoryCreate` creates `PendingMechData` with `maxDeliveryRate` and `createdAtBlock`
2. `handleCreateMech` loads `PendingMechData`, copies `maxDeliveryRate` to `Mech`, then deletes it via `store.remove()`

The `paymentType` is derived from the factory address using a static mapping in `constants.ts` (`getPaymentTypeFromFactory`).

### Adding a New MechFactory (Checklist)

Factory addresses are hardcoded in three independent places, each with a different failure mode. When a new factory contract is deployed on-chain, update the subgraph BEFORE the first mech is created from it:

1. `src/marketplace/constants.ts` — add the address constant and register it in the `factoryMap` inside `getPaymentTypeFromFactory` (key format `<network>:<lowercase address>`; note Polygon's network name is `matic`). **If skipped:** `handleCreateMech` throws `Unknown factory address` on the marketplace `CreateMech` event → fatal indexing halt for the whole network.
2. `src/marketplace/utils.ts` — add a branch in the per-network `create<Network>MechFromFactory` function mapping the factory to the right mech template. **If skipped:** the Mech entity is created but no dynamic data source is instantiated, so the mech's `Request`/`Deliver` events are silently never indexed (only a `log.warning`).
3. `src/marketplace/fee-utils.ts` — add the factory to `getFeeUnitFromMechFactory`. **If skipped:** the fee unit silently falls back to `NATIVE` → wrong USD conversion for every fee from that mech.
4. Add a MechFactory data source block to each affected `subgraph.<network>.yaml` (needed for the `PendingMechData`/`maxDeliveryRate` capture described above).
5. Update the Contract Addresses tables in this file and in README.md.

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
  - Polygon POL: Chainlink price feed
  - Optimism ETH: Chainlink price feed
  - Ethereum ETH: Chainlink price feed
  - Arbitrum ETH: Chainlink price feed
  - Celo CELO: Chainlink price feed
  - USDC: 1:1 USD peg
  - OLAS tokens: Balancer V2 pool prices (Gnosis/Base/Arbitrum), Uniswap V2 (Ethereum), unavailable on Celo
  - NVM Credits: Contract-defined token ratios (lazy-initialized getter functions to avoid WASM memory corruption)

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

### 4. In-Transaction Ordering and Double-Count Guards

For a marketplace request/delivery, TWO handlers fire for the same logical action in one transaction (marketplace-level + mech-template). Three interlocking mechanisms prevent double counting:

- **Classification**: `isMarketplaceTransaction()` (utils.ts) compares `event.transaction.to` against the network's hardcoded marketplace address. Marketplace txs are counted by the marketplace handlers; the mech-template handlers then skip field assignment and counter increments. Known limitation: the check is on the outermost tx `to`, so a marketplace call routed through another contract (e.g. a Safe `execTransaction`) classifies as "direct" — the guards below are what keep counters from double-incrementing in that case.
- **Ordering**: within a marketplace tx, `MarketplaceDelivery` fires BEFORE the mech's `Deliver` event. `handleMarketplaceDelivery` sets `isDelivered = true` but cannot set fees (the event has no `deliveryRate`); the later template `Deliver` carries the rate. The fee write-once guard is therefore `request.finalFeeUSD === null`, NOT `!request.isDelivered` — never simplify one guard into the other.
- **Same-block immutable overwrite**: `DeliverForMarketplace` is `@entity(immutable: true)` yet is written by both `handleMarketplaceDelivery` and `persistMarketplaceDeliver`. This is only legal because both writes happen in the same block — never write it from a handler that can run in a later block.

Also note: `Mech.receivedRequests` and `Service.totalRequests` are incremented only on the marketplace path (`handleMarketplaceRequest`). Direct-to-mech template requests populate the Request entity but increment no Service/Sender/Global request counters (direct deliveries, by contrast, do increment `Service.totalDeliveries` and ATA counters).

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

## Mech Identity and Missing-Mapping Policy

- `Mech.id` = serviceId (string), NOT the mech address. `CreateMech` (id = mech address) is the address→serviceId lookup table. If a service creates a new mech, the Mech entity for that serviceId is overwritten in place (address/factory/paymentType change; counters continue).
- When the `CreateMech` mapping is missing for a mech address, the failure policy is deliberately split:
  - Template `Request`/`Deliver` (`requireServiceId`) and `MaxDeliveryRateUpdated` (`updateMaxDeliveryRate`) **throw** `CreateMech mapping missing` → fatal, network-wide indexing halt. This error signals a manifest bug: a missing factory data source or a too-late `startBlock`.
  - Karma updates (`karma.ts`), `refreshMechDeliveryRate`, and the priority-mech delivery counters (`updateMechCountersOnDelivery`) **skip with a log** instead — Karma events can legitimately reference legacy mechs unknown to this subgraph.
  - Follow the same policy when adding handlers: throw only for events that cannot legitimately precede `CreateMech`.
- `Mech.karma` is the cumulative sum of `MechKarmaChanged` deltas and can go negative.
- `Mech.maxDeliveryRate` is null when `PendingMechData` was missing at `CreateMech` time (factory event unindexed); it self-heals via `refreshMechDeliveryRate` from the next observed `Deliver`'s `deliveryRate`.

## ATA Counting Rules

`AtaTransaction` (id = tx hash) is a global dedup table shared by ALL request, delivery, legacy, and marketplace handlers: each tx hash increments `Global.totalAtaTransactions` at most once, no matter how many qualifying events it contains (the off-chain path below is the one exception, adding 2 in a single increment).

- **Requests** count as ATA only if the requester has a `CreateMultisigWithAgents` entity (i.e. is a known service multisig).
- **On-chain deliveries** count unconditionally — the code assumes the delivering mech is always operated by a service multisig and performs no lookup.
- **Off-chain signed batches** add +1 (delivery side) plus +1 more if the requester is also a service multisig — the only path where one tx can add 2 to `totalAtaTransactions`.
- For a same-tx request+delivery, attribution goes to whichever handler processes the earlier log. The sender-level `totalLegacyAtaTransactions` bump happens only in the handlers that check the requester (the request handlers and the off-chain signed path) — on-chain delivery handlers never bump it, so a delivery-side dedup win skips the sender-level count.
- `totalAtaTransactions` counts transactions, not requests: a batch of 10 requests in one tx adds 1.

## File Structure

```
src/
├── marketplace/
│   ├── mech-marketplace.ts         # Main marketplace handlers
│   ├── mech-factory.ts             # MechFactory CreateMech handler (captures maxDeliveryRate)
│   ├── utils.ts                    # Shared utilities, processOnChain* functions
│   ├── constants.ts                # Contract addresses, payment type mapping
│   ├── fee-utils.ts                # USD conversion functions
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
│   ├── mech-fixed-price-token.test.ts
│   ├── mech-nvm-subscription-*.test.ts
│   ├── shared-mech-event-helpers.ts
│   ├── test-constants.ts
│   ├── ipfs-mock-helpers.ts
│   └── *-utils.ts                  # Per-mech-type test utilities
├── fees/                           # Fee utility tests
│   ├── fee-utils.test.ts
│   ├── fee-tracking.test.ts
│   └── marketplace-fee-scope.test.ts
├── *.test.ts                       # Legacy test files
├── *-utils.ts                      # Legacy test utilities
└── ipfs_mocks/                     # Mock IPFS data for tests

scripts/                            # Verification and debugging scripts
├── verify-subgraph-data.js
├── verify-subgraph-data.test.js
├── verify-mech-counters.js
├── verify-v5-fees.js
├── verify-v5-metrics.sh
├── compare-subgraph-versions.js
├── compare-global-metrics.js
├── compare-mech-services.js
├── check-sync-progress.js
├── debug-service-6-requests.js
└── README.md
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
graph build subgraph.polygon.yaml
graph build subgraph.optimism.yaml
graph build subgraph.mainnet.yaml
graph build subgraph.arbitrum.yaml
graph build subgraph.celo.yaml

# Codegen for specific network
yarn codegen:polygon
yarn codegen:optimism
yarn codegen:mainnet
yarn codegen:arbitrum
yarn codegen:celo
```

## API Versions

| Network  | API Version |
|----------|-------------|
| Gnosis   | 0.0.9       |
| Base     | 0.0.7       |
| Polygon  | 0.0.7       |
| Optimism | 0.0.7       |
| Ethereum | 0.0.7       |
| Arbitrum | 0.0.7       |
| Celo     | 0.0.7       |

## Pruning and Grafting

All 7 manifests set `indexerHints: prune: 300` — graph-node retains only ~300 blocks of entity history. Time-travel queries (`block: {number: N}`) older than that fail; do not build tooling that relies on historical block state.

Recovery grafts have been used to redeploy without a full resync (e.g. shipping the offchain-IPFS file-data-source parsing past a stalled IPFS region on Gnosis — see commit `7e63591`). No manifest currently carries a graft. When adding a `graft:` block:

- `graft.block` must be within the prune window (~300 blocks) of the base deployment's head at deploy time, or graph-node cannot copy the base's entity history.
- The base deployment must be schema-compatible with the current schema — a base predating a schema field fails graph-node's compatibility check.
- Add `grafting` to the manifest's `features:` list or the build fails.
- Grafts are temporary: drop the `graft:` block (and the `grafting` feature) on the next clean redeploy once the recovery purpose is served.

## Entity Mutability

- **Immutable** (`@entity(immutable: true)`): Event logs that never change
  - `MarketplaceRequest`, `MarketplaceDelivery`, `CreateService`, `Transfer`, etc.
  - `ParsedRequest`, `ParsedDelivery`, `AtaTransaction`

- **Mutable** (`@entity(immutable: false)`): Aggregated state that updates
  - `Request`, `Deliver`, `Mech`, `Service`, `Global`, `Sender`

## Testing Notes

Tests use Matchstick framework. Key patterns:
- `clearStore()` - Reset entity store between tests
- `dataSourceMock.setNetwork()` - Mock network context (gnosis, base, matic, optimism, mainnet, arbitrum-one, celo)
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

### Ethereum
- Marketplace: `0x3d6494CE09a9f40c0B5a92BdBD7c7A9b0e3912b1`
- MechFactory (FixedPriceNative): `0x3515a36AF270070635Fa3E957e006aaF6078e658`
- MechFactory (FixedPriceToken/OLAS): `0xddF6c8521195AC613626aE7a8E7d645128bc26fD`
- MechFactory (FixedPriceTokenUSDC): `0xF95BfBBA428dfb454Cd59C9c2d309bd6452d12A8`

### Arbitrum
- Marketplace: `0xf76953444C35F1FcE2F6CA1b167173357d3F5C17`
- MechFactory (FixedPriceNative): `0x4Cd816ce806FF1003ee459158A093F02AbF042a8`
- MechFactory (FixedPriceToken/OLAS): `0x70A0D93fb0dB6EAab871AB0A3BE279DcA37a2bcf`
- MechFactory (FixedPriceTokenUSDC): `0x694e62BDF7Ff510A4EE66662cf4866A961a31653`

### Celo
- Marketplace: `0x17d96ba4532fe91809326092fE4D5606A7B7a0d8`
- MechFactory (FixedPriceNative): `0xDd1252c5a75be568B5E6e50bA542680b38dbd68f`
- MechFactory (FixedPriceToken/OLAS): `0xA123748Ce7609F507060F947b70298D0bde621E6`
- MechFactory (FixedPriceTokenUSDC): `0xE3e5Df46060370af5Fd37B2aA11e7dac3cCB4bd0`
