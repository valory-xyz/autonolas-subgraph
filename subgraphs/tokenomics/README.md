# Tokenomics Subgraph

> **Migration note**: This subgraph was moved from [autonolas-subgraph-studio](https://github.com/valory-xyz/autonolas-subgraph-studio) to this infra repo because Mode chain is not supported by The Graph's hosted service and we needed historical data. This subgraph is not actively maintained and will not be updated unless absolutely necessary. Only the Mode mainnet manifest (`subgraph.mode-mainnet.yaml`) exists in this directory — other network deployments are managed separately.

This directory contains subgraphs for tracking the economic activity and mechanisms of the OLAS token across Ethereum mainnet and various L2 networks.

## Architecture

The project, as maintained in [autonolas-subgraph-studio](https://github.com/valory-xyz/autonolas-subgraph-studio), is structured into two main parts:

-   **Ethereum Mainnet Subgraph (`tokenomics-eth`)**: A comprehensive subgraph that indexes the full OLAS tokenomics system, including bonding, staking incentives, and epoch settlements.
-   **L2 Subgraphs (`tokenomics-l2/`)**: A single lighter subgraph package with per-network manifests for various L2 networks that focuses primarily on OLAS token transfers and holder balances. This directory mirrors that L2 package for Mode mainnet: `schema.graphql`, `src/olas-l2.ts` (holder/balance tracking in `src/utils.ts`), and `subgraph.mode-mainnet.yaml` generated from `subgraph.template.yaml` + `networks.json`.

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

These subgraphs track OLAS token activity on various L2 networks. They share a common schema (`tokenomics-l2/schema.graphql`) and mapping logic (`tokenomics-l2/src/olas-l2.ts`) in the studio repo, mirrored in this directory as `schema.graphql` and `src/olas-l2.ts` (holder/balance tracking in `src/utils.ts`).

### Core Entities (L2)

-   **`Token`**: Represents the OLAS token on the specific L2.
-   **`TokenHolder`**: Tracks the balance of each OLAS holder on the L2.
-   **`Transfer`**: Logs every OLAS token transfer event.

### Entity Semantics

-   `Token.id` is the OLAS contract address (`0xcfD1D50ce23C46D3Cf6407487B2F8934e96DC8f9` on Mode); there is exactly one `Token` entity per deployment.
-   `Token.balance` is the **circulating OLAS supply on the chain**, not a wallet balance. It is derived purely from `Transfer` events: incremented when `from` is the zero address (mint / bridge-in), decremented when `to` is the zero address (burn / bridge-out). It is never reconciled against `totalSupply()` — the subgraph makes no eth_calls.
-   All `BigInt` amounts (`Token.balance`, `TokenHolder.balance`, `Transfer.value`) are raw wei; OLAS has 18 decimals, so divide by 1e18 client-side.
-   `TokenHolder` entities are **never deleted**: an address that transferred everything away keeps its row with `balance: 0`. To count current holders, use `Token.holderCount` or filter `tokenHolders(where: { balance_gt: 0 })` — a raw count of `TokenHolder` entities means "addresses that ever held OLAS".
-   `Token.holderCount` changes only on exact zero-boundary transitions: `-1` when a sender's balance drops from >0 to exactly 0, `+1` when a receiver's balance rises from exactly 0 to >0. Zero-amount transfers and self-transfers leave the count unchanged, and the zero address is never tracked as a holder.

### Schema Constraints

-   `TokenHolder.id` is the holder address alone, so the schema supports exactly one tracked token per deployment. Adding a second token data source would require switching to a composite `token + holder` id to avoid colliding holder rows across tokens.
-   `TokenHolder.token` is a plain `Bytes` field (not an entity reference, no `@derivedFrom`), so there is no `Token.holders` traversal in GraphQL — query `tokenHolders` at the top level instead.

## Supported Networks

Only the Mode mainnet manifest lives in this directory; all other manifests are managed in [autonolas-subgraph-studio](https://github.com/valory-xyz/autonolas-subgraph-studio).

-   **Ethereum Mainnet**: `tokenomics-eth/subgraph.yaml` (studio repo)
-   **L2 Networks**:
    -   Arbitrum: `tokenomics-l2/subgraph.arbitrum-one.yaml` (studio repo)
    -   Base: `tokenomics-l2/subgraph.base.yaml` (studio repo)
    -   Celo: `tokenomics-l2/subgraph.celo.yaml` (studio repo)
    -   Gnosis: `tokenomics-l2/subgraph.gnosis.yaml` (studio repo)
    -   Mode: `subgraph.mode-mainnet.yaml` (this directory; generated from `subgraph.template.yaml` + `networks.json` via `yarn generate-manifests`)
    -   Optimism: `tokenomics-l2/subgraph.optimism.yaml` (studio repo)
    -   Polygon: `tokenomics-l2/subgraph.matic.yaml` (studio repo)

## Testing

There are currently **no Matchstick tests** for this subgraph (`yarn test` finds nothing); CI only smoke-tests `graph codegen` + `graph build` against `subgraph.mode-mainnet.yaml`. The supply and holder-count accounting in `src/utils.ts` has no regression coverage — if you modify it, add tests for the mint/burn supply updates and the zero-boundary `holderCount` transitions (including self-transfers and zero-amount transfers).
