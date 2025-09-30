import { BigDecimal, BigInt, Address, Bytes, log, ethereum } from "@graphprotocol/graph-ts"
import { 
  FundingBalance, 
  AgentPortfolio, 
  AgentPortfolioSnapshot,
  ProtocolPosition,
  Service,
  AgentSwapBuffer,
  SwapTransaction,
  DailyPopulationMetric
} from "../generated/schema"
import { calculateUninvestedValue, updateFundingBalance } from "./tokenBalances"
import { getServiceByAgent } from "./config"
import { calculateActualROI, aggregateClosedPositionMetrics } from "./roiCalculation"
import { getEthUsd } from "./common"
import { calculateGlobalMetrics } from "./globalMetrics"

export class EthAdjustedMetrics {
  ethPriceAtBaseline: BigDecimal
  ethPriceCurrent: BigDecimal
  ethDelta: BigDecimal
  
  constructor(ethPriceAtBaseline: BigDecimal, ethPriceCurrent: BigDecimal) {
    this.ethPriceAtBaseline = ethPriceAtBaseline
    this.ethPriceCurrent = ethPriceCurrent
    
    if (ethPriceAtBaseline.gt(BigDecimal.zero())) {
      this.ethDelta = ethPriceCurrent.div(ethPriceAtBaseline)
        .minus(BigDecimal.fromString("1"))
        .times(BigDecimal.fromString("100"))
    } else {
      this.ethDelta = BigDecimal.zero()
    }
  }
  
  calculateEthAdjustedROI(originalROI: BigDecimal): BigDecimal {
    return originalROI.minus(this.ethDelta)
  }
  
  calculateEthAdjustedAPR(originalROI: BigDecimal, daysSinceStart: BigDecimal): BigDecimal {
    // Calculate ETH-adjusted ROI first
    let ethAdjustedROI = this.calculateEthAdjustedROI(originalROI)
    
    // Then calculate APR from ETH-adjusted ROI
    if (daysSinceStart.gt(BigDecimal.zero())) {
      let annualizationFactor = BigDecimal.fromString("365").div(daysSinceStart)
      return ethAdjustedROI.times(annualizationFactor)
    }
    
    return BigDecimal.zero()
  }
}

export function calculateEthAdjustedMetrics(
  portfolio: AgentPortfolio,
  block: ethereum.Block
): EthAdjustedMetrics {
  let ethPriceCurrent = getEthUsd(block)
  
  let ethPriceAtBaseline = portfolio.firstFundingEthPrice
  if (ethPriceAtBaseline.equals(BigDecimal.zero())) {
    ethPriceAtBaseline = ethPriceCurrent
  }
  
  return new EthAdjustedMetrics(ethPriceAtBaseline, ethPriceCurrent)
}

export function updateFunding(
  serviceSafe: Address,
  usd: BigDecimal,
  deposit: boolean,
  ts: BigInt
): void {
  updateFundingBalance(serviceSafe, usd, deposit, ts)
  
  let block = new ethereum.Block(
    Bytes.empty(),
    Bytes.empty(),
    Bytes.empty(),
    Address.zero(),
    Bytes.empty(),
    Bytes.empty(),
    Bytes.empty(),
    BigInt.zero(),
    BigInt.zero(),
    BigInt.zero(),
    ts,
    BigInt.zero(),
    BigInt.zero(),
    BigInt.zero(),
    BigInt.zero()
  )
  calculatePortfolioMetrics(serviceSafe, block)
}

