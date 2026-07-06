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
yarn remove-local   # Remove from local Graph node
```

Note: `package.json` also defines a `deploy-base` script, but it is defunct — it references a removed `profiles/l2/subgraph.base.yaml` manifest. Base registry indexing lives in the separate [`subgraphs/autonolas-base`](../autonolas-base) subgraph.

### Project Structure
* `src/registry.ts` — All event handlers for Component, Agent, and Service registries
* `schema.graphql` — Unit, Service, Global, Builder entities + `packageType` enum
* `abis/` — ComponentRegistry, AgentRegistry, ServiceRegistry ABIs

### Entity ID Formats
- **Unit IDs** are prefixed: `cm` (component), `ag` (agent), or `sr` (service) + tokenId bytes. Note: the prefix strings are passed through `Bytes.fromHexString`, so the stored prefix bytes are `0x0c` / `0x0a` / `0x00` respectively — IDs used in queries must be built the same way
- **Service IDs** are raw `BigInt` bytes (no prefix) — different from the Unit `sr`-prefixed ID for the same service

The tokenId bytes come from graph-ts `Bytes.fromBigInt`, which reinterprets the BigInt's internal representation: **little-endian, two's-complement signed** bytes of minimal length. To build an id by hand:

1. Write the tokenId in hex with the bytes reversed (little-endian): 1 → `01`, 256 → `0001`, 300 → `2c01`
2. If the most significant byte has its high bit set, append a `00` sign byte: 128 → `8000`, 255 → `ff00`
3. Prepend the prefix byte for Unit IDs (`0x0c`/`0x0a`/`0x00`); Service entity IDs get no prefix

| tokenId | Component Unit id | Agent Unit id | Service Unit id | Service entity id |
|---------|-------------------|---------------|-----------------|-------------------|
| 1 | `0x0c01` | `0x0a01` | `0x0001` | `0x01` |
| 128 | `0x0c8000` | `0x0a8000` | `0x008000` | `0x8000` |
| 256 | `0x0c0001` | `0x0a0001` | `0x000001` | `0x0001` |
| 300 | `0x0c2c01` | `0x0a2c01` | `0x002c01` | `0x2c01` |

When possible, filter on the numeric fields instead of constructing ids: `units(where: { tokenId: "300" })`, `services(where: { serviceId: "300" })`.

### Key Contracts

| Contract | Address | Start Block |
|----------|---------|-------------|
| ComponentRegistry | `0x15bd56669F57192a97dF41A2aa8f4403e9491776` | 15,178,253 |
| AgentRegistry | `0x2F1f7D38e4772884b88f3eCd8B6b9faCdC319112` | 15,178,253 |
| ServiceRegistry | `0x48b6af7B12C71f09e2fC8aF4855De4Ff54e775cA` | 15,178,253 |

### Setup & Deployment
Check the [root README](../../README.md) for build and deployment instructions.
