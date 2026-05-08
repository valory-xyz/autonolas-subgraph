# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a monorepo of **The Graph subgraphs** for the Autonolas/Olas ecosystem. Each subgraph indexes on-chain events from Olas smart contracts across multiple EVM networks (Ethereum, Gnosis, Base, Polygon, Optimism, Arbitrum, Celo, Mode).

## Project Structure

```
subgraphs/
├── marketplace/         # Main mech marketplace (Ethereum, Gnosis, Base, Polygon, Optimism, Arbitrum, Celo) - most actively developed
├── mech/                # Legacy mech subgraph (Gnosis only)
├── autonolas/           # Component/Agent/Service registry (Ethereum mainnet)
├── autonolas-base/      # Component/Agent registry (Base)
├── service-registry/    # Service registry analytics (Ethereum + 7 L2s, template-generated manifests)
├── staking/             # Staking contracts (Mode)
├── tokenomics/          # OLAS ERC-20 tracking (Mode)
├── babydegen-mode/      # BabyDegen agent portfolio tracking (Mode)
├── predict-omen/        # Omen prediction market trading (Gnosis)
└── predict-polymarket/  # Polymarket prediction market trading (Polygon)
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

For multi-network subgraphs, per-network codegen/build scripts are defined in each subgraph's `package.json`:
```bash
# Examples (marketplace)
yarn codegen:gnosis && yarn build:gnosis
yarn codegen:base && yarn build:base
yarn codegen:polygon && yarn build:polygon
yarn codegen:optimism && yarn build:optimism
yarn codegen:mainnet && yarn build:mainnet
# Or call graph-cli directly with the manifest:
graph build subgraph.gnosis.yaml
```

For `service-registry`, manifests are generated from a template + `networks.json` via `scripts/generate-manifests.ts`.

## Testing with Matchstick

Tests use the [Matchstick](https://thegraph.com/docs/en/developing/unit-testing-framework/) framework (AssemblyScript-based).

Test files are in `tests/` directories with `.test.ts` extension. Key patterns:
- `clearStore()` - Reset entity store between tests
- `dataSourceMock.setNetwork()` - Mock network context (mainnet, gnosis, base, matic, optimism, arbitrum-one, celo, mode-mainnet)
- `createMockedFunction()` - Mock contract calls
- `assert.fieldEquals(entityType, id, field, expected)` - Assert entity field values

## Architecture Notes

### Marketplace Subgraph (Primary)

The `marketplace` subgraph is the most complex, handling:

1. **Two mech generations**:
   - Legacy AgentMech (Gnosis only) - simple uint256 request IDs
   - Marketplace Mechs (all 7 networks: Ethereum, Gnosis, Base, Polygon, Optimism, Arbitrum, Celo) - bytes32 request IDs, multiple payment types

2. **Dynamic Data Sources**: Mech contracts are created dynamically via `MechFactory`. The subgraph uses templates (`MechFixedPriceNative`, `MechFixedPriceToken`, `MechNvmSubscriptionNative`, `MechNvmSubscriptionTokenUSDC`) that get instantiated when `CreateMech` events are detected.

3. **Cross-Handler State Transfer**: `MechFactory.CreateMech` and `MechMarketplace.CreateMech` fire in the same tx (different log indexes). The factory handler stashes `maxDeliveryRate` in a temporary `PendingMechData` entity (mutable), which the marketplace handler reads and deletes when creating the `Mech` entity.

4. **Fee Tracking**: All fees are converted to USD via `src/marketplace/fee-utils.ts`:
   - xDAI (Gnosis): 1:1 peg
   - Native ETH (Ethereum, Base, Optimism, Arbitrum): Chainlink `AggregatorV3Interface` price feeds
   - MATIC (Polygon), CELO (Celo): Chainlink price feeds
   - USDC: 1:1 peg (6 decimals)
   - OLAS tokens: Balancer V2 weighted pool prices
   - NVM subscription credits: contract-defined token ratios

5. **Request/Delivery Lifecycle**:
   - **On-chain**: `MarketplaceRequest` -> `Deliver` -> `MarketplaceDelivery`
   - **Off-chain (signed)**: `MarketplaceDeliveryWithSignatures` (no prior request event)
   - Fee tracking only applies to on-chain marketplace requests (scope guard in `updateFeesOnDelivery`)

6. **ATA (Autonomous Transaction Agent) Tracking**: Counts transactions made by service multisigs. Uses `AtaTransaction` entity to deduplicate per tx hash. A sender is an ATA if `CreateMultisigWithAgents` entity exists for their address.

7. **IPFS Metadata Parsing**: Request/delivery data stored on IPFS. Parsed into `ParsedRequest` (prompt, tool) and `ParsedDelivery` (model, response) entities.

### Service-Registry Subgraph

- **Template-generated manifests**: `subgraph.template.yaml` + `networks.json` rendered via `scripts/generate-manifests.ts` (Mustache) into per-network manifests (mainnet, gnosis, base, matic, optimism, arbitrum-one, celo).
- **Dynamic GnosisSafe template**: Instantiated per multisig at `CreateMultisigWithAgents`, which then indexes `ExecutionSuccess` and `ExecutionFromModuleSuccess` for tx-count metrics.
- **Most-recent-agent selection**: To avoid double-counting in daily aggregates, only the most recently registered agent (via `AgentRegistration.timestamp`) is bound to a `Multisig` at creation.
- **Daily aggregation with join entities**: `DailyServiceActivity`, `DailyUniqueAgents`, `DailyAgentPerformance`, `DailyActiveMultisigs` — each paired with a join entity (`DailyUniqueAgent`, `DailyAgentMultisig`, `DailyActiveMultisig`) using load-or-create to dedupe per-day counts.
- **ERC-8004 identity**: `IdentityRegistryBridger` handlers populate `ERC8004Agent`/`ERC8004Metadata`, auto-seeding `ecosystem: "Olas"` and `serviceRegistry: <serviceId>` on first link.
- Day bucketing: `timestamp / 86400 * 86400` for UTC midnight.

### Prediction Market Subgraphs (`predict-omen`, `predict-polymarket`)

Both follow the same shape — `TraderAgent` -> `Bet` -> settlement -> `DailyProfitStatistic` -> `Global` — but differ in oracle, AMM, and settlement semantics.

- **Two-tier accounting**: `totalTraded`/`totalFees` increment on each bet; `totalTradedSettled`/`totalFeesSettled` only update at oracle resolution. Lets queries separate in-flight from realized PnL.
- **Settlement-time profit attribution**: All PnL is computed when the oracle answer fires, using each `MarketParticipant`'s outcome token balances vs. resolution payouts. The `settled` flag on `MarketParticipant` guards against double-counting.

`predict-omen` (Gnosis, Reality.eth + ConditionalTokens + FPMM AMM):
- `handleLogNewAnswer` is the settlement linchpin.
- **Re-answer handling**: On answer changes via Reality.eth disputes, reverses old daily profit and reapplies the new full-profit calculation on the new answer day. Chains correctly across A->B->C re-answer sequences.
- xDAI denominated (18 decimals).

`predict-polymarket` (Polygon, UMA OptimisticOracleV3 + CTF Exchange order book + NegRiskAdapter):
- **Agents are makers, not takers**: trade direction is inferred from asset flow in `OrderFilled` (if maker gives USDC -> buy).
- **Agent ID gating**: Only agent ID 86 is tracked. `handleRegisterInstance` creates a `TraderService` gate-keeper entity that `handleCreateMultisigWithAgents` checks before creating a `TraderAgent`.
- UMA ancillary data is parsed into `MarketMetadata` (title, outcomes).
- **No re-answer logic** — Polymarket resolutions are final.
- USDC denominated (6 decimals).
- **Grafted** at block 85952819 onto a v1 deployment to preserve historical trader data.

### BabyDegen-Mode Subgraph

Most complex DeFi-integration subgraph. Tracks agent portfolios across Balancer V2, Velocity Finance V2 + concentrated-liquidity, Sturdy, and LiFi swap routing on Mode. Key entities: `AgentPortfolio`/`AgentPortfolioSnapshot`, `ProtocolPosition`, `TokenBalance`, `SwapTransaction`, `PriceUpdate`. Price discovery happens off DEX pool reserves via `priceDiscovery.ts`/`priceAdapters.ts`.

### Entity Patterns

- **Immutable entities** (`@entity(immutable: true)`): Event logs, never updated
- **Mutable entities** (`@entity(immutable: false)`): Aggregated state like `Request`, `Mech`, `Global`

Common entity relationships:
- `Request` links to `RequestToMech` (legacy) or `RequestToMarketplace` (marketplace)
- `Deliver` links to `DeliverForMech` or `DeliverForMarketplace`
- All mechs/requests link to `Service` via service ID

Conventions across subgraphs:
- Singleton `Global` entity uses empty-string id `""` (not `"1"` or `"0"`).
- Daily metric IDs are bucketed to UTC midnight: `timestamp / 86400 * 86400`.
- Temporary cross-handler state (e.g., `PendingMechData`) is mutable so it can be deleted after consumption.

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

Production deployments go through GitHub Actions. There are two related workflows:
- [`.github/workflows/deploy-subgraph.yaml`](.github/workflows/deploy-subgraph.yaml) — primary deploy with a versioned slug (e.g. `marketplace-gnosis-v0_1_2`).
- [`.github/workflows/deploy-subgraph-no-version-label.yaml`](.github/workflows/deploy-subgraph-no-version-label.yaml) — variant for the `autonolas` subgraph that uses an unversioned slug. Identical hardening; differs only in the deploy-slug shape and the `--version-label` flag (hardcoded `v0.0.1`).

To deploy:
1. Actions tab -> "Run workflow"
2. Select environment (production/staging), subgraph, version (only for the primary workflow), manifest
3. Production deployments are gated to the `main` branch (staging deploys allowed from any branch)
4. Both workflows pin the Node version via [`.nvmrc`](.nvmrc), require `yarn install --frozen-lockfile`, set `permissions: contents: read`, validate inputs against regex, and scope `GRAPH_NODE_*` secrets via the GitHub Environment matching the chosen `environment` input

Or use the interactive helper to generate the `gh workflow run` command:
```bash
node scripts/deploy.ts
```

Naming convention: `{subgraph}-{network}-{version}` with dots replaced by underscores in the version (e.g., `marketplace-gnosis-v0_1_2`, `tokenomics-mode-mainnet-v0_1_2`).

Deployed subgraphs are served at `https://subgraph.autonolas.tech/subgraphs/name/{SUBGRAPH_NAME}`.

