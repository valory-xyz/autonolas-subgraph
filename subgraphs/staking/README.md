# Staking Subgraph

> **Migration note**: This subgraph was moved from [autonolas-subgraph-studio](https://github.com/valory-xyz/autonolas-subgraph-studio) to this infra repo because Mode chain is not supported by The Graph's hosted service and we needed historical data. This subgraph is not actively maintained and will not be updated unless absolutely necessary. Only the Mode mainnet manifest (`subgraph.mode-mainnet.yaml`) exists in this directory — other network deployments are managed separately.

This subgraph tracks staking activities and reward distributions across multiple networks in the OLAS ecosystem. It monitors staking factory contracts and individual staking proxy instances to provide comprehensive analytics for staking participants, service providers, and reward distributions.

## Overview

The staking subgraph provides real-time indexing of staking activities, tracking:

- **Staking Factory Management**: Creation, removal, and status changes of staking instances
- **Service Staking**: Individual service staking and unstaking activities
- **Reward Distribution**: Checkpoint events and reward claiming
- **Deposit Management**: OLAS deposits and withdrawals
- **Service Lifecycle**: Inactivity warnings, force unstaking, and evictions
- **Multi-Network Support**: Deployments across 8 different networks

## Data Sources

The subgraph monitors staking contracts across multiple networks:

### Supported Networks

| Network | StakingFactory Address | Start Block |
|---------|----------------------|-------------|
| **Gnosis** | `0xb0228CA253A88Bc8eb4ca70BCAC8f87b381f4700` | 35206806 |
| **Base** | `0x1cEe30D08943EB58EFF84DD1AB44a6ee6FEff63a` | 17310019 |
| **Mode Mainnet** | `0x75D529FAe220bC8db714F0202193726b46881B76` | 14444647 |
| **Optimism** | `0xa45E64d13A30a51b91ae0eb182e88a40e9b18eD8` | 124618633 |
| **Ethereum Mainnet** | `0xEBdde456EA288b49f7D5975E7659bA1Ccf607efc` | 20409818 |
| **Polygon** | `0x46C0D07F55d4F9B5Eed2Fc9680B5953e5fd7b461` | 62213142 |
| **Arbitrum One** | `0xEB5638eefE289691EcE01943f768EDBF96258a80` | 256823487 |
| **Celo** | `0x1c2cD884127b080F940b7546c1e9aaf525b1FA55` | 27900037 |

### Contract Architecture

- **StakingFactory**: Creates and manages staking proxy instances
- **StakingProxy**: Individual staking contracts with full configuration
- **Service Registry**: Links services to staking activities
- **Activity Checker**: Monitors service activity and inactivity

## Entities

### Factory Management Entities

#### `StakingContract`
Represents a staking proxy instance with full configuration:
- **id**: Transaction hash + log index of the `InstanceCreated` event (the proxy address is in `instance`)
- **sender**: Creator address
- **instance/implementation**: Contract addresses
- **metadataHash**: Contract metadata identifier
- **maxNumServices**: Maximum services allowed
- **rewardsPerSecond**: Reward emission rate
- **minStakingDeposit**: Minimum deposit requirement
- **minStakingDuration**: Minimum staking period
- **maxNumInactivityPeriods**: Maximum inactivity tolerance
- **livenessPeriod**: Activity monitoring period
- **timeForEmissions**: Total emission duration
- **numAgentInstances**: Number of agent instances
- **agentIds**: Array of agent identifiers
- **threshold**: Staking threshold
- **configHash/proxyHash**: Configuration identifiers
- **serviceRegistry/activityChecker**: Related contract addresses

Caveats:
- The entity is immutable — a creation-time snapshot populated via 15 `eth_call`s to the new proxy. Later `InstanceRemoved`/`InstanceStatusChanged` events never update it; join those event entities to determine whether an instance is still enabled.
- The creation calls are unchecked (no `try_` variants): if the factory ever creates an instance whose implementation lacks any of these view functions, `handleInstanceCreated` reverts and indexing halts deterministically.
- Every `InstanceCreated` also spawns a `StakingProxy` dynamic data-source template for the new instance.

#### Factory Events
- `InstanceCreated`: New staking proxy creation
- `InstanceRemoved`: Staking proxy removal
- `InstanceStatusChanged`: Enable/disable status changes
- `OwnerUpdated`: Factory owner changes
- `VerifierUpdated`: Verifier address updates

### Staking Activity Entities

#### How staked amounts are computed

`ServiceStaked`, `ServiceUnstaked`, and `ServiceForceUnstaked` events do not carry the staked amount. Handlers derive it at event time via two `eth_call`s to the emitting proxy (`getOlasForStaking` in `src/utils.ts`): `stake = minStakingDeposit * (numAgentInstances + 1)` — one bond per agent instance plus the service owner's security deposit. Consequences:
- `Service.currentOlasStaked` and the `Global` stake totals reflect the **minimum required** stake, not actual token transfers — a service that bonded above the minimum is undercounted.
- Stake and unstake use the same formula against the proxy's immutable parameters, so per-contract accounting stays symmetric.
- Amounts are raw OLAS wei (18 decimals), undivided.
- The two calls (`numAgentInstances`, `minStakingDeposit`) are unchecked (no `try_` variants); a reverting call halts indexing deterministically.

#### `Service`
Represents a staked service with performance metrics:
- **id**: ServiceRegistry service id (decimal string), aggregated across **all** staking contracts on the network — a service that migrates between staking programs keeps one entity, and there is no field for the contract it is currently staked in (the `ServiceStaked`/`ServiceUnstaked` event entities do not record the emitting proxy either; the closest on-graph signal is the latest `Checkpoint`, which has `contractAddress`, whose `serviceIds` includes the service)
- **currentOlasStaked**: Currently staked OLAS amount (derived; see above)
- **olasRewardsEarned**: Total rewards earned (accrued at `Checkpoint` time, not at claim time)
- **blockNumber/blockTimestamp**: Block details of the service's first staking event (never updated afterwards)

Caveats:
- `ServicesEvicted` is record-only: evicted services still count in `currentOlasStaked` until the later `ServiceUnstaked`/`ServiceForceUnstaked` actually fires.
- If an unstake arrives for a service id with no `Service` entity (possible when indexing starts mid-history or after a graft), the per-service update is silently skipped but `Global.currentOlasStaked` is still decremented — `Global` totals and the sum over `Service` entities can diverge in such deployments.

#### `ServiceStaked`
Service staking events:
- **id**: Event identifier
- **epoch**: Staking epoch
- **serviceId**: Service identifier
- **owner/multisig**: Service owner addresses
- **nonces**: Transaction nonces
- **blockNumber/blockTimestamp**: Event details

#### `ServiceUnstaked`
Service unstaking events:
- **id**: Event identifier
- **epoch**: Unstaking epoch
- **serviceId**: Service identifier
- **owner/multisig**: Service owner addresses
- **nonces**: Transaction nonces
- **reward**: Reward amount received
- **availableRewards**: Available rewards at time
- **blockNumber/blockTimestamp**: Event details

### Reward Management Entities

#### `Checkpoint`
Reward distribution checkpoints:
- **id**: Event identifier
- **epoch**: Checkpoint epoch
- **availableRewards**: Total available rewards
- **serviceIds**: Array of service identifiers
- **rewards**: Array of reward amounts
- **epochLength**: Duration of epoch
- **contractAddress**: Staking contract address
- **blockNumber/blockTimestamp**: Event details

#### `RewardClaimed`
Individual reward claim events:
- **id**: Event identifier
- **epoch**: Claim epoch
- **serviceId**: Service identifier
- **owner/multisig**: Claimer addresses
- **nonces**: Transaction nonces
- **reward**: Claimed reward amount
- **blockNumber/blockTimestamp**: Event details

#### `RewardUpdate`
Append-only ledger of reward flows:
- **id**: Update identifier
- **type**: `"Claimable"` — written once per `Checkpoint`, amount = sum of that epoch's per-service rewards (that epoch's distribution, not a running total); `"Claimed"` — written at `RewardClaimed` and at `ServiceUnstaked` (unstaking auto-pays accrued rewards)
- **amount**: Reward amount
- **blockNumber/blockTimestamp**: Update details

