# Autonolas Registry Subgraph (Ethereum Mainnet)

A GraphQL API for indexing the Autonolas component, agent, and service registries on Ethereum mainnet.

> **Technical reference**: See [CLAUDE.md](CLAUDE.md) for full schema reference, handler details, IPFS metadata resolution, and business rules.

## Quick Overview

- Indexes **ComponentRegistry**, **AgentRegistry**, and **ServiceRegistry** on Ethereum mainnet
- Tracks unit creation, updates, ownership transfers, and IPFS metadata
- Maintains aggregate stats: total components, agents, services, and unique builders
- Service entities include full on-chain state (agents, instances, multisig, threshold)

## Common Queries

### Global Statistics
```graphql
{
  globals {
    totalComponents
    totalAgents
    totalServices
    totalBuilders
  }
}
```

### Service Details
```graphql
{
  service(id: "0x01") {
    serviceId
    publicId
    state
    agentIds
    multisig
    instances
    owner
  }
}
```

### Component/Agent Lookup
```graphql
{
  units(where: { packageType: "agent" }, first: 10) {
    tokenId
    publicId
    packageHash
    owner
  }
}
```

## Development

```bash
yarn install        # Install dependencies
yarn codegen        # Generate TypeScript from schema + ABIs
yarn build          # Compile to WebAssembly
yarn test           # Run tests (note: existing tests are placeholder boilerplate)
yarn create-local   # Create subgraph on local Graph node
yarn deploy-local   # Deploy to local Graph node
yarn deploy-staging # Deploy to staging
yarn deploy-base    # Deploy to Base via Subgraph Studio
yarn remove-local   # Remove from local Graph node
```

### Project Structure
* `src/registry.ts` — All event handlers for Component, Agent, and Service registries
* `schema.graphql` — Unit, Service, Global, Builder entities + `packageType` enum
* `abis/` — ComponentRegistry, AgentRegistry, ServiceRegistry ABIs

### Entity ID Formats
- **Unit IDs** are prefixed: `cm` (component), `ag` (agent), or `sr` (service) + tokenId bytes
- **Service IDs** are raw `BigInt` bytes (no prefix) — different from the Unit `sr`-prefixed ID for the same service

### Key Contracts

| Contract | Address | Start Block |
|----------|---------|-------------|
| ComponentRegistry | `0x15bd56669F57192a97dF41A2aa8f4403e9491776` | 15,178,253 |
| AgentRegistry | `0x2F1f7D38e4772884b88f3eCd8B6b9faCdC319112` | 15,178,253 |
| ServiceRegistry | `0x48b6af7B12C71f09e2fC8aF4855De4Ff54e775cA` | 15,178,253 |

### Setup & Deployment
Check the [root README](../../README.md) for build and deployment instructions.
