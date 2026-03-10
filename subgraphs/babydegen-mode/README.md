# BabyDegen Subgraph - MODE Network

> **Migration note**: This subgraph was moved from [autonolas-subgraph-studio](https://github.com/valory-xyz/autonolas-subgraph-studio) to this infra repo because Mode chain is not supported by The Graph's hosted service and we needed historical data. This subgraph is not actively maintained and will not be updated unless absolutely necessary.

This subgraph tracks agent portfolio performance and population-level metrics for the BabyDegen agent economy on MODE Network. It monitors autonomous agents participating in DeFi protocols, tracking their portfolio performance, position management, and providing aggregated population statistics.

## Overview

The BabyDegen subgraph provides real-time indexing of autonomous agent activities, tracking:

- **Portfolio Performance**: Real-time ROI and APR calculations for each agent
- **DeFi Positions**: Multi-protocol position tracking across Velodrome, Balancer, and STURDY
- **Token Management**: Balance tracking and uninvested fund monitoring
- **Population Analytics**: Daily median metrics and 7-day moving averages
- **Daily Snapshots**: UTC midnight portfolio snapshots for historical analysis

## Data Sources

The subgraph monitors contracts on **MODE Mainnet**:

### Core Contracts
- **ServiceRegistryL2**: `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` (Block: 18056750)
- **Safe**: Dynamic multisig wallet tracking via templates

### DeFi Protocol Contracts
- **Velodrome NFT Manager**: `0x991d5546C4B442B4c5fdc4c8B8b8d131DEB24702`
- **Velodrome CL Factory**: `0x04625B046C69577EfC40e6c0Bb83CDBAfab5a55F`
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
- **finalValue**: Total current portfolio value (USD)
- **initialValue**: Initial investment from funding
- **positionsValue**: Current value of active positions
- **uninvestedValue**: Token balances in safe
- **roi**: Return on Investment percentage
- **apr**: Annualized Percentage Return
- **firstTradingTimestamp**: When agent started trading
- **totalPositions**: Count of active positions

#### `AgentPortfolioSnapshot`
Daily immutable snapshots of agent portfolio performance:
- **timestamp**: UTC midnight snapshot time
- **finalValue/initialValue**: Portfolio values at snapshot
- **roi/apr**: Performance metrics at snapshot
- **totalPositions**: Number of active positions
- **positionIds**: Active position identifiers at snapshot

### DeFi Position Entities

#### `ProtocolPosition`
Individual DeFi positions across supported protocols:
- **protocol**: "velodrome-cl", "velodrome-v2", "balancer", or "STURDY"
- **tokenId**: NFT token ID for LP positions (or BigInt.zero() for non-NFT positions)
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
Daily population-level metrics calculated at UTC midnight:
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

## Supported Protocols

### Velodrome V3 (Concentrated Liquidity)
- **NFT-based positions** with tick ranges
- **Real-time position valuation** using liquidity math
- **Fee collection tracking** via Collect events
- **Swap impact monitoring** for position updates

### Velodrome V2 (AMM)
- **LP token-based positions** with reserves calculation
- **Stable and volatile pool support** with appropriate fee structures
- **Pool discovery** via Sugar contract and Factory events
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
  protocolPositions(
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
  protocolPositions(
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
  protocolPositions(
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
    token {
      symbol
    }
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
1. Generate types: `yarn codegen-babydegen-mode`
2. Build the subgraph: `yarn build-babydegen-mode`
3. Deploy: `graph deploy --studio [SUBGRAPH_NAME]`

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

For detailed migration information, see `FUNCTIONAL_EQUIVALENCE_FIXES.md`.