For local development, `docker-compose.yaml` at the repo root spins up Graph Node + Postgres + IPFS pointed at the Autonolas RPC gateway and `registry.autonolas.tech` for IPFS.

## ABIs

Shared ABIs are in the root `abis/` directory. Subgraph-specific ABIs may be in subgraph directories.

**ABI Versioning**: The marketplace handles V1/V2 ABI differences for events like `MarketplaceDelivery`, `MarketplaceRequest`, and `Deliver`. Block ranges in manifests define when each version is active. Separate handlers ensure type safety (e.g., `handleDeliverWithSignaturesV1` vs `handleDeliverWithSignaturesV2`).

When adding external contract calls (e.g., Chainlink, Balancer), add the ABI and reference it in the manifest's `templates` section.

## Tooling Versions

All versions are pinned exactly (no carets). graph-cli is heterogeneous across subgraphs pending Tier 3 convergence:

| Subgraph | graph-cli | graph-ts |
|---|---|---|
| `marketplace` | 0.98.1 | 0.37.0 |
| `predict-polymarket` | 0.98.1 | 0.38.2 |
| `predict-omen` | 0.97.1 | 0.38.2 |
| `staking` | 0.97.1 | 0.38.1 |
| `babydegen-mode` | 0.97.0 | 0.38.0 |
| `service-registry` | 0.97.0 | 0.38.0 |
| `tokenomics` | 0.97.0 | 0.38.0 |
| `mech` | 0.86.0 | 0.35.1 |
| `autonolas` | 0.64.0 | 0.29.1 |
| `autonolas-base` | 0.64.0 | 0.29.1 |

