# Contributing to `autonolas-subgraph`

First off, thank you for taking the time to contribute! This document describes how to propose changes, report issues,
and participate in the development of this repository.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Repository Structure](#repository-structure)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Security & Responsible Disclosure](#security--responsible-disclosure)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
  - [Prerequisites](#prerequisites)
  - [Install](#install)
  - [Build](#build)
  - [Test](#test)
- [Subgraph Development Guide](#subgraph-development-guide)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages & Branching](#commit-messages--branching)
- [Deployment](#deployment)
- [License](#license)
- [Contact](#contact)

---

## Code of Conduct

This project adheres to the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to **security@valory.xyz**.

---

## Repository Structure

This is a monorepo of [The Graph](https://thegraph.com/) subgraphs for the Autonolas/Olas ecosystem. Each subgraph indexes on-chain events from Olas smart contracts across multiple EVM networks.

```
subgraphs/
├── marketplace/         # Mech marketplace (Gnosis, Base, Polygon, Optimism, Ethereum, Arbitrum, Celo)
├── mech/                # Legacy mech subgraph (Gnosis)
├── mech-marketplace/    # Older marketplace implementation
├── autonolas/           # Component/Agent registry (Gnosis)
├── autonolas-base/      # Component/Agent registry (Base)
├── predict-omen/        # Omen prediction market tracking
├── predict-polymarket/  # Polymarket prediction tracking
├── service-registry/    # Service registry events
├── staking/             # Staking contracts
├── tokenomics/          # Tokenomics contracts
└── babydegen-mode/      # Baby Degen on Mode
abis/                    # Shared ABI files referenced by subgraphs
```

Each subgraph is an **independent package** with its own `package.json`, `schema.graphql`, manifest files (`subgraph.*.yaml`), and tests. All work is done from within a subgraph directory.

---

## How Can I Contribute?

### Reporting Bugs

1. **Search existing issues** to avoid duplicates.
2. **Open a new issue** with a clear title and description.
3. Include the affected subgraph, network, and any relevant entity IDs or transaction hashes.

### Suggesting Enhancements

- Explain the motivation and expected impact.
- Specify which subgraph(s) and network(s) are affected.
- Consider compatibility with existing indexed data and entity schemas.

### Security & Responsible Disclosure

**Do not** open public GitHub issues for security vulnerabilities. Instead:

- Email **security@valory.xyz** with a detailed report.
- Include the affected subgraph, potential impact, and steps to reproduce.

We aim to acknowledge receipt within 72 hours.

### Pull Requests

1. Fork the repo and create your branch from `main`.
2. If you've added or changed handler logic, add tests.
3. Ensure the subgraph builds and all tests pass locally.
4. Open a PR with a clear description of the change and reasoning.

**PR Checklist:**

- [ ] Self-reviewed, no debug logs or dead code.
- [ ] `yarn codegen && yarn build` passes for all affected network manifests.
- [ ] `yarn test` passes (all Matchstick tests).
- [ ] Schema changes are backward-compatible or migration is documented.
- [ ] New ABIs added to `abis/` and referenced in manifest `abis` sections.
- [ ] New contract addresses added to `constants.ts` with correct network keys.

---

## Development Setup

### Prerequisites

- **Node.js** — pinned via [`.nvmrc`](.nvmrc) at the repo root. Run `nvm use` to switch.
- **Yarn** (v1)
- **Graph CLI**: `yarn global add @graphprotocol/graph-cli` (or use via `npx`)

### Install

```bash
git clone https://github.com/valory-xyz/autonolas-subgraph.git
cd autonolas-subgraph

# Match the pinned Node version
nvm use   # reads .nvmrc

# Navigate to the subgraph you want to work on
cd subgraphs/marketplace

# Install dependencies. Use --frozen-lockfile to fail on any lockfile drift.
yarn install --frozen-lockfile
```

### Local Graph Node (optional)

The repo's [`docker-compose.yaml`](docker-compose.yaml) starts a local `graph-node` + Postgres for local subgraph testing. The Postgres password is read from the `POSTGRES_PASSWORD` environment variable (no checked-in default).

**First-time setup (fresh clone, no existing `./data/postgres`):**

```bash
# Create .env.local at the repo root (gitignored)
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env.local

# Start the stack
docker-compose --env-file .env.local up
```

**Migration for existing dev environments** (i.e. anyone who ran `docker-compose up` before this change):

The Postgres password is initialized into the on-disk `./data/postgres` only on first run. Existing data dirs were initialized with the old hardcoded password `let-me-in`, so you must either keep that value or reset the data dir.

- *Option A — keep existing local data:* set the same password in your `.env.local`:
  ```bash
  echo "POSTGRES_PASSWORD=let-me-in" > .env.local
  ```
- *Option B — fresh start, lose locally indexed data:*
  ```bash
  docker-compose down -v
  rm -rf ./data/postgres
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env.local
  docker-compose --env-file .env.local up
  ```

If you skip this step you'll see graph-node fail with a `password authentication failed for user "graph-node"` error.

### Build

```bash
# Generate TypeScript types from schema and ABIs
yarn codegen

# Build the subgraph (compiles AssemblyScript to WASM)
yarn build

# For multi-network subgraphs, build a specific network manifest
yarn codegen:polygon    # or codegen:optimism, codegen:mainnet, etc.
yarn build:polygon      # or build:optimism, build:mainnet, etc.
```

### Test

```bash
# Run all tests (Matchstick framework)
yarn test

# Run a specific test file
graph test tests/marketplace/mech-marketplace.test.ts
```

---

## Subgraph Development Guide

### Key Concepts

- **Schema** (`schema.graphql`): Defines entities stored by the subgraph. Use `@entity(immutable: true)` for event logs that never change, `@entity(immutable: false)` for aggregated state.
- **Manifests** (`subgraph.*.yaml`): Define data sources (contracts), event handlers, ABIs, and start blocks per network. Multi-network subgraphs have one manifest per network.
- **Handlers** (`src/**/*.ts`): AssemblyScript event handlers that process on-chain events and write entities.
- **Templates**: Dynamic data sources created at runtime (e.g., when a new Mech contract is deployed via a factory).

### Adding a New Network

1. Add contract addresses to `constants.ts`.
2. Update factory/payment-type mappings in `constants.ts`.
3. Add network branches to `utils.ts` (chain ID, marketplace address, factory-to-template mapping).
4. Add fee conversion logic to `fee-utils.ts` if new price feeds or DEX pools are needed.
5. Create a new manifest (`subgraph.<network>.yaml`) using an existing one as template.
6. Look up contract deployment blocks (e.g., via Blockscout API) and set `startBlock` values.
7. Add `codegen:<network>` and `build:<network>` scripts to `package.json`.
8. Verify: `yarn codegen:<network> && yarn build:<network>`.

### Adding a New ABI

1. Place the ABI JSON file in the root `abis/` directory.
2. Reference it in the manifest's data source or template `abis` section.
3. After `yarn codegen`, import the generated types in your handler.

### Common Patterns

- **Cross-handler state transfer**: Use temporary entities (e.g., `PendingMechData`) when data from one event is needed by a handler for a different event in the same transaction.
- **Fee conversion**: All fees are converted to USD via `fee-utils.ts` using Chainlink price feeds, DEX pool queries, or stablecoin pegs depending on the network and payment type.
- **Service ID lookups**: Use `getServiceIdFromMech()` or `getServiceIdFromMultisig()` to resolve service IDs from addresses via mapping entities.

---

## Testing Guidelines

Tests use the [Matchstick](https://thegraph.com/docs/en/developing/unit-testing-framework/) framework (AssemblyScript-based).

- Place test files in `tests/` with `.test.ts` extension.
- Use `clearStore()` in `afterEach` to reset entity state between tests.
- Use `dataSourceMock.setNetwork()` to set the network context (defaults to `mainnet` if not set).
- Use `createMockedFunction()` to mock on-chain contract calls.
- Create prerequisite entities (e.g., `CreateMech`, `CreateMultisigWithAgents`) before testing handlers that depend on them.
- Assert entity state with `assert.fieldEquals(entityType, id, field, expected)` and `assert.entityCount(entityType, count)`.

---

## Commit Messages & Branching

- Use **Conventional Commits**:
  - `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `test: ...`, `chore: ...`
- Branch names:
  - `feat/<short-topic>`, `fix/<short-topic>`, `docs/<short-topic>`
- Reference issues/PRs in the body (e.g., `Closes #123`).

---

## Deployment

Production deployments go through **GitHub Actions**:

1. Go to the Actions tab -> "Run workflow"
2. Select environment (`production` / `staging`), subgraph, version, and manifest
3. Production deployments are only allowed from the `main` branch

Naming convention: `{subgraph}-{network}-{version}` (e.g., `marketplace-gnosis-v0_1_2`)

Deployed subgraphs are available at:
```
https://subgraph.autonolas.tech/subgraphs/name/{SUBGRAPH_NAME}
```

---

## License

This project is licensed under the terms specified in `LICENSE`.

---

## Contact

- General questions: **info@valory.xyz**
- Security: **security@valory.xyz**

Thank you for contributing!
