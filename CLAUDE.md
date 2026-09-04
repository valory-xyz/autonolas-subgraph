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
├── service-registry/    # Service registry analytics (Gnosis, Mode; template-generated manifests)
├── staking/             # Staking contracts (Mode)
├── tokenomics/          # OLAS ERC-20 tracking (Mode)
├── babydegen-mode/      # BabyDegen agent portfolio tracking (Mode)
├── pearl-transactions/  # Pearl wallet transaction-history (Gnosis)
├── predict-omen/        # Omen prediction market trading (Gnosis)
└── predict-polymarket/  # Polymarket prediction market trading (Polygon)

squids/
├── predict-polymarket/  # SQD/Subsquid indexer superseding the predict-polymarket subgraph
└── pearl-transactions/  # SQD indexer for Pearl wallet history on Polygon
```

Each subgraph is an independent package with its own `package.json`, `schema.graphql`, and manifest files (`subgraph.*.yaml`).

## Squids (SQD indexers)

`squids/` holds indexers built on the SQD (Subsquid) Squid SDK — used where
graph-node cannot keep up with chain-wide event volume. They are npm packages
(not yarn) and deploy as Docker images (see each squid's `Dockerfile`,
`deploy/k8s-example.yaml`, and README), not via the subgraph deploy workflows.

`squids/predict-polymarket` supersedes `subgraphs/predict-polymarket`. Key
design difference: DepositWallet→agent linking is derived from the Polymarket
wallet factory's `WalletDeployed` event (owner = agent instance EOA →
`RegisterInstance` → service multisig) instead of the global pUSD `Transfer`
stream. Brier score mirrors predict-omen (`Bet.impliedProbability`,
`DailyProfitStatistic.brierSum/brierCount`, credited on the resolution day)
minus the re-answer reversal fields — resolutions are write-once. Common
commands, from `squids/predict-polymarket/`:

```bash
npm ci && npm run build        # compile
npm run codegen                # TypeORM models from schema.graphql
npm run typegen                # event decoders from the shared ../../abis
npx squid-typeorm-migration apply
node lib/main.js               # processor (single instance only)
npx squid-graphql-server       # GraphQL API
```

`squids/pearl-transactions` supersedes the **Polygon** manifest of
`pearl-transactions` in the separate `autonolas-subgraph-studio` repo (NOT the
older Gnosis-only fork in `subgraphs/pearl-transactions` here — that one is
schema v1 with no `BondMovement`). Gnosis / Base / Optimism stay on
graph-node and are live at `transactions-<network>.subgraph.autonolas.tech`;
only Polygon was unusable (~5 blk/s through the USDC.e-dense range, ~15 days
behind head). Three things about it differ from predict-polymarket and are
easy to trip over:

- **`RPC_POLYGON_HTTP` must be archive-capable.** `getOwners()` is read at
  each Safe's first-sighting block, not `latest` — owner lists change, so
  replaying `AddedOwner`/`RemovedOwner` on top of today's list would be wrong.
- **The two graph-node templates became topic-only subscriptions** with no
  address filter (SQD has no templates). Measured before committing to it:
  unfiltered Safe logs are 0.12 logs/block against 133 for the ERC-20
  sources — templates were never the expensive half. Any address-less
  decode must go through `decodeForeignSafe`, since topic0 does not encode
  indexed-ness and foreign contracts collide.
- **The tracked-address table is held fully in memory** (`EntityCache`),
  shared across batches with a reorg guard. That, not SQD itself, is what
  takes mapping from ~5 to ~2,000 blocks/sec.

CI: `build-squid-image.yaml` builds/pushes the Docker image (manual
workflow_dispatch with `squid` + `version` inputs — `squid` is the folder
name under `squids/`, validated and checked for a Dockerfile, mirroring
`deploy-subgraph.yaml`'s `subgraph` input);
`supply-chain.yml` has a dedicated npm-flavored `squid-audit` job
(npm audit + lockfile-lint) since the yarn matrices don't cover npm trees.

**SQD's ecosystem moves fast** (the SDK generation changed in May 2026:
`@subsquid/evm-processor` is legacy, current is `evm-stream` +
`batch-processor` + `evm-objects`). Before touching squid ingestion or
`@subsquid/*` deps, check the current docs — via the `sqd-docs` MCP server
configured in `.mcp.json`, or https://docs.sqd.dev/llms.txt — rather than
building from prior knowledge of the SDK.

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
# Examples (marketplace) — suffixed scripts exist for :polygon, :optimism,
# :mainnet, :arbitrum, :celo; bare `yarn build` targets subgraph.gnosis.yaml
yarn codegen:polygon && yarn build:polygon
yarn codegen:optimism && yarn build:optimism
yarn codegen:mainnet && yarn build:mainnet
# For gnosis and base, call graph-cli directly with the manifest:
graph codegen subgraph.gnosis.yaml && graph build subgraph.gnosis.yaml
graph codegen subgraph.base.yaml && graph build subgraph.base.yaml
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

7. **IPFS Metadata Parsing**: Request/delivery data stored on IPFS. Parsed into `ParsedRequest` (prompt, tool) and `ParsedDelivery` (model, response, tool, toolHash) entities.

### Service-Registry Subgraph

- **Template-generated manifests**: `subgraph.template.yaml` + `networks.json` rendered via `scripts/generate-manifests.ts` (Mustache) into per-network manifests (gnosis, mode-mainnet).
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
- **Path A (CLOB v2 DepositWallets)**: under v2 the `OrderFilled.maker` is a per-user Polymarket `DepositWallet` (DW), not the service safe. `src/deposit-wallet.ts` (`handleCollateralTransfer`) indexes the global pUSD `Transfer` stream and, for outflows *from* a `TraderAgent` safe (the just-in-time top-up that precedes each bet), records a write-once `DepositWallet` → safe link. `handleOrderFilledV2` then falls back to `DepositWallet.load(maker)` to resolve the funding agent. Store-reads only (no eth_calls / templates); covers both standard and NegRisk v2 exchanges.
- **Agent ID gating**: Only agent ID 86 is tracked. `handleRegisterInstance` creates a `TraderService` gate-keeper entity that `handleCreateMultisigWithAgents` checks before creating a `TraderAgent`.
- UMA ancillary data is parsed into `MarketMetadata` (title, outcomes).
- **No re-answer logic** — Polymarket resolutions are final.
- USDC denominated (6 decimals).
- **Grafted** at block 86236542 onto the paused v1_1_1 base deployment to preserve historical trader data.

### BabyDegen-Mode Subgraph

Most complex DeFi-integration subgraph. Tracks agent portfolios across Balancer V2, Velodrome V2 + Velodrome CL (concentrated liquidity), Sturdy, and LiFi swap routing on Mode. Key entities: `AgentPortfolio`/`AgentPortfolioSnapshot`, `ProtocolPosition`, `TokenBalance`, `SwapTransaction`, `PriceUpdate`. Price discovery happens off DEX pool reserves via `priceDiscovery.ts`/`priceAdapters.ts`.

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

For local development, `docker-compose.yaml` at the repo root spins up Graph Node + Postgres, with graph-node pointed at the Autonolas RPC gateway and using `registry.autonolas.tech` (override via `IPFS_URL`) as its IPFS endpoint.

## ABIs

Shared ABIs are in the root `abis/` directory. Subgraph-specific ABIs may be in subgraph directories.

**ABI Versioning**: The marketplace handles V1/V2 ABI differences for events like `MarketplaceDelivery`, `MarketplaceRequest`, and `Deliver`. Block ranges in manifests define when each version is active. Separate handlers ensure type safety (e.g., `handleDeliverWithSignaturesV1` vs `handleDeliverWithSignaturesV2`).

When adding external contract calls (e.g., Chainlink, Balancer), add the ABI and reference it in the manifest's `templates` section.

## Tooling Versions

All versions are pinned exactly (no carets). Most subgraphs are converged on graph-cli `0.98.1`; `autonolas` and `autonolas-base` remain on the legacy `0.64.0` line pending Tier 3 Wave 3 (a separate multi-week migration that crosses AssemblyScript runtime + manifest specVersion boundaries).

| Subgraph | graph-cli | graph-ts |
|---|---|---|
| `marketplace` | 0.98.1 | 0.37.0 |
| `predict-polymarket` | 0.98.1 | 0.38.2 |
| `predict-omen` | 0.98.1 | 0.38.2 |
| `staking` | 0.98.1 | 0.38.2 |
| `babydegen-mode` | 0.98.1 | 0.38.2 |
| `service-registry` | 0.98.1 | 0.38.2 |
| `tokenomics` | 0.98.1 | 0.38.2 |
| `mech` | 0.98.1 | 0.38.2 |
| `pearl-transactions` | 0.98.1 | 0.38.2 |
| `autonolas` | 0.64.0 | 0.29.1 |
| `autonolas-base` | 0.64.0 | 0.29.1 |

`marketplace` is deliberately held back on `graph-ts 0.37.0` while every other current-gen subgraph runs `0.38.2` — bumping the most actively developed subgraph belongs in its own PR with a focused regression check, not bundled into Tier 3.

`matchstick-as` is converged to `0.6.0` across all subgraphs. Root `package.json` requires Node `>=24.0.0` and pins `@graphprotocol/graph-cli 0.98.1`, `@clack/prompts 0.11.0`, `@types/node 24.3.1`, and `typescript 5.9.3`. Yarn is pinned to `1.22.22` via the root `packageManager` field + Corepack activation in CI/deploy workflows.

## Supply chain & security

PR-time CI gates are concentrated in four workflows:

- [`.github/workflows/build.yml`](.github/workflows/build.yml) — `graph codegen` + `graph build` smoke-test for every deployable (subgraph, manifest) pair.
- [`.github/workflows/ci.yaml`](.github/workflows/ci.yaml) — per-(subgraph, manifest) codegen/build/test matrix; the only workflow that runs Matchstick tests. Tests are opt-in per matrix entry and currently run only for `marketplace` (`subgraph.gnosis.yaml`), `pearl-transactions`, `predict-omen`, and `predict-polymarket` — every other entry is build-only (`test: false`). For `autonolas`/`autonolas-base` this is because graph-cli 0.64.0's bundled matchstick downloader crashes on Linux x64 + Node 24; for the rest, tests just haven't been enabled yet.
- [`.github/workflows/supply-chain.yml`](.github/workflows/supply-chain.yml) — `yarn audit:prod`, install-hook audit, and lockfile-lint matrices — each across the same paths (root + every subgraph) — with an `All checks passed` aggregator job.
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