Caveat: `ServiceForceUnstaked` also pays out a reward (the event carries `reward`) but does **not** create a `Claimed` update, so `sum(Claimed)` systematically understates actual payouts. Reconcile by adding `ServiceForceUnstaked.reward` values.

### Deposit Management Entities

#### `Deposit`
OLAS deposit events:
- **id**: Event identifier
- **sender**: Depositor address
- **amount**: Deposit amount
- **balance**: New total balance
- **availableRewards**: Available rewards
- **blockNumber/blockTimestamp**: Event details

#### `Withdraw`
OLAS withdrawal events:
- **id**: Event identifier
- **to**: Recipient address
- **amount**: Withdrawal amount
- **blockNumber/blockTimestamp**: Event details

### Service Management Entities

#### `ServiceInactivityWarning`
Service inactivity warnings:
- **id**: Event identifier
- **epoch**: Warning epoch
- **serviceId**: Service identifier
- **serviceInactivity**: Inactivity duration
- **blockNumber/blockTimestamp**: Event details

#### `ServiceForceUnstaked`
Forced service unstaking:
- **id**: Event identifier
- **epoch**: Unstaking epoch
- **serviceId**: Service identifier
- **owner/multisig**: Service owner addresses
- **nonces**: Transaction nonces
- **reward**: Reward amount
- **availableRewards**: Available rewards
- **blockNumber/blockTimestamp**: Event details

#### `ServicesEvicted`
Bulk service evictions:
- **id**: Event identifier
- **epoch**: Eviction epoch
- **serviceIds**: Array of service identifiers
- **owners/multisigs**: Service owner addresses
- **serviceInactivity**: Inactivity durations
- **blockNumber/blockTimestamp**: Event details

### Global Analytics

