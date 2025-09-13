import { 
  Address, 
  BigInt, 
  BigDecimal, 
  Bytes, 
  log
} from "@graphprotocol/graph-ts"

import { 
  ProtocolPosition,
  Service
} from "../generated/schema"

// Initialize position costs for new positions
export function initializePositionCosts(position: ProtocolPosition): void {
  position.totalCostsUSD = BigDecimal.zero()
  position.swapSlippageUSD = BigDecimal.zero()
  position.investmentUSD = BigDecimal.zero()
  position.grossGainUSD = BigDecimal.zero()
  position.netGainUSD = BigDecimal.zero()
  position.positionROI = BigDecimal.zero()
}

// Calculate position-based ROI from closed positions only
// ROI = (Total_Gross_Gains - Total_Entry_Amounts - Total_Costs) / (Total_Entry_Amounts + Total_Costs) * 100
export function calculateActualROI(serviceSafe: Address): BigDecimal {
  let service = Service.load(serviceSafe)
  if (service == null || service.positionIds == null) {
    return BigDecimal.zero()
  }
  
  let totalEntryAmounts = BigDecimal.zero()  // I1 + I2 + I3 (entry amounts)
  let totalGrossGains = BigDecimal.zero()    // G1 + G2 + G3 (gross gains)
  let totalCosts = BigDecimal.zero()         // C1 + C2 + C3 (costs)
  let closedPositionCount = 0
  
  let positionIds = service.positionIds
  
  for (let i = 0; i < positionIds.length; i++) {
    let positionIdString = positionIds[i]
    let positionId = Bytes.fromUTF8(positionIdString)
    let position = ProtocolPosition.load(positionId)
    
    if (position == null || position.isActive) {
      continue // Skip active positions
    }
    
    // Only include closed positions with valid exit data
    if (!position.exitAmountUSD) {
      continue
    }
    let exitAmount = position.exitAmountUSD as BigDecimal
    if (exitAmount.equals(BigDecimal.zero())) {
      continue
    }
    
    closedPositionCount++
    totalEntryAmounts = totalEntryAmounts.plus(position.entryAmountUSD)  // I
    totalGrossGains = totalGrossGains.plus(position.grossGainUSD)        // G
    totalCosts = totalCosts.plus(position.totalCostsUSD)                 // C
  }
  
  let totalInvestmentWithCosts = totalEntryAmounts.plus(totalCosts) // I + C
  
  if (totalInvestmentWithCosts.equals(BigDecimal.zero()) || closedPositionCount == 0) {
    return BigDecimal.zero()
  }
  
  // Correct ROI formula: (G - I - C) / (I + C) * 100
  // Which simplifies to: (G - (I + C)) / (I + C) * 100
  let numerator = totalGrossGains.minus(totalInvestmentWithCosts)
  let roi = numerator.div(totalInvestmentWithCosts).times(BigDecimal.fromString("100"))
  
  log.info("Calculated actual ROI for service {}: {}% from {} closed positions (G:{}, I:{}, C:{})", [
    serviceSafe.toHexString(),
    roi.toString(),
    closedPositionCount.toString(),
    totalGrossGains.toString(),
    totalEntryAmounts.toString(),
    totalCosts.toString()
  ])
  
  return roi
}

// Aggregate closed position metrics
export function aggregateClosedPositionMetrics(serviceSafe: Address): ClosedPositionAggregates {
  let service = Service.load(serviceSafe)
  if (service == null || service.positionIds == null) {
    return new ClosedPositionAggregates(
      BigDecimal.zero(),
      BigDecimal.zero(),
      BigDecimal.zero()
    )
  }
  
  let totalInvestments = BigDecimal.zero()
  let totalGrossGains = BigDecimal.zero()
  let totalCosts = BigDecimal.zero()
  
  let positionIds = service.positionIds
  
  for (let i = 0; i < positionIds.length; i++) {
    let positionIdString = positionIds[i]
    let positionId = Bytes.fromUTF8(positionIdString)
    let position = ProtocolPosition.load(positionId)
    
    if (position == null || position.isActive) {
      continue // Skip active positions
    }
    
    // Only include closed positions with valid exit data
    if (!position.exitAmountUSD) {
      continue
    }
    let exitAmount = position.exitAmountUSD as BigDecimal
    if (exitAmount.equals(BigDecimal.zero())) {
      continue
    }
    
    totalInvestments = totalInvestments.plus(position.investmentUSD)
    totalGrossGains = totalGrossGains.plus(position.grossGainUSD)
    totalCosts = totalCosts.plus(position.totalCostsUSD)
  }
  
  return new ClosedPositionAggregates(
    totalInvestments,
    totalGrossGains,
    totalCosts
  )
}

// Helper class for aggregated metrics
export class ClosedPositionAggregates {
  totalInvestments: BigDecimal
  totalGrossGains: BigDecimal
  totalCosts: BigDecimal
  
  constructor(
    totalInvestments: BigDecimal,
    totalGrossGains: BigDecimal,
    totalCosts: BigDecimal
  ) {
    this.totalInvestments = totalInvestments
    this.totalGrossGains = totalGrossGains
    this.totalCosts = totalCosts
  }
}

// Update position ROI when position is closed
export function updatePositionROI(position: ProtocolPosition): void {
  if (position.isActive || !position.exitAmountUSD) {
    return // Only calculate ROI for closed positions
  }
  
  let exitAmount = position.exitAmountUSD as BigDecimal
  
  // Calculate gross gain (exit amount - entry amount, before costs)
  position.grossGainUSD = exitAmount.minus(position.entryAmountUSD)
  
  // Calculate net gain (exit amount - total investment including costs)
  position.netGainUSD = exitAmount.minus(position.investmentUSD)
  
  // Calculate position ROI
  if (position.investmentUSD.gt(BigDecimal.zero())) {
    position.positionROI = position.netGainUSD.div(position.investmentUSD).times(BigDecimal.fromString("100"))
  } else {
    position.positionROI = BigDecimal.zero()
  }
  
  position.save()
  
  log.info("Updated position ROI for {}: {}% (net gain: {} USD, investment: {} USD)", [
    position.id.toHexString(),
    position.positionROI.toString(),
    position.netGainUSD.toString(),
    position.investmentUSD.toString()
  ])
}

// Recalculate all position ROIs for a service (useful for data migration)
export function recalculateAllPositionROIs(serviceSafe: Address): void {
  let service = Service.load(serviceSafe)
  if (service == null || service.positionIds == null) {
    return
  }
  
  let positionIds = service.positionIds
  let updatedCount = 0
  
  for (let i = 0; i < positionIds.length; i++) {
    let positionIdString = positionIds[i]
    let positionId = Bytes.fromUTF8(positionIdString)
    let position = ProtocolPosition.load(positionId)
    
    if (position == null) {
      continue
    }
    
    // Initialize costs if not set
    if (!position.totalCostsUSD) {
      initializePositionCosts(position)
    }
    
    // Update ROI for closed positions
    if (!position.isActive && position.exitAmountUSD) {
      updatePositionROI(position)
      updatedCount++
    }
  }
  
  log.info("Recalculated ROI for {} positions for service {}", [
    updatedCount.toString(),
    serviceSafe.toHexString()
  ])
}
