# Autonolas Registry Subgraph (Base)

A GraphQL API for indexing the Autonolas service registry on Base network, with daily activity tracking for services with agent ID 41.

> **Technical reference**: See [claude.md](claude.md) for full schema reference, handler details, constants, and business rules.

## Quick Overview

- Indexes **ServiceRegistryL2** on Base network
- Tracks service creation, updates, ownership, agent instances, and multisig deployments
- **Agent 41 filter**: Only services with agent ID 41 get Multisig entity + daily activity tracking
- Daily activity aggregation via **GnosisSafe** `SafeReceived` events (dynamic data source template instantiated per multisig)
- Entities: `Unit`, `Service`, `Multisig`, `DailyActivity`
- Features enabled: `fullTextSearch`, `ipfsOnEthereumContracts`

## Common Queries

### Service Details
```graphql
{
  service(id: "0x...") {
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

### Unit (Service Metadata)
```graphql
{
  units(first: 10, orderBy: tokenId, orderDirection: desc) {
    tokenId
    publicId
    packageType
    description
    owner
  }
}
```

### Multisigs (Agent 41 Services)
```graphql
{
  multisigs {
    id
    service {
      serviceId
      publicId
      state
    }
  }
}
```

### Daily Activity
```graphql
{
  dailyActivities(orderBy: dayTimestamp, orderDirection: desc, first: 30) {
    dayTimestamp
    count
    services
  }
}
```

## Development

```bash
yarn install        # Install dependencies
yarn codegen        # Generate TypeScript from schema + ABIs
yarn build          # Compile to WebAssembly
yarn test           # Run tests
yarn deploy-base    # Deploy to Studio
```

### Project Structure
* `src/registryL2.ts` — Service registry event handlers + IPFS metadata resolution
* `src/safe.ts` — GnosisSafe SafeReceived handler + daily activity aggregation

### Key Contracts

| Contract | Address | Start Block |
|----------|---------|-------------|
| ServiceRegistryL2 | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | 10,827,670 |
| GnosisSafe | Dynamic (per service multisig) | — |

> GnosisSafe ABI is referenced from the root `abis/` directory (`../../abis/GnosisSafe.json`).

### Setup & Deployment
Check the [root README](../../README.md) for build and deployment instructions.