`matchstick-as` is converged to `0.6.0` across all subgraphs. Root `package.json` requires Node `>=24.0.0` and pins `@graphprotocol/graph-cli 0.98.1`, `@clack/prompts 0.11.0`, `@types/node 24.3.1`, and `typescript 5.9.3`. Yarn is pinned to `1.22.22` via the root `packageManager` field + Corepack activation in CI/deploy workflows.

## Supply chain & security

PR-time CI gates are concentrated in three workflows:

- [`.github/workflows/build.yml`](.github/workflows/build.yml) — `graph codegen` + `graph build` smoke-test for every (subgraph, manifest) pair (17 jobs).
- [`.github/workflows/supply-chain.yml`](.github/workflows/supply-chain.yml) — `yarn audit:prod` matrix across the 11 paths, install-hook audit at root, lockfile-lint matrix, with an `All checks passed` aggregator job.
- [`.github/workflows/gitleaks.yml`](.github/workflows/gitleaks.yml) — gitleaks scan, SHA-pinned binary download.

Local commands:

```bash
yarn audit:prod                  # high/critical advisory gate against .supply-chain/audit-allowlist.json
yarn audit:install-hooks         # diff node_modules against .supply-chain/install-hooks.allowlist
yarn audit:install-hooks:update  # regenerate the install-hooks allowlist after dep changes
```

**Naming gotcha:** the script is `audit:prod`, NOT `audit`. Yarn 1.x's built-in `yarn audit` shadows same-named scripts in `package.json`.

Policy + threat model: [SUPPLY-CHAIN-SECURITY.md](SUPPLY-CHAIN-SECURITY.md). Disclosure: [SECURITY.md](SECURITY.md).

When adding a dep:
1. Update `package.json` (no carets — exact versions only).
2. Run `yarn install` to update the lockfile.
3. If the dep introduces a new install-hook package, run `yarn audit:install-hooks:update` and review the diff before committing.
4. If the dep introduces a high/critical advisory that has no fix, add an allowlist entry to `.supply-chain/audit-allowlist.json` with `id` + `reason` + `added` + `review` (90 days out).