// Calculate portfolio metrics for an agent
export function calculatePortfolioMetrics(
  serviceSafe: Address, 
  block: ethereum.Block
): void {
  // Check if this is a valid service
  let service = getServiceByAgent(serviceSafe)
  if (service == null) {
    return
  }
  
  // Ensure portfolio exists (replaces the existing if/else logic)
  let portfolio = ensureAgentPortfolio(serviceSafe, block.timestamp)
  
  // 1. Get initial investment from FundingBalance
  let fundingBalance = FundingBalance.load(serviceSafe as Bytes)
  let initialValue = fundingBalance ? fundingBalance.netUsd : BigDecimal.zero()
  let totalWithdrawn = fundingBalance ? fundingBalance.totalWithdrawnUsd : BigDecimal.zero()
  
  // 2. Calculate total positions value
  let positionsValue = calculatePositionsValue(serviceSafe)
  
  // 3. Calculate uninvested funds
  let uninvestedValue = calculateUninvestedValue(serviceSafe)
  
  // 4. Calculate total portfolio value (positions + uninvested + withdrawals)
  let finalValue = positionsValue.plus(uninvestedValue).plus(totalWithdrawn)
  
  // 5. Calculate projected ROI (current portfolio-based calculation)
  let projectedRoi = BigDecimal.zero()
  
  if (initialValue.gt(BigDecimal.zero())) {
    // Projected ROI = (final_value - initial_value) / initial_value * 100
    let profit = finalValue.minus(initialValue)
    projectedRoi = profit.div(initialValue).times(BigDecimal.fromString("100"))
  }
  
  // Calculate new position-based ROI from closed positions
  let actualROI = calculateActualROI(serviceSafe)
  let aggregates = aggregateClosedPositionMetrics(serviceSafe)

  // Calculate APR from actual ROI (position-based)
  let actualAPR = BigDecimal.zero()
  // Calculate projected APR from projected ROI - initialize to zero
  let projectedAPR = BigDecimal.zero()
  
  if (actualROI.gt(BigDecimal.zero())) {
    let timestampForAPR = portfolio.firstTradingTimestamp
    
    // Fallback: If no trading activity, use service creation timestamp
    if (timestampForAPR.equals(BigInt.zero())) {
      let serviceEntity = Service.load(serviceSafe)
      if (serviceEntity != null && serviceEntity.latestRegistrationTimestamp.gt(BigInt.zero())) {
        timestampForAPR = serviceEntity.latestRegistrationTimestamp
      }
    }
    
    if (timestampForAPR.gt(BigInt.zero())) {
      let secondsSinceStart = block.timestamp.minus(timestampForAPR)
      let daysSinceStart = secondsSinceStart.toBigDecimal().div(BigDecimal.fromString("86400"))
      
      if (daysSinceStart.gt(BigDecimal.zero())) {
        // APR = actual_roi * (365 / days_invested)
        let annualizationFactor = BigDecimal.fromString("365").div(daysSinceStart)
        actualAPR = actualROI.times(annualizationFactor)
      }
    }
  }

  if (projectedRoi.gt(BigDecimal.zero())) {
    let timestampForAPR = portfolio.firstTradingTimestamp
    
    // Fallback: If no trading activity, use service creation timestamp
    if (timestampForAPR.equals(BigInt.zero())) {
      let serviceEntity = Service.load(serviceSafe)
      if (serviceEntity != null && serviceEntity.latestRegistrationTimestamp.gt(BigInt.zero())) {
        timestampForAPR = serviceEntity.latestRegistrationTimestamp
      }
    }
    
    if (timestampForAPR.gt(BigInt.zero())) {
      let secondsSinceStart = block.timestamp.minus(timestampForAPR)
      let daysSinceStart = secondsSinceStart.toBigDecimal().div(BigDecimal.fromString("86400"))
      
      if (daysSinceStart.gt(BigDecimal.zero())) {
        // Projected APR = projected_roi * (365 / days_invested)
        let annualizationFactor = BigDecimal.fromString("365").div(daysSinceStart)
        projectedAPR = projectedRoi.times(annualizationFactor)
      }
    }
  }

  // Calculate ETH-adjusted metrics
  let ethMetrics = calculateEthAdjustedMetrics(portfolio, block)
  
  // Set baseline ETH price if not already set
  if (portfolio.firstFundingEthPrice.equals(BigDecimal.zero())) {
    portfolio.firstFundingEthPrice = ethMetrics.ethPriceCurrent
  }
  
  // Update current ETH price
  portfolio.currentEthPrice = ethMetrics.ethPriceCurrent
  
  // Calculate ETH-adjusted ROI and APR
  let ethAdjustedProjectedRoi = ethMetrics.calculateEthAdjustedROI(projectedRoi)
  let ethAdjustedRoi = ethMetrics.calculateEthAdjustedROI(actualROI)
  
  // Calculate ETH-adjusted APR from ETH-adjusted ROI using days since start
  let ethAdjustedProjectedApr = BigDecimal.zero()
  let ethAdjustedApr = BigDecimal.zero()
  
  // Get days since start for APR calculation
  let timestampForAPR = portfolio.firstTradingTimestamp
  if (timestampForAPR.equals(BigInt.zero())) {
    let serviceEntity = Service.load(serviceSafe)
    if (serviceEntity != null && serviceEntity.latestRegistrationTimestamp.gt(BigInt.zero())) {
      timestampForAPR = serviceEntity.latestRegistrationTimestamp
    }
  }
  
  if (timestampForAPR.gt(BigInt.zero())) {
    let secondsSinceStart = block.timestamp.minus(timestampForAPR)
    let daysSinceStart = secondsSinceStart.toBigDecimal().div(BigDecimal.fromString("86400"))
    
    ethAdjustedProjectedApr = ethMetrics.calculateEthAdjustedAPR(projectedRoi, daysSinceStart)
    ethAdjustedApr = ethMetrics.calculateEthAdjustedAPR(actualROI, daysSinceStart)
  }

  // Update portfolio
  portfolio.finalValue = finalValue
  portfolio.initialValue = initialValue  
  portfolio.positionsValue = positionsValue
  portfolio.uninvestedValue = uninvestedValue
  portfolio.totalWithdrawnUSD = totalWithdrawn  // Total amount withdrawn to EOAs
  portfolio.unrealisedPnL = projectedRoi  // Current portfolio-based calculation (unrealized PnL)
  portfolio.projectedUnrealisedPnL = projectedAPR  // APR calculated from unrealized PnL
  portfolio.roi = actualROI  //Position-based ROI from closed positions
  portfolio.apr = actualAPR  // APR calculated from actual ROI
  
  // Update ETH-adjusted metrics
  portfolio.ethAdjustedUnrealisedPnL = ethAdjustedProjectedRoi
  portfolio.ethAdjustedProjectedUnrealisedPnL = ethAdjustedProjectedApr
  portfolio.ethAdjustedRoi = ethAdjustedRoi
  portfolio.ethAdjustedApr = ethAdjustedApr
  
  portfolio.lastUpdated = block.timestamp

  // Update aggregation fields
  portfolio.totalInvestments = aggregates.totalInvestments
  portfolio.totalGrossGains = aggregates.totalGrossGains
  portfolio.totalCosts = aggregates.totalCosts
  
  let activeCount = 0
  let closedCount = 0
  
  let serviceEntity = Service.load(serviceSafe)
  if (serviceEntity != null && serviceEntity.positionIds != null) {
    let positionIds = serviceEntity.positionIds
    for (let i = 0; i < positionIds.length; i++) {
      let positionIdString = positionIds[i]
      let position: ProtocolPosition | null = null

      let directId = Bytes.fromUTF8(positionIdString)
      position = ProtocolPosition.load(directId)

      if (position == null) {
        if (positionIdString.startsWith("0x") && positionIdString.length % 2 == 0) {
          let hexBytes = Bytes.fromHexString(positionIdString)
          let decodedString = hexBytes.toString()
          let decodedId = Bytes.fromUTF8(decodedString)
          position = ProtocolPosition.load(decodedId)
        }
      }

      if (position != null) {
        if (position.isActive) {
          activeCount++
        } else {
          closedCount++
        }
      }
    }
  }
  
  portfolio.totalPositions = activeCount
  portfolio.totalClosedPositions = closedCount
  
  portfolio.save()
  createPortfolioSnapshot(portfolio, block)

  triggerGlobalMetricsIfNeeded(block)
}

