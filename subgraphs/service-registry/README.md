# Service Registry Subgraph

> **Technical reference**: See [CLAUDE.md](CLAUDE.md) for full schema reference, handler details, daily aggregation logic, utility functions, and business rules.

This directory contains subgraphs for tracking the lifecycle of services, including agent registration, multisig creation, and daily activity metrics across L2 networks.

## Architecture

All source files, the schema, and network-specific manifests live in a single flat directory:

-   **Schema** (`schema.graphql`): Shared GraphQL schema defining 14 entity types.
-   **Mapping Logic** (`src/mapping.ts`): Event handlers for L2 networks (ServiceRegistryL2 + GnosisSafe).
-   **Mainnet Mapping** (`src/mapping-eth.ts`): Event handlers for Ethereum mainnet (imports from `ServiceRegistry` ABI instead of `ServiceRegistryL2`; does not set `configHash` on service creation).
-   **Utilities** (`src/utils.ts`): Shared entity getters, daily aggregation functions, and deduplication logic.
-   **Network Manifests** (`subgraph.*.yaml`): Per-network manifests with contract addresses and start blocks.
-   **Template** (`subgraph.template.yaml`): Template manifest using `{{ variable }}` placeholders, substituted from `networks.json`.

## Indexed Contracts

-   **`ServiceRegistryL2` (L2s)**: The contract deployed on L2 networks for managing services, agent registrations, and multisig deployments.
-   **`GnosisSafe` (All Networks)**: The multisig wallet contract used by services. Indexed dynamically via a template when a new multisig is created for a service.

## Core Entities

-   **`Service`**: Represents a service with its registered agent IDs (`agentIds`), multisig address, config hash, creator, and creation timestamp.
-   **`Multisig`**: Tracks Gnosis Safe wallets, including their creator address, creation timestamp, transaction hash, service ID, and the most-recently-registered agent (stored in `agentIds`).
-   **`AgentRegistration`**: Records the registration of an agent to a service, capturing the service ID, agent ID, and registration timestamp. ID format: `{serviceId}-{agentId}`.
-   **`AgentPerformance`**: Aggregates the total transaction count (`txCount` as `BigInt`) for each agent across all activity.
-   **`Creator`**: Tracks service creator addresses. Services are derived via `@derivedFrom`.
-   **`Operator`**: Tracks unique operator addresses registered across services.
-   **`Global`**: A singleton entity (id: `""`) for global statistics: total transaction count, last updated timestamp, and total unique operators.

### Daily Aggregation Entities

To provide insights into daily activity, the subgraph generates several daily snapshot entities with deduplication links:

-   **`DailyServiceActivity`**: Tracks the active agents for each service on a daily basis.
-   **`DailyUniqueAgents`** / **`DailyUniqueAgent`**: Counts unique active agents per day. `DailyUniqueAgent` is a deduplication link ensuring each agent is counted once per day.
-   **`DailyAgentPerformance`** / **`DailyAgentMultisig`**: Records daily transaction count and active multisig count per agent. `DailyAgentMultisig` deduplicates multisigs per agent per day.
-   **`DailyActiveMultisigs`** / **`DailyActiveMultisig`**: Tracks multisig wallets with on-chain activity each day. `DailyActiveMultisig` deduplicates per day.

## Supported Networks

Currently deployed manifests:

-   **Gnosis**: `subgraph.gnosis.yaml`
-   **Mode**: `subgraph.mode-mainnet.yaml`

## Usage Examples

### 1. Daily Active Agents (DAA) per Agent ID

This query fetches the number of distinct active multisigs for a specific agent (`agentId: 40`) per day.

```graphql
query GetDAAForAgent {
  dailyAgentPerformances(
    # Use a Unix timestamp for the desired start date
    where: { agentId: 40, dayTimestamp_gte: "1672531200" }
    orderBy: dayTimestamp
    orderDirection: desc
  ) {
    dayTimestamp
    activeMultisigCount
  }
}
```

### 2. Daily Active Multisigs Across All Agents

This query fetches the total count of distinct active multisigs across all agents for each day.

```graphql
query GetDAAOverall {
  dailyActiveMultisigs_(
    orderBy: dayTimestamp
    orderDirection: desc
    # Use a Unix timestamp for the desired start date
    where: { dayTimestamp_gte: "1672531200" }
  ) {
    dayTimestamp
    count
  }
}
```

### 3. Total Transactions per Agent

This query lists all agents and their total transaction counts, sorted in descending order.

```graphql
query GetTotalTxsPerAgent {
  agentPerformances(
    orderBy: txCount
    orderDirection: desc
  ) {
    id # Agent ID
    txCount
  }
}
```

### 4. Total Transactions on the Chain

This query retrieves the total number of transactions processed across all services on the network.

```graphql
query GetTotalTxsPerChain {
  global(id: "") {
    txCount
  }
}
```

### 5. Global Statistics

This query retrieves all global metrics including total operators.

```graphql
query GetGlobalStats {
  global(id: "") {
    txCount
    lastUpdated
    totalOperators
  }
}
``` 