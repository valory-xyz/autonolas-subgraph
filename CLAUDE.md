# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a monorepo of **The Graph subgraphs** for the Autonolas/Olas ecosystem. Each subgraph indexes on-chain events from Olas smart contracts across multiple EVM networks (Gnosis, Base, Mode).

## Project Structure

```
subgraphs/
├── marketplace/     # Main mech marketplace (Gnosis + Base) - most actively developed
├── mech/            # Legacy mech subgraph (Gnosis only)
├── mech-marketplace/# Older marketplace implementation
├── autonolas/       # Component/Agent registry (Gnosis)
├── autonolas-base/  # Component/Agent registry (Base)
├── service-registry/# Service registry events
├── staking/         # Staking contracts
├── tokenomics/      # Tokenomics contracts
└── babydegen-mode/  # Baby Degen on Mode
```

Each subgraph is an independent package with its own `package.json`, `schema.graphql`, and manifest files (`subgraph.*.yaml`).

## Common Commands

All commands are run from within a subgraph directory (e.g., `subgraphs/marketplace/`):

```bash
# Install dependencies
yarn install

# Generate TypeScript types from schema and ABIs
yarn codegen

# Build the subgraph (compiles to WASM)
yarn build

# Run tests (uses Matchstick framework)
yarn test

# Run a single test file
graph test <test-file-path>
# Example: graph test tests/fees/fee-utils.test.ts

# Local deployment
yarn create-local   # Create subgraph on local node
yarn deploy-local   # Deploy to local Graph node
```

For building specific network manifests:
```bash
graph build subgraph.gnosis.yaml
graph build subgraph.base.yaml
```

## Testing with Matchstick

Tests use the [Matchstick](https://thegraph.com/docs/en/developing/unit-testing-framework/) framework (AssemblyScript-based).

Test files are in `tests/` directories with `.test.ts` extension. Key patterns:
- `clearStore()` - Reset entity store between tests
- `dataSourceMock.setNetwork()` - Mock network context (gnosis, base)
- `createMockedFunction()` - Mock contract calls
- `assert.fieldEquals(entityType, id, field, expected)` - Assert entity field values

## Architecture Notes

### Marketplace Subgraph (Primary)

The `marketplace` subgraph is the most complex, handling:

1. **Two mech generations**:
   - Legacy AgentMech (Gnosis only) - simple uint256 request IDs
   - Marketplace Mechs (Gnosis + Base) - bytes32 request IDs, multiple payment types

2. **Dynamic Data Sources**: Mech contracts are created dynamically via `MechFactory`. The subgraph uses templates (`MechFixedPriceNative`, `MechFixedPriceToken`, etc.) that get instantiated when `CreateMech` events are detected.

3. **Fee Tracking**: All fees are converted to USD using:
   - Gnosis xDAI: 1:1 peg
   - Base ETH: Chainlink price feed
   - OLAS tokens: Balancer V2 pool prices
   - NVM Credits: Contract-defined token ratios

4. **Request/Delivery Lifecycle**:
   - **On-chain**: `MarketplaceRequest` -> `Deliver` -> `MarketplaceDelivery`
   - **Off-chain (signed)**: `MarketplaceDeliveryWithSignatures` (no prior request event)
   - Fee tracking only applies to on-chain marketplace requests (scope guard in `updateFeesOnDelivery`)

5. **ATA (Autonomous Transaction Agent) Tracking**: Counts transactions made by service multisigs. Uses `AtaTransaction` entity to deduplicate per tx hash. A sender is an ATA if `CreateMultisigWithAgents` entity exists for their address.

6. **IPFS Metadata Parsing**: Request/delivery data stored on IPFS. Parsed into `ParsedRequest` (prompt, tool) and `ParsedDelivery` (model, response) entities.

### Entity Patterns

- **Immutable entities** (`@entity(immutable: true)`): Event logs, never updated
- **Mutable entities** (`@entity(immutable: false)`): Aggregated state like `Request`, `Mech`, `Global`

Common entity relationships:
- `Request` links to `RequestToMech` (legacy) or `RequestToMarketplace` (marketplace)
- `Deliver` links to `DeliverForMech` or `DeliverForMarketplace`
- All mechs/requests link to `Service` via service ID

### Key Files in Marketplace

```
src/marketplace/
├── mech-marketplace.ts    # Main marketplace event handlers
├── utils.ts               # Shared utilities, entity helpers
├── fee-utils.ts           # USD conversion functions
├── constants.ts           # Contract addresses, token ratios
└── mech-*.ts              # Payment-type-specific handlers
```

## Deployment

Production deployments go through GitHub Actions:
1. Actions tab -> "Run workflow"
2. Select environment (production/staging), subgraph, version, manifest

Naming convention: `{subgraph}-{network}-{version}` (e.g., `marketplace-gnosis-v0_1_2`)

## ABIs

Shared ABIs are in the root `abis/` directory. Subgraph-specific ABIs may be in subgraph directories.

**ABI Versioning**: The marketplace handles V1/V2 ABI differences for events like `MarketplaceDelivery`, `MarketplaceRequest`, and `Deliver`. Block ranges in manifests define when each version is active. Separate handlers ensure type safety (e.g., `handleDeliverWithSignaturesV1` vs `handleDeliverWithSignaturesV2`).

When adding external contract calls (e.g., Chainlink, Balancer), add the ABI and reference it in the manifest's `templates` section.