function calculatePositionsValue(serviceSafe: Address): BigDecimal {
  let totalValue = BigDecimal.zero()
  
  let service = Service.load(serviceSafe)
  if (service == null || service.positionIds == null) {
    return totalValue
  }
  
  let positionIds = service.positionIds
  
  for (let i = 0; i < positionIds.length; i++) {
    let positionIdString = positionIds[i]
    let position: ProtocolPosition | null = null

    let directId = Bytes.fromUTF8(positionIdString)
    position = ProtocolPosition.load(directId)

    if (position == null) {
      if (positionIdString.startsWith("0x") && positionIdString.length % 2 == 0) {
        let hexBytes = Bytes.fromHexString(positionIdString)
        let decodedString = hexBytes.toString()
        let decodedId = Bytes.fromUTF8(decodedString)
        position = ProtocolPosition.load(decodedId)
      }
    }

    if (position != null && position.isActive) {
      totalValue = totalValue.plus(position.usdCurrent)
    }
  }
  
  return totalValue
}

function createPortfolioSnapshot(portfolio: AgentPortfolio, block: ethereum.Block): void {
  let snapshotId = portfolio.id.toHexString() + "-" + block.timestamp.toString()
  let snapshot = new AgentPortfolioSnapshot(Bytes.fromUTF8(snapshotId))
  
  snapshot.service = portfolio.service
  snapshot.portfolio = portfolio.id
  snapshot.finalValue = portfolio.finalValue
  snapshot.initialValue = portfolio.initialValue
  snapshot.positionsValue = portfolio.positionsValue
  snapshot.uninvestedValue = portfolio.uninvestedValue
  snapshot.totalWithdrawnUSD = portfolio.totalWithdrawnUSD
  snapshot.unrealisedPnL = portfolio.unrealisedPnL
  snapshot.projectedUnrealisedPnL = portfolio.projectedUnrealisedPnL
  snapshot.roi = portfolio.roi
  snapshot.apr = portfolio.apr
  snapshot.ethAdjustedUnrealisedPnL = portfolio.ethAdjustedUnrealisedPnL
  snapshot.ethAdjustedProjectedUnrealisedPnL = portfolio.ethAdjustedProjectedUnrealisedPnL
  snapshot.ethAdjustedRoi = portfolio.ethAdjustedRoi
  snapshot.ethAdjustedApr = portfolio.ethAdjustedApr
  snapshot.timestamp = block.timestamp
  snapshot.block = block.number
  snapshot.totalPositions = portfolio.totalPositions
  snapshot.totalClosedPositions = portfolio.totalClosedPositions
  
  snapshot.save()
  
  // CRITICAL FIX: Update portfolio snapshot tracking
  // This ensures the scheduler knows when the last snapshot was taken
  portfolio.lastSnapshotTimestamp = block.timestamp
  portfolio.lastSnapshotBlock = block.number
  portfolio.save()
}

