# Mech Subgraph (Legacy, Gnosis)

A GraphQL API for indexing the legacy Autonolas AI mech infrastructure on Gnosis Chain.

> **Technical reference**: See [CLAUDE.md](CLAUDE.md) for full schema reference, handler details, IPFS parsing, and business rules.
>
> **Deprecated**: Use the [marketplace](../marketplace/) subgraph instead. On Gnosis, the marketplace subgraph merges both legacy mech data (from this subgraph) and new Mech Marketplace data into a single unified API. On other chains (Base, Polygon, Optimism, Ethereum, Arbitrum, Celo), it indexes only new Mech Marketplace data. This subgraph is kept for reference but is no longer actively maintained.

## Quick Overview

- Tracks mech creation across 4 factory versions on Gnosis
- Indexes request/delivery lifecycle with IPFS metadata parsing (prompts, tools, AI models, responses)
- Associates mechs/requests/deliveries to services via multisig lookup
- Counts ATA (Autonomous Transaction Agent) transactions
- Extracts question titles from prompts for cross-referencing with prediction market subgraphs

## Common Queries

### Global Statistics
```graphql
{
  globals {
    totalRequests
    totalDeliveries
    totalTransactions
    totalAtaTransactions
  }
}
```

### Service Activity
```graphql
{
  service(id: "175") {
    totalRequests
    totalDeliveries
    agentIds
    latestMultisig
  }
}
```

### Recent Requests with Parsed Data
```graphql
{
  requests(first: 10, orderBy: blockTimestamp, orderDirection: desc) {
    prompt
    tool
    questionTitle
    sender { id }
    service { id }
  }
}
```

## Development

```bash
yarn install    # Install dependencies
yarn codegen    # Generate TypeScript from schema + ABIs
yarn build      # Compile to WebAssembly
yarn test       # Run tests
```

### Project Structure
* `src/agent-factory.ts` — Mech creation handlers (4 factory versions)
* `src/agent-registry.ts` — Agent NFT registry handlers
* `src/agent-mech.ts` — Request/Deliver handlers with IPFS parsing
* `src/registryL2.ts` — Service registry handlers

### Setup & Deployment
Check the [root README](../../README.md) for build and deployment instructions.
