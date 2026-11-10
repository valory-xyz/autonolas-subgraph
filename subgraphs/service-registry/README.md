# Service Registry Subgraph

Tracks the lifecycle of Olas services on Gnosis and Mode, including agent registration, multisig creation, ERC-8004 agent identity, and daily activity metrics.

**Gnosis uses this self-hosted subgraph.** Mode is unsupported and remains unchanged.
Base and Robinhood use the [service-registry squid](../../squids/service-registry).
See the internal **[WD] Subgraph&Squids Development and Deployment Tracking**
document for current endpoints and versions.

> **Technical reference**: See [CLAUDE.md](CLAUDE.md) for full schema reference, handler details, business rules, multi-network configuration, and AI context.

## Quick Overview

- Indexes `ServiceRegistryL2` on Gnosis and Mode for service creation, agent registration, multisig deployment, and termination (mainnet `ServiceRegistry` handlers exist as unwired scaffolding in `src/mapping-eth.ts`)
- Dynamically tracks `GnosisSafe` multisig transactions via templates
- **ERC-8004 identity**: Tracks agent wallets and metadata via `IdentityRegistryBridger`
- **Daily aggregations**: Unique agents, per-agent transaction counts, active multisigs — all deduplicated via join entities
- **Most recent agent selection**: At multisig creation, only the most recently registered agent is assigned to prevent double counting

## Common Queries

### Daily Active Agents per Agent ID
```graphql
{
  dailyAgentPerformances(
    where: { agentId: 40, dayTimestamp_gte: "1672531200" }
    orderBy: dayTimestamp
    orderDirection: desc
  ) {
    dayTimestamp
    activeMultisigCount
  }
}
```

### Global Statistics
```graphql
{
  global(id: "") {
    txCount
    totalOperators
  }
}
```

## Development

```bash
yarn install                # Install dependencies
yarn codegen                # Generate TypeScript from schema + ABIs
yarn build                  # Compile to WebAssembly
yarn generate-manifests     # Regenerate L2 manifests from template
yarn test                   # Run Matchstick tests
```

### Project Structure
* `src/mapping.ts` — L2 handlers (ServiceRegistryL2 + GnosisSafe)
* `src/mapping-eth.ts` — Mainnet handlers (ServiceRegistry + GnosisSafe; scaffolding, no manifest wired)
* `src/bridger.ts` — IdentityRegistryBridger handlers (Gnosis only)
* `src/utils.ts` — Shared helpers & entity factories
* `subgraph.template.yaml` — Template for L2 manifest generation
* `networks.json` — Contract addresses & start blocks per network

### Supported Networks
Gnosis, Mode

### Setup & Deployment
**Check the [root README](/README.md).**


## ERC-8004 wallet clearing

Subscribe to `AgentMultisigUpdated` from each configured IdentityRegistryBridger.
A nonzero `oldMultisig` unsets the indexed agent wallet to the zero address,
matching explicit `AgentWalletSet(..., address(0))`. Preserve the service identity
association and all metadata. A zero-old-multisig link does not change wallet
authorization; only `AgentWalletSet` authorizes a replacement wallet.

Verified against `IdentityRegistryBridger._updateAgentWallet` in registries
commit `0e065705af0ca8df84f75f7a19b814c21fa2d083`. The existing ABI already
contains the required event. Service termination alone is not used as evidence
of wallet clearing: older deployments may not emit the bridger cleanup event.

The configured bridger histories were checked on 10 November 2026. The
wallet-clearing meaning of `AgentMultisigUpdated` is consistent throughout their
indexed ranges, including the historical implementation upgrades. No additional
block boundary or new contract address is needed for this handler. Deploy after
merge without waiting for a ServiceManager deployment or new on-chain activity.

New subscriptions require replay/backfill from before any missed events; a
restart or graft containing stale wallet state does not repair that history.
Studio deployments require full reindexing. Self-hosted grafts require a correct
pre-event state and compatible schema; squid deployments must replay/backfill
missed events before consumers rely on the corrected field. No schema change,
contract address change or deployment is included in this update.