export function parseTotalSlippageFromBucket(bucketData: string): BigDecimal {
  if (bucketData == "") return BigDecimal.zero()
  
  let totalSlippage = BigDecimal.zero()
  let swapEntries = bucketData.split("|")
  
  for (let i = 0; i < swapEntries.length; i++) {
    let entry = swapEntries[i]
    if (entry == "") continue
    
    let parts = entry.split(",")
    if (parts.length >= 3) {
      let slippageStr = parts[2]
      let slippage = BigDecimal.fromString(slippageStr)
      totalSlippage = totalSlippage.plus(slippage)
    }
  }
  
  return totalSlippage
}

export function associateSwapsWithPosition(
  userAddress: Address, 
  block: ethereum.Block,
  position: ProtocolPosition | null = null
): BigDecimal {
  const bufferId = userAddress
  let buffer = AgentSwapBuffer.load(bufferId)
  if (buffer == null) {
    return BigDecimal.zero()
  }
  
  let totalSlippageUSD = BigDecimal.zero()
  let currentTime = block.timestamp
  let associationWindow = BigInt.fromI32(1200)
  
  let bucketsToCheck = [buffer.bucket0Swaps, buffer.bucket1Swaps, buffer.bucket2Swaps, buffer.bucket3Swaps]
  let updatedBuckets: string[] = ["", "", "", ""]
  
  for (let bucketIdx = 0; bucketIdx < bucketsToCheck.length; bucketIdx++) {
    let bucketData = bucketsToCheck[bucketIdx]
    if (bucketData == "") {
      updatedBuckets[bucketIdx] = ""
      continue
    }
    
    let remainingSwaps: string[] = []
    let associatedSwaps: string[] = []
    let swapEntries = bucketData.split("|")
    
    for (let i = 0; i < swapEntries.length; i++) {
      let entry = swapEntries[i]
      if (entry == "") continue
      
      let parts = entry.split(",")
      if (parts.length >= 4) {
        let swapTimestamp = BigInt.fromString(parts[0])
        let expiresAtStr = parts[3]
        let expiresAt = BigInt.fromString(expiresAtStr)
        
        if (currentTime.minus(swapTimestamp).le(associationWindow) && currentTime.le(expiresAt)) {
          associatedSwaps.push(entry)
        } else {
          remainingSwaps.push(entry)
        }
      }
    }
    
    if (associatedSwaps.length > 0) {
      let associatedBucketData = associatedSwaps.join("|")
      let bucketSlippage = parseTotalSlippageFromBucket(associatedBucketData)
      totalSlippageUSD = totalSlippageUSD.plus(bucketSlippage)
      
      for (let j = 0; j < associatedSwaps.length; j++) {
        let swapEntry = associatedSwaps[j]
        let swapParts = swapEntry.split(",")
        if (swapParts.length >= 5) {
          let swapId = swapParts[4]
          let swapTransaction = SwapTransaction.load(Bytes.fromHexString(swapId))
          if (swapTransaction != null) {
            swapTransaction.isAssociated = true
            swapTransaction.save()
            
            // Note: swaps field removed from ProtocolPosition schema
            // Swap association is now tracked via SwapToEntryAssociation entity
          }
        }
      }
    }
    
    updatedBuckets[bucketIdx] = remainingSwaps.join("|")
  }
  
  buffer.bucket0Swaps = updatedBuckets[0]
  buffer.bucket1Swaps = updatedBuckets[1]
  buffer.bucket2Swaps = updatedBuckets[2]
  buffer.bucket3Swaps = updatedBuckets[3]
  buffer.save()
  
  if (totalSlippageUSD.lt(BigDecimal.zero())) {
    totalSlippageUSD = BigDecimal.zero()
  }
  
  return totalSlippageUSD
}

