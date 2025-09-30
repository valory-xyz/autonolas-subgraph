# Tokenomics Subgraph

This directory contains subgraphs for tracking the economic activity and mechanisms of the OLAS token across Ethereum mainnet and various L2 networks.

## Architecture

The project is structured into two main parts:

-   **Ethereum Mainnet Subgraph (`tokenomics-eth`)**: A comprehensive subgraph that indexes the full OLAS tokenomics system, including bonding, staking incentives, and epoch settlements.
-   **L2 Subgraphs (`tokenomics-*/`)**: A set of lighter subgraphs for various L2 networks that focus primarily on OLAS token transfers and holder balances. These subgraphs share a common schema and mapping logic from the `common` directory.

## Ethereum Mainnet Subgraph

The mainnet subgraph, located in `tokenomics-eth/`, provides a detailed view of the OLAS token's economic activity on Ethereum.

### Indexed Contracts

-   **`OLAS`**: The OLAS ERC20 token contract.
-   **`veOLAS`**: The voting-escrowed OLAS contract for staking.
-   **`Tokenomics`**: The core contract managing epochs, rewards, and economic parameters.
-   **`DepositoryV1` & `DepositoryV2`**: Contracts for creating and managing bonding products.
-   **`DispenserV1` & `DispenserV2`**: Contracts for distributing rewards and incentives.

### Core Entities

-   **`Epoch`**: Tracks epoch settlements, including rewards, top-ups, available incentives, and bond-related data.
-   **`Token` / `TokenHolder`**: Tracks OLAS token supply and individual holder balances.
-   **`VeolasDepositor`**: Tracks veOLAS deposits and lock times.
-   **Event Entities**: A wide range of entities that log events from the indexed contracts, such as:
    -   `CreateProduct` / `CloseProduct`: Events related to bonding products.
    -   `CreateBond` / `RedeemBond`: Events for bond creation and redemption.
    -   `IncentivesClaimed`: Events for developer and staker incentive claims.
    -   `EpochSettled`: Detailed records of each epoch settlement.

## L2 Network Subgraphs

These subgraphs track OLAS token activity on various L2 networks. They share a common schema (`common/schema-l2.graphql`) and mapping logic (`common/mappers/olas-l2.ts`).

### Core Entities (L2)

-   **`Token`**: Represents the OLAS token on the specific L2.
-   **`TokenHolder`**: Tracks the balance of each OLAS holder on the L2.
-   **`Transfer`**: Logs every OLAS token transfer event.

## Supported Networks

-   **Ethereum Mainnet**: `tokenomics-eth/subgraph.yaml`
-   **L2 Networks**:
    -   Arbitrum: `tokenomics-arbitrum/subgraph.arbitrum.yaml`
    -   Base: `tokenomics-base/subgraph.base.yaml`
    -   Celo: `tokenomics-celo/subgraph.celo.yaml`
    -   Gnosis: `tokenomics-gnosis/subgraph.gnosis.yaml`
    -   Mode: `tokenomics-mode/subgraph.mode.yaml`
    -   Optimism: `tokenomics-optimism/subgraph.optimism.yaml`
    -   Polygon: `tokenomics-polygon/subgraph.polygon.yaml`
