# Service Registry Subgraph

This directory contains subgraphs for tracking the lifecycle of services, including agent registration, multisig creation, and daily activity metrics across Ethereum mainnet and various L2 networks.

## Architecture

The project is structured with a shared core logic and network-specific configurations:

-   **Common Logic (`common/`)**: This directory contains the shared GraphQL schema (`schema.graphql`), mapping logic (`mappers/mapping.ts`), and utility functions (`utils.ts`) used by all network subgraphs.
-   **Network Subgraphs (`service-registry-*/`)**: Each supported network has its own directory containing the `subgraph.<network>.yaml` manifest file. These manifests define the specific contract addresses and start blocks for that network while referencing the common mapping and schema.

## Indexed Contracts

The subgraphs index data from the following contracts:

-   **`ServiceRegistry` (Mainnet)**: The core contract on Ethereum mainnet for managing services, agent registrations, and multisig deployments.
-   **`ServiceRegistryL2` (L2s)**: The equivalent contract deployed on various L2 networks.
-   **`GnosisSafe` (All Networks)**: The multisig wallet contract used by services. This is indexed dynamically using a template when a new multisig is created for a service.

## Core Entities

-   **`Service`**: Represents a service, linking it to its registered agent instances and multisig wallet.
-   **`Multisig`**: Tracks Gnosis Safe wallets, including their creator, creation timestamp, and associated agent instances.
-   **`Agent`**: Represents a unique autonomous agent.
-   **`AgentRegistration`**: Records the registration of an agent to a service, capturing the timestamp.
-   **`AgentPerformance`**: Aggregates the total transaction count for each agent across all their activity.
-   **`Global`**: A singleton entity for global statistics, such as the total transaction count and the total number of unique agents.

### Daily Aggregation Entities

To provide insights into daily activity, the subgraph generates several daily snapshot entities:

-   **`DailyServiceActivity`**: Tracks the active agents for each service on a daily basis.
-   **`DailyUniqueAgents`**: Counts the number of unique active agents across all services each day.
-   **`DailyAgentPerformance`**: Records the daily transaction count for each agent.
-   **`DailyActiveMultisigs`**: Tracks the number of multisig wallets that had on-chain activity each day.

## Supported Networks

-   **Ethereum Mainnet**: `service-registry-eth/subgraph.yaml`
-   **Arbitrum**: `service-registry-arbitrum/subgraph.arbitrum.yaml`
-   **Base**: `service-registry-base/subgraph.base.yaml`
-   **Celo**: `service-registry-celo/subgraph.celo.yaml`
-   **Gnosis**: `service-registry-gnosis/subgraph.gnosis.yaml`
-   **Mode**: `service-registry-mode/subgraph.mode.yaml`
-   **Optimism**: `service-registry-optimism/subgraph.optimism.yaml`
-   **Polygon**: `service-registry-polygon/subgraph.polygon.yaml`

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

### 2. Daily Active Agents (DAA) Across All Agents

This query fetches the total count of distinct active multisigs across all agents for each day.

```graphql
query GetDAAOverall {
  dailyActiveMultisigs(
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