export function ensureAgentPortfolio(serviceSafe: Address, timestamp: BigInt): AgentPortfolio {
  let portfolioId = serviceSafe as Bytes
  let portfolio = AgentPortfolio.load(portfolioId)

  if (portfolio == null) {
    portfolio = new AgentPortfolio(portfolioId)
    portfolio.service = serviceSafe
    portfolio.lastSnapshotTimestamp = BigInt.zero()
    portfolio.lastSnapshotBlock = BigInt.zero()
    portfolio.totalPositions = 0
    portfolio.totalClosedPositions = 0
    portfolio.finalValue = BigDecimal.zero()
    portfolio.initialValue = BigDecimal.zero()
    portfolio.positionsValue = BigDecimal.zero()
    portfolio.uninvestedValue = BigDecimal.zero()
    portfolio.totalWithdrawnUSD = BigDecimal.zero()
    portfolio.unrealisedPnL = BigDecimal.zero()
    portfolio.projectedUnrealisedPnL = BigDecimal.zero()
    portfolio.roi = BigDecimal.zero()
    portfolio.totalInvestments = BigDecimal.zero()
    portfolio.totalGrossGains = BigDecimal.zero()
    portfolio.totalCosts = BigDecimal.zero()
    portfolio.apr = BigDecimal.zero()
    portfolio.ethAdjustedUnrealisedPnL = BigDecimal.zero()
    portfolio.ethAdjustedProjectedUnrealisedPnL = BigDecimal.zero()
    portfolio.ethAdjustedRoi = BigDecimal.zero()
    portfolio.ethAdjustedApr = BigDecimal.zero()
    portfolio.firstFundingEthPrice = BigDecimal.zero()
    portfolio.currentEthPrice = BigDecimal.zero()
    portfolio.lastUpdated = timestamp
    
    // Set firstTradingTimestamp from funding balance if available
    let fundingBalance = FundingBalance.load(serviceSafe as Bytes)
    if (fundingBalance && fundingBalance.firstInTimestamp.gt(BigInt.zero())) {
      portfolio.firstTradingTimestamp = fundingBalance.firstInTimestamp
    } else {
      portfolio.firstTradingTimestamp = BigInt.zero()
    }
    
    portfolio.save()
  }

  return portfolio
}

export function updateFirstTradingTimestamp(serviceSafe: Address, timestamp: BigInt): void {
  let portfolio = ensureAgentPortfolio(serviceSafe, timestamp)

  if (portfolio.firstTradingTimestamp.equals(BigInt.zero())) {
    portfolio.firstTradingTimestamp = timestamp
    portfolio.save()
  }
}

// Helper function to get day timestamp (UTC midnight)
function getDayTimestamp(timestamp: BigInt): BigInt {
  const ONE_DAY = BigInt.fromI32(86400) // 86400 seconds in a day
  return timestamp.div(ONE_DAY).times(ONE_DAY)
}

// Trigger global metrics calculation if needed
function triggerGlobalMetricsIfNeeded(block: ethereum.Block): void {
  let currentDayTimestamp = getDayTimestamp(block.timestamp)
  let globalId = currentDayTimestamp.toString()
  
  // Check if we already have global metrics for today
  let existingMetrics = DailyPopulationMetric.load(Bytes.fromUTF8(globalId))
  
  if (existingMetrics == null) {
    // No global metrics for today yet, calculate them
    log.info("Triggering global metrics calculation for day timestamp {}", [currentDayTimestamp.toString()])
    calculateGlobalMetrics(block)
  }
}
