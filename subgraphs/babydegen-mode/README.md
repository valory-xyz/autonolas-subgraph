# BabyDegen Subgraph - MODE Network

> **Migration note**: This subgraph was moved from [autonolas-subgraph-studio](https://github.com/valory-xyz/autonolas-subgraph-studio) to this infra repo because Mode chain is not supported by The Graph's hosted service and we needed historical data. This subgraph is not actively maintained and will not be updated unless absolutely necessary.

This subgraph tracks agent portfolio performance and population-level metrics for the BabyDegen agent economy on MODE Network. It monitors autonomous agents participating in DeFi protocols, tracking their portfolio performance, position management, and providing aggregated population statistics.

## Overview

The BabyDegen subgraph provides real-time indexing of autonomous agent activities, tracking:

- **Portfolio Performance**: Real-time ROI and APR calculations for each agent
- **DeFi Positions**: Multi-protocol position tracking across Velodrome, Balancer, and STURDY
- **Token Management**: Balance tracking and uninvested fund monitoring
- **Population Analytics**: Daily median metrics and 7-day moving averages
- **Daily Snapshots**: Daily portfolio snapshots (first scheduler poll after UTC midnight) for historical analysis

## Data Sources

The subgraph monitors contracts on **MODE Mainnet**:

### Core Contracts
- **ServiceRegistryL2**: `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` (Block: 15110000)
- **Safe**: Dynamic multisig wallet tracking via templates

### DeFi Protocol Contracts
- **Velodrome NFT Manager**: `0x991d5546C4B442B4c5fdc4c8B8b8d131DEB24702`
- **Velodrome CL Factory**: `0x04625B046C69577EfC40e6c0Bb83CDBAfab5a55F` (eth_call only, pool lookups — not an indexed data source)
- **Velodrome V2 Factory**: `0x31832f2a97Fd20664D76Cc421207669b55CE4BC0`
- **Balancer V2 Vault**: `0xBA12222222228d8Ba445958a75a0704d566BF2C8`
- **STURDY Vault**: `0x2dE57F6432Ac67A99aF5aB17017005048AE7A24C`
- **LiFi Diamond**: `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`

### Price Discovery
- **Velodrome V3 Pools**: WETH/USDC, VELO/WETH, oUSDT/USDC, WETH/MODE
- **Velodrome V2 Pools**: ezETH/WETH, weETH/WETH, STONE/WETH, USDT/USDC
- **Balancer Pools**: OLAS/USDC, MODE/WETH
- **Stablecoin Fallbacks**: USDC, USDT, oUSDT ($1.00 fallback)

*Note: Chainlink price feeds are not available on MODE Network*

## Service Tracking Rules

- **Agent ID gating**: Only services whose agent instance is registered with **agent ID 40 (Optimus)** are indexed (`OPTIMUS_AGENT_ID` in `src/constants.ts`). `RegisterInstance` events with any other `agentId` are ignored, and `CreateMultisigWithAgents` is ignored unless a matching `ServiceRegistration` entity already exists. A BabyDegen-like service using a different agent ID will simply not appear in query results.
- **Service entity ID is the safe address, not the serviceId**: `Service` entities are keyed by the multisig (service safe) address. If a service is re-deployed with a new multisig for the same `serviceId`, the old `Service` entity is retained with `isActive: false` and a new entity is created; the `ServiceIndex` entity (id = serviceId string) always points at the current safe. Filter on `isActive: true` to get current deployments only.
- **Both safes are tracked**: A `Safe` datasource template is instantiated for the service safe *and* the operator safe (`src/serviceRegistry.ts`), so ETH events on the operator safe are also indexed (needed for funding attribution, see below).

## Entities

### Service Management Entities

#### `Service`
Represents a registered autonomous agent service:
- **serviceId**: Unique service identifier
- **serviceSafe**: Agent's safe address
- **operatorSafe**: Operator address
- **isActive**: Current activity status
- **positions**: Array of DeFi positions
- **balances**: Token balance tracking
- **positionIds**: Array of position identifiers

#### `ServiceRegistry`
Singleton registry tracking all services:
- **serviceAddresses**: Array of all registered service addresses

### Portfolio Tracking Entities

#### `AgentPortfolio`
Tracks an agent's overall portfolio performance:
- **finalValue**: `positionsValue + uninvestedValue + totalWithdrawnUSD` (USD)
- **initialValue**: Net funding received (`FundingBalance.netUsd`, see Funding & Portfolio Accounting)
- **positionsValue**: Current value of active positions
- **uninvestedValue**: Token balances in safe
- **roi**: Realized ROI from **closed positions only** (see Metric Field Glossary)
- **apr**: `roi` annualized; stays 0 when `roi` ≤ 0
- **firstTradingTimestamp**: First funding timestamp (falls back to registration timestamp for APR)
- **totalPositions**: Count of active positions

#### `AgentPortfolioSnapshot`
Daily immutable snapshots of agent portfolio performance:
- **id**: `<safeAddressHex>-<blockTimestamp>` (UTF-8 bytes)
- **timestamp**: Block timestamp of the snapshot — the first scheduler poll after UTC midnight, *not* exactly 00:00
- **finalValue/initialValue**: Portfolio values at snapshot
- **roi/apr**: Performance metrics at snapshot
- **totalPositions**: Number of active positions
- **positionIds**: Active position identifiers at snapshot

### DeFi Position Entities

#### `ProtocolPosition`
Individual DeFi positions across supported protocols:
- **protocol**: "velodrome-cl", "velodrome-v2", "balancer", or "STURDY"
- **tokenId**: NFT token ID for velodrome-cl positions; BigInt.zero() for velodrome-v2 and STURDY positions; balancer positions store the pool ID converted via `BigInt.fromUnsignedBytes(poolId)`
- **isActive**: Position status (open/closed)
- **usdCurrent**: Current USD value
- **token0/token1**: Token addresses and symbols
- **amount0/amount1**: Current token amounts
- **liquidity**: Current liquidity amount
- **entryAmountUSD**: Initial investment amount
- **exitAmountUSD**: Exit value when closed
- **tickLower/tickUpper**: Position range (CL positions only)

### Token and Price Entities

#### `Token`
Token metadata and pricing:
- **symbol/name**: Token identifiers
- **decimals**: Token precision
- **derivedUSD**: Current best price
- **priceSources**: Available price sources
- **priceConfidence**: Current price confidence level

#### `TokenBalance`
Agent token balance tracking:
- **balance**: Token amount
- **balanceUSD**: USD value
- **lastUpdated**: Last update timestamp

### Population Analytics Entities

#### `DailyPopulationMetric`
Population-level metrics calculated once per UTC day (see Snapshot & Population Metric Mechanics):
- **id**: "<dayTimestamp>" for daily snapshots (UTC midnight)
- **medianPopulationROI**: Median ROI across all agents for that day
- **medianPopulationAPR**: Median APR across all agents for that day
- **sma7dROI**: 7-day simple moving average of median ROI
- **sma7dAPR**: 7-day simple moving average of median APR
- **totalAgents**: Number of agents included in calculation
- **historicalMedianROI**: Last 7 days of median ROI values
- **historicalMedianAPR**: Last 7 days of median APR values
- **timestamp**: UTC midnight timestamp
- **block**: Block number when calculated

## Funding & Portfolio Accounting

`FundingBalance.netUsd` is the agent's `initialValue` — the denominator of every ROI figure. The rules are narrower than "all deposits count":

- **Only native USDC and ETH count as funding.** `netUsd` increases on inbound native-USDC ERC20 transfers and inbound ETH (`SafeReceived`) whose sender passes the funding-source test: the service's operator safe, or any EOA. The funding-source test carries an Optimism-inherited branch that excludes bridged USDC (USDC.e), but it is inert on Mode: `constants.ts` aliases `USDC_NATIVE` and `USDC_BRIDGED` to the single Mode USDC (there is no separate bridged token on Mode).
- **EOA status is checked once and cached forever.** `isFundingSource` (`src/common.ts`) uses `ethereum.hasCode` and stores the result in an `AddressType` entity — an address that later has a contract deployed to it stays classified as it was first seen.
- **ETH outflows decrease `netUsd`; USDC outflows do not.** ETH sent from the service safe to the operator safe (seen via the operator safe's `SafeReceived`), or via `ExecutionSuccess`/`ExecutionFromModuleSuccess` with `tx.value > 0` to a funding target, decrements `netUsd`. Native USDC sent to a funding target instead increments `FundingBalance.totalWithdrawnUsd`, which is **added back** into the portfolio: `finalValue = positionsValue + uninvestedValue + totalWithdrawnUsd`.
- **Deposits of other whitelisted tokens (OLAS, WETH, LSTs, …)** update `TokenBalance`/`uninvestedValue` (the numerator) but never `initialValue` (the denominator) — agents funded in non-USDC tokens show inflated ROI.
- **OLAS exclusion**: OLAS transfers from `0x8BcAdb2c291C159F9385964e5eD95a9887302862` (`EXCLUDED_OLAS_SENDER`, `src/tokenBalances.ts`) are skipped entirely — they do not even update `TokenBalance`.
- USD values are computed at transfer time with the then-current pool price; they are not re-priced retroactively.

## Metric Field Glossary

Field names on `AgentPortfolio`/`AgentPortfolioSnapshot` are historical and do not mean what they suggest:

| Field | Actual meaning |
|---|---|
| `roi` | **Realized** ROI from closed positions only: `(grossGains − entries − costs) / (entries + costs) × 100`. Closed positions with null/zero `exitAmountUSD` are skipped. Stays 0 until the first position closes. |
| `apr` | `roi` annualized by `365 / daysSinceStart` — but **only computed when `roi > 0`**. Losing agents report `apr = 0`, never negative (a known bias that flows into population medians). |
| `unrealisedPnL` | A **percentage**, not USD: `(finalValue − initialValue) / initialValue × 100` (mark-to-market / projected ROI). |
| `projectedUnrealisedPnL` | `unrealisedPnL` annualized (a projected APR). |
| `ethAdjusted*` | The corresponding metric minus the % change of ETH price since the agent's baseline `firstFundingEthPrice` — isolates alpha from ETH beta. The baseline is captured lazily at the first portfolio-metric calculation, not literally at the first funding transfer. |

The APR clock starts at `firstTradingTimestamp` (= first funding, `FundingBalance.firstInTimestamp`), falling back to the service's latest registration timestamp.

## Snapshot & Population Metric Mechanics

- Snapshots are driven by a polling block handler that runs **every 1800 blocks** (~1 hour at Mode's 2s block time), per `subgraph.yaml`. The `CHECK_INTERVAL = 100` constant and "every 100 blocks" comments in `src/portfolioScheduler.ts` are dead code — every polled block is processed.
- A service gets its **first snapshot on the first poll after its portfolio exists**, then one per UTC day at the first poll after midnight. `snapshot.timestamp` is that block's timestamp, not 00:00; snapshot IDs embed the exact timestamp.
- `DailyPopulationMetric` is **write-once per day**: it is created right after the first snapshot batch of the day and never recomputed. Agents whose snapshot lands later that day are excluded from that day's medians and `totalAgents`.
- **Median inclusion rules**: all snapshotted agents count toward `medianPopulationROI`/`APR`; agents with `initialValue < $1` **and** `finalValue == $0` are excluded from the unrealized-PnL medians only.
- The `sma7d*`/`historical*` arrays are carried forward from the **previous day's** entity (exactly `day − 86400`). If a day produced no entity, the history **resets** to just the current day's value rather than backfilling — the 7-day SMA window restarts.
- `medianAUM` uses `FundingBalance.netUsd` of the snapshotted agents; `totalFundedAUM` sums `netUsd` over **all** registered agents.

## Swap Tracking & Cost Attribution

Position costs (`totalCostsUSD`) come entirely from a LiFi swap-slippage heuristic (`src/lifiDiamond.ts`, `src/swapTracking.ts`):

- `SwapTransaction` entities are created only from `LiFiGenericSwapCompleted` events where `integrator == "valory"` and the receiver is a tracked service safe.
- `slippageUSD = (fromAmount × fromTokenPrice) − (toAmount × toTokenPrice)` using the subgraph's own pool prices — it conflates true slippage, swap fees, and price-source error, and can be negative at the swap level.
- Swaps are buffered per-agent in an `AgentSwapBuffer` with **four rotating 5-minute buckets** (string-encoded), giving an association window of roughly 20 minutes (`ASSOCIATION_WINDOW = 1200s`). Buckets rotate when a new swap arrives in a later 5-minute interval.
- When the agent opens a position, the **entire first non-empty bucket is consumed** and its summed slippage becomes the position's `swapSlippageUSD` (= `totalCostsUSD`); `investmentUSD = entryAmountUSD + totalCostsUSD`. Consequences: unrelated swaps in the same window are attributed to that position, and swaps with no position entry within the window expire unattributed (`SwapTransaction.isAssociated` stays `false`). The alternate association path (`associateSwapsWithPosition` in `src/helpers.ts`) checks the 20-minute window per swap and clamps aggregate slippage to ≥ 0.
- **Gas is never counted as a cost.**

## Supported Protocols

### Velodrome V3 (Concentrated Liquidity)
- **NFT-based positions** with tick ranges
- **Real-time position valuation** using liquidity math
- **Fee collection tracking** via Collect events
- **Periodic position revaluation** via the PortfolioScheduler block handler

### Velodrome V2 (AMM)
- **LP token-based positions** with reserves calculation
- **Stable and volatile pool support** with appropriate fee structures
- **Pool discovery** via Sugar contract and Factory events: a one-shot Sugar scan (`filter: once` block handler at block 21346000, paging `try_all` in batches of 500) seeds `VeloV2Pool` templates for existing pools whose *both* tokens are whitelisted; new pools are picked up via factory `PoolCreated` events. Pools created between the start block (15110000) and the bootstrap block are only caught by the factory path. The dedup `Map` in `src/veloV2Bootstrap.ts` is in-memory per WASM instance, so template creation relies on `create()` being idempotent.
- **Dynamic template creation** for new pools

### Balancer V2 (Weighted Pools)
- **BPT token-based positions** with vault integration
- **Multi-token pool support** with weighted calculations
- **Pool balance tracking** via PoolBalanceChanged events
- **Proportional share calculations** based on BPT holdings

### STURDY (Yearn V3 Vault)
- **Vault share-based positions** with asset conversion
- **Deposit/Withdraw event tracking** for position lifecycle
- **Underlying asset valuation** via convertToAssets calls
- **Real-time position value updates** based on vault performance

## MODE Network Specifics

### Supported Tokens
- **WETH**: `0x4200000000000000000000000000000000000006`
- **MODE**: `0xdfc7c877a950e49d2610114102175a06c2e3167a`
- **OLAS**: `0xcfd1d50ce23c46d3cf6407487b2f8934e96dc8f9`
- **ezETH**: `0x2416092f143378750bb29b79ed961ab195cceea5`
- **uniBTC**: `0x6b2a01a5f79deb4c2f3c0eda7b01df456fbd726a`
- **weETH.mode**: `0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A`
- **STONE**: `0x80137510979822322193FC997d400D5A6C747bf7`
- **USDC**: `0xd988097fb8612cc24eec14542bc03424c656005f`
- **USDT**: `0xf0f161fda2712db8b566946122a5af183995e2ed`
- **oUSDT**: `0x1217bfe6c773eec6cc4a38b5dc45b92292b6e189`

### Service Exclusions
The following service IDs are excluded from tracking (MODE-specific test services):
- Service ID 91
- Service ID 95
- Service ID 82

### Price Discovery Strategy
Since Chainlink feeds are not available on MODE Network, the subgraph uses:
1. **Velodrome V3 Pools**: Primary price source for major tokens
2. **Velodrome V2 Pools**: Secondary price source for LSTs and alternative tokens
3. **Balancer Pools**: OLAS pricing via OLAS/USDC pool
4. **Stablecoin Fallbacks**: $1.00 for USDC, USDT, oUSDT

Behavior of `getTokenPriceUSD` (`src/priceDiscovery.ts`) that consumers should know:

- **Silent-zero failure mode**: if a token has no config, or every configured source fails validation, the function returns **$0** — not an error, not a stale price. Downstream USD fields (`TokenBalance.balanceUSD`, position values, `uninvestedValue`, `finalValue`) silently become 0/understated. Check `Token.priceConfidence` and `PriceUpdate` history when values look wrong. Only the critical stablecoins (USDC, USDT, oUSDT) fall back to $1.00 (at 0.95 confidence).
- **5-minute cache**: prices are cached for 300s; the cache is only used when the stored confidence is > 0.5.
- **Confidence-weighted averaging**: when multiple sources return valid prices, they are averaged weighted by confidence (`source = "average_weighted"`).
- **Sanity bounds by symbol**: USDC/USDT/DAI/USDC.e readings outside $0.95–$1.05 are discarded; LUSD/FRAX/DOLA outside $0.50–$1.50; all other tokens outside $0.0001–$100,000.
- **Native ETH is priced as WETH** (WETH/USDC Velodrome pool).
- **`TokenBalance.balanceUSD` staleness**: balances are priced at the last transfer event and only re-priced during the daily snapshot refresh, so intraday `balanceUSD` can be stale.
- **`PriceUpdate.block` is always 0** (known limitation — no block context at write time).

## Key Features

### Portfolio Analytics
The subgraph provides comprehensive portfolio tracking with real-time performance calculations and time-based annualization.

### Population Insights
Daily calculation of population-wide metrics including median ROI/APR and 7-day moving averages for trend analysis.

### Multi-Protocol Support
Unified tracking across Velodrome Concentrated Liquidity, Velodrome V2 AMM, Balancer V2, and STURDY protocols.

### MODE-Optimized Price Discovery
Multi-source pricing using available DEX pools and stablecoin fallbacks, optimized for MODE Network's available infrastructure.

## Usage Examples

### Latest Population Metrics
```graphql
{
  dailyPopulationMetrics(first: 1, orderBy: timestamp, orderDirection: desc) {
    medianPopulationROI
    medianPopulationAPR
    sma7dROI
    sma7dAPR
    totalAgents
    timestamp
  }
}
```

### Population Trend Analysis
```graphql
{
  dailyPopulationMetrics(
    first: 30
    orderBy: timestamp
    orderDirection: desc
  ) {
    medianPopulationROI
    medianPopulationAPR
    sma7dROI
    sma7dAPR
    timestamp
  }
}
```

### Agent Portfolio Performance
```graphql
{
  agentPortfolio(id: "0x...") {
    finalValue
    initialValue
    positionsValue
    uninvestedValue
    roi
    apr
    totalPositions
    firstTradingTimestamp
  }
}
```

### Agent Portfolio History
```graphql
{
  agentPortfolioSnapshots(
    where: { service: "0x..." }
    orderBy: timestamp
    orderDirection: desc
    first: 30
  ) {
    timestamp
    finalValue
    initialValue
    roi
    apr
    totalPositions
  }
}
```

### Active DeFi Positions by Protocol
```graphql
{
  # Velodrome CL Positions
  veloCLPositions: protocolPositions(
    where: { 
      agent: "0x...", 
      isActive: true, 
      protocol: "velodrome-cl" 
    }
  ) {
    tokenId
    usdCurrent
    token0Symbol
    token1Symbol
    tickLower
    tickUpper
    liquidity
  }
  
  # Balancer Positions
  balancerPositions: protocolPositions(
    where: { 
      agent: "0x...", 
      isActive: true, 
      protocol: "balancer" 
    }
  ) {
    usdCurrent
    token0Symbol
    token1Symbol
    amount0
    amount1
  }
  
  # STURDY Positions
  sturdyPositions: protocolPositions(
    where: { 
      agent: "0x...", 
      isActive: true, 
      protocol: "STURDY" 
    }
  ) {
    usdCurrent
    amount0
    token0Symbol
  }
}
```

### Top Performing Agents
```graphql
{
  agentPortfolios(
    orderBy: roi
    orderDirection: desc
    first: 10
    where: { finalValue_gt: "100" }
  ) {
    service {
      serviceId
    }
    finalValue
    initialValue
    roi
    apr
    totalPositions
  }
}
```

### Token Balance Tracking
```graphql
{
  tokenBalances(
    where: { service: "0x..." }
    orderBy: balanceUSD
    orderDirection: desc
  ) {
    token
    symbol
    balance
    balanceUSD
    lastUpdated
  }
}
```

## Development

### Prerequisites
- Graph CLI: `yarn global add @graphprotocol/graph-cli`
- Dependencies: `yarn install`

### Building and Deploying
All commands are run from `subgraphs/babydegen-mode/`:
1. Generate types: `yarn codegen`
2. Build the subgraph: `yarn build`
3. Deploy locally: `yarn deploy:local` (or `yarn deploy:staging`); production deploys go through the repo's GitHub Actions deploy workflow (`.github/workflows/deploy-subgraph.yaml`)

Note: this subgraph has no Matchstick tests — the `yarn test` script exists but there is no `tests/` directory.

### Local Development
- The subgraph uses AssemblyScript for mapping logic
- Service events are handled in `src/serviceRegistry.ts`
- Safe events are handled in `src/safe.ts`
- Portfolio calculations are in `src/helpers.ts`
- Global metrics are calculated in `src/globalMetrics.ts`
- Daily scheduling is managed in `src/portfolioScheduler.ts`
- Protocol-specific handlers:
  - Velodrome CL: `src/veloNFTManager.ts`, `src/veloCLShared.ts`
  - Velodrome V2: `src/veloV2Pool.ts`, `src/veloV2Shared.ts`
  - Balancer: `src/balancerVault.ts`, `src/balancerShared.ts`
  - STURDY: `src/sturdyVault.ts`

## MODE Network Considerations

### No Chainlink Integration
MODE Network does not have Chainlink price feeds available. The subgraph uses:
- **Velodrome V3 pools** for primary price discovery
- **Velodrome V2 pools** for secondary price sources
- **Balancer pools** for specific token pairs
- **Stablecoin fallbacks** for reliable $1.00 pricing

### Protocol Ecosystem
MODE Network's DeFi ecosystem includes:
- **Velodrome**: Primary DEX with V2 and V3 (CL) support
- **Balancer**: Weighted pool protocol for diversified liquidity
- **STURDY**: Yield farming protocol with Yearn V3 vault integration
- **LiFi**: Cross-chain bridge and swap aggregator

### Token Ecosystem
MODE supports a diverse range of tokens including:
- **Native tokens**: WETH, MODE
- **Liquid Staking Tokens**: ezETH, weETH.mode, STONE, wrsETH
- **Stablecoins**: USDC, USDT, oUSDT
- **Cross-chain assets**: uniBTC, OLAS
- **Governance tokens**: XVELO, BMX, wMLT

## Contributing

When adding new features or modifying the subgraph:
1. Update the schema in `schema.graphql`
2. Add corresponding event handlers in the appropriate `src/` files
3. Update the subgraph configuration in `subgraph.yaml`
4. Ensure MODE-specific adaptations are maintained
5. Test thoroughly before deployment

## Migration Notes

This subgraph includes all fixes and improvements from the babydegen-optimism subgraph, adapted for MODE Network:
- Service exclusion logic for MODE-specific test services
- MODE-appropriate protocol integrations (Balancer, STURDY vs Uniswap V3)
- Velodrome pool-based price discovery (vs Chainlink feeds)
- MODE token configurations and addresses

For detailed migration information, see the babydegen-optimism subgraph history in [autonolas-subgraph-studio](https://github.com/valory-xyz/autonolas-subgraph-studio).