#### `Global`
Aggregate staking statistics (singleton, `id = ""`):
- **cumulativeOlasStaked**: Total OLAS ever staked (derived; see "How staked amounts are computed")
- **cumulativeOlasUnstaked**: Total OLAS ever unstaked (derived)
- **currentOlasStaked**: Currently staked OLAS (derived)
- **totalRewards**: Cumulative sum of all `Checkpoint` reward distributions across every staking contract on this network
- **lastActiveDayTimestamp**: Internal cursor pointing at the most recent day with a checkpoint, used to forward-fill `CumulativeDailyStakingGlobal` — not an analytics field
- **services**: Derived list of every `Service` ever staked (entities are never deleted)

#### `CumulativeDailyStakingGlobal`
Daily snapshot, one row per UTC day (`id` = day timestamp string as UTF-8 bytes, day = `timestamp / 86400 * 86400`). A row is written **only on days with at least one `Checkpoint` event on any staking proxy** — days with no checkpoint have no row, so forward-fill gaps client-side when charting.
- **totalRewards**: Running `Global.totalRewards` as of the last checkpoint that day (cumulative, all contracts)
- **numServices** / **medianCumulativeRewards**: Computed over **all `Service` entities ever created** on this network — `Service` entities are never deleted, so long-unstaked services are included forever. The median is of cumulative `olasRewardsEarned`, not current-period rewards
- Forward-fill seeding: the first checkpoint of a new day copies `numServices`/`medianCumulativeRewards` from the snapshot at `Global.lastActiveDayTimestamp` before recomputing, keeping rows continuous
- Indexing cost note: every `Checkpoint` loads and sorts all `Service` entities to compute the median, so checkpoint handling slows as the total service count grows

## Key Features

### Multi-Network Support
- Deployed across 8 different networks
- Network-specific configurations and addresses
- Unified data schema across all networks

### Comprehensive Staking Tracking
- Full service lifecycle from staking to unstaking
- Reward distribution and claiming events
- Inactivity monitoring and enforcement
- Deposit and withdrawal management

### Real-time Analytics
- Global staking statistics
- Individual service performance metrics
- Reward distribution tracking
- Activity monitoring and warnings

### Service Management
- Service staking and unstaking events
- Inactivity warnings and force unstaking
- Bulk service evictions
- Reward claiming and distribution

## Usage Examples

### Query Staking Contracts
```graphql
{
  stakingContracts(first: 10) {
    id
    sender
    instance
    maxNumServices
    rewardsPerSecond
    minStakingDeposit
    minStakingDuration
  }
}
```

### Get Recent Service Staking Events
```graphql
{
  serviceStakeds(
    orderBy: blockTimestamp
    orderDirection: desc
    first: 10
  ) {
    epoch
    serviceId
    owner
    multisig
    blockTimestamp
  }
}
```

### Monitor Reward Distributions
```graphql
{
  checkpoints(
    orderBy: blockTimestamp
    orderDirection: desc
    first: 10
  ) {
    epoch
    availableRewards
    serviceIds
    rewards
    epochLength
    contractAddress
  }
}
```

### Track Global Staking Statistics
```graphql
{
  globals {
    cumulativeOlasStaked
    cumulativeOlasUnstaked
    currentOlasStaked
  }
}
```

### Get Service Performance
```graphql
{
  services(
    orderBy: olasRewardsEarned
    orderDirection: desc
    first: 10
  ) {
    id
    currentOlasStaked
    olasRewardsEarned
    blockTimestamp
  }
}
```

### Monitor Reward Claims
```graphql
{
  rewardClaimeds(
    orderBy: blockTimestamp
    orderDirection: desc
    first: 10
  ) {
    epoch
    serviceId
    owner
    multisig
    reward
    blockTimestamp
  }
}
```

## Development

### Prerequisites
- Graph CLI: `yarn global add @graphprotocol/graph-cli`
- Dependencies: `yarn install`

### Building and Deploying
1. Generate types: `yarn codegen`
2. Build the subgraph: `yarn build`
3. Deploy: production deploys go through the GitHub Actions "deploy-subgraph" workflow (slug e.g. `staking-mode-mainnet-vX_Y_Z`); for a manual deploy use `graph deploy --node <GRAPH_NODE_URL> --version-label <version> <slug> subgraph.mode-mainnet.yaml`.

Note: this subgraph has no Matchstick tests (`yarn test` is defined but there is no `tests/` directory); validate changes with `yarn codegen subgraph.mode-mainnet.yaml && yarn build subgraph.mode-mainnet.yaml` (there is no default `subgraph.yaml`, so the manifest must be passed explicitly).

### Multi-Network Deployment
The subgraph supports deployment across multiple networks:
- Network configurations are in `networks.json`
- Template-based deployment using `subgraph.template.yaml`
- Network-specific address and block configurations

### Local Development
- The subgraph uses AssemblyScript for mapping logic
- Factory events are handled in `src/staking-factory.ts`
- Proxy events are handled in `src/staking-proxy.ts`
- Utility functions are in `src/utils.ts`

## Contributing

When adding new features or modifying the subgraph:
1. Update the schema in `schema.graphql`
2. Add corresponding event handlers in the appropriate `src/` files
3. Update the subgraph configuration in `subgraph.template.yaml`
4. Update network configurations in `networks.json` if needed
5. Test thoroughly before deployment
