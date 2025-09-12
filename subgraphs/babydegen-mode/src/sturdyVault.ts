import { 
  Address, 
  BigInt, 
  BigDecimal, 
  Bytes, 
  ethereum,
  log
} from "@graphprotocol/graph-ts"

import { 
  ProtocolPosition,
  Service,
  AgentSwapBuffer
} from "../generated/schema"

import { 
  calculatePortfolioMetrics,
  updateFirstTradingTimestamp,
  parseTotalSlippageFromBucket,
  associateSwapsWithPosition
} from "./helpers"

import { getServiceByAgent } from "./config"
import { getTokenPriceUSD } from "./priceDiscovery"
import { getTokenDecimals } from "./tokenUtils"
import { STURDY_VAULT } from "./constants"

// Import the generated event types
import { Deposit, Withdraw, YearnV3Vault } from "../generated/SturdyVault/YearnV3Vault"
import { ERC20 } from "../generated/SturdyVault/ERC20"

// Create STURDY position ID with timestamp
function getSturdyPositionId(agent: Address, timestamp: BigInt): Bytes {
  // Position ID format: <agent>-sturdy-<timestamp>
  const positionId = agent.toHex() + "-sturdy-" + timestamp.toString()
  return Bytes.fromUTF8(positionId)
}

// Find active STURDY position for agent
function findActiveSturdyPosition(agent: Address): ProtocolPosition | null {
  let service = Service.load(agent)
  if (service == null || service.positionIds == null) {
    return null
  }
  
  let positionIds = service.positionIds
  for (let i = 0; i < positionIds.length; i++) {
    let positionIdString = positionIds[i]
    
    // Only check STURDY positions
    if (positionIdString.includes("-sturdy-")) {
      let directId = Bytes.fromUTF8(positionIdString)
      let position = ProtocolPosition.load(directId)
      
      if (position != null && position.isActive && position.protocol == "STURDY") {
        return position
      }
    }
  }
  
  return null
}

// Helper function to convert token amount to human readable format
function toHumanAmount(amount: BigInt, decimals: i32): BigDecimal {
  if (amount.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  let divisor = BigInt.fromI32(10).pow(decimals as u8)
  return amount.toBigDecimal().div(divisor.toBigDecimal())
}

// Handle STURDY Yearn V3 Vault deposit events
export function handleSturdyDeposit(event: Deposit): void {
  const sender = event.params.sender
  const owner = event.params.owner
  const assets = event.params.assets
  const shares = event.params.shares
  
  // Check if the owner is a tracked service
  const service = getServiceByAgent(owner)
  
  if (service != null) {
    // Create or update STURDY position
    refreshSturdyPosition(
      owner,
      event.block,
      event.transaction.hash,
      assets,
      true // isDeposit
    )
  }
}

// Handle STURDY Yearn V3 Vault withdraw events
export function handleSturdyWithdraw(event: Withdraw): void {
  const sender = event.params.sender
  const receiver = event.params.receiver
  const owner = event.params.owner
  const assets = event.params.assets
  const shares = event.params.shares
  
  // Check if the owner is a tracked service (owner is the one withdrawing)
  const service = getServiceByAgent(owner)
  
  if (service != null) {
    // Update STURDY position
    refreshSturdyPosition(
      owner,
      event.block,
      event.transaction.hash,
      assets,
      false // isDeposit
    )
  }
}

// Create or update STURDY position
function refreshSturdyPosition(
  agent: Address,
  block: ethereum.Block,
  txHash: Bytes,
  assets: BigInt,
  isDeposit: boolean
): void {
  let position: ProtocolPosition | null = null
  let positionIdBytes: Bytes
  let positionId: string
  
  if (isDeposit) {
    // For deposits: Check if there's an active position, if not create new one
    position = findActiveSturdyPosition(agent)
    
    if (position != null) {
      // Use existing active position
      positionIdBytes = position.id
      positionId = positionIdBytes.toString()
    } else {
      // No active position - create new one with timestamp
      positionIdBytes = getSturdyPositionId(agent, block.timestamp)
      positionId = positionIdBytes.toString()
    }
  } else {
    // For withdrawals: Find the active position
    position = findActiveSturdyPosition(agent)
    
    if (position == null) {
      return
    }
    
    positionIdBytes = position.id
    positionId = positionIdBytes.toString()
  }
  
  // Get vault contract to access underlying asset
  let vaultContract = YearnV3Vault.bind(STURDY_VAULT)
  let underlyingAsset = vaultContract.asset()
  
  if (position == null) {
    // Create new position
    position = new ProtocolPosition(positionIdBytes)
    position.agent = agent
    position.protocol = "STURDY"
    position.pool = STURDY_VAULT // Use vault address as pool address
    position.isActive = true
    
    // Initialize entry tracking fields
    position.entryAmount0 = BigDecimal.zero()
    position.entryAmount0USD = BigDecimal.zero()
    position.entryAmount1 = BigDecimal.zero()
    position.entryAmount1USD = BigDecimal.zero()
    position.entryAmountUSD = BigDecimal.zero()
    
    // Entry tracking
    position.entryTxHash = txHash
    position.entryTimestamp = block.timestamp
    
    // Required fields for schema
    position.tokenId = BigInt.zero() // Not applicable for vault positions
    position.tickLower = 0 // Not applicable for vault positions
    position.tickUpper = 0 // Not applicable for vault positions
    position.liquidity = BigInt.zero() // Store vault shares in liquidity field
    
    // Set token0 as the underlying asset (e.g., WETH), token1 as null
    position.token0 = underlyingAsset
    position.token1 = null
    
    // Set ALL required fields BEFORE calling any initialization functions
    position.amount0 = BigDecimal.zero()
    position.amount0USD = BigDecimal.zero()
    position.amount1 = BigDecimal.zero()
    position.amount1USD = BigDecimal.zero()
    position.usdCurrent = BigDecimal.zero()
    
    // Add position to service
    let service = Service.load(agent)
    if (service != null) {
      let positionIds = service.positionIds
      if (positionIds == null) {
        positionIds = []
      }
      positionIds.push(positionId)
      service.positionIds = positionIds
      service.save()
    }
    
    // Update first trading timestamp
    updateFirstTradingTimestamp(agent, block.timestamp)
    
    // Initialize cost tracking for new position - AFTER all required fields are set
    position.totalCostsUSD = BigDecimal.zero()
    position.swapSlippageUSD = BigDecimal.zero()
    position.investmentUSD = BigDecimal.zero()
    position.grossGainUSD = BigDecimal.zero()
    position.netGainUSD = BigDecimal.zero()
    position.positionROI = BigDecimal.zero()
    
    // Associate swaps with position using centralized function
    let totalSlippageUSD = associateSwapsWithPosition(agent, block)
    
    // Update position costs if any swaps were associated
    if (totalSlippageUSD.gt(BigDecimal.zero())) {
      position.swapSlippageUSD = totalSlippageUSD
      position.totalCostsUSD = totalSlippageUSD
      position.investmentUSD = position.entryAmountUSD.plus(totalSlippageUSD)
    }
  }
  
  // Get underlying asset decimals
  let assetContract = ERC20.bind(underlyingAsset)
  let assetDecimals = assetContract.decimals()
  
  let assetsHuman = toHumanAmount(assets, assetDecimals)
  
  // Get USD price of underlying asset (not vault shares)
  let assetPrice = getTokenPriceUSD(underlyingAsset, block.timestamp, false)
  let assetsUSD = assetPrice.times(assetsHuman)
  
  if (isDeposit) {
    // Handle deposit - increase position
    position.amount0 = position.amount0!.plus(assetsHuman)
    position.amount0USD = position.amount0USD.plus(assetsUSD)
    
    // FIXED: Only set entry amounts for truly new positions (revert to working condition)
    if (position.entryAmountUSD.equals(BigDecimal.zero())) {
      position.entryAmount0 = assetsHuman
      position.entryAmount0USD = assetsUSD
      position.entryAmountUSD = assetsUSD
    }
    // DO NOT add to existing entry amounts - this prevents the duplicate issue
    // Entry amounts should only be set once per position lifecycle
    
    // Ensure position is active
    position.isActive = true
  } else {
    // Handle withdraw - decrease position
    position.amount0 = position.amount0!.minus(assetsHuman)
    position.amount0USD = position.amount0USD.minus(assetsUSD)
    
    // Check if position should be closed based on vault shares = 0
    let shareBalance = vaultContract.balanceOf(agent)
    
    if (shareBalance.equals(BigInt.zero())) {
      // Position fully exited - set exit data and mark as inactive
      position.isActive = false
      position.amount0 = BigDecimal.zero()
      position.amount0USD = BigDecimal.zero()
      position.usdCurrent = BigDecimal.zero()
      
      // Set exit tracking data
      position.exitTxHash = txHash
      position.exitTimestamp = block.timestamp
      position.exitAmount0 = assetsHuman
      position.exitAmount0USD = assetsUSD
      position.exitAmount1 = BigDecimal.zero()
      position.exitAmount1USD = BigDecimal.zero()
      position.exitAmountUSD = assetsUSD
    }
  }
  
  // Calculate current USD value by getting current vault balance and converting to assets
  let currentUSDValue = calculateSturdyPositionValue(agent, underlyingAsset, block.timestamp)
  position.usdCurrent = currentUSDValue
  position.amount0USD = currentUSDValue // Update current amount0USD to match
  
  position.save()
  
  // Update portfolio metrics
  calculatePortfolioMetrics(agent, block)
}

// Calculate current USD value of STURDY position
function calculateSturdyPositionValue(agent: Address, underlyingAsset: Address, timestamp: BigInt): BigDecimal {
  let vaultContract = YearnV3Vault.bind(STURDY_VAULT)
  
  // Get agent's vault share balance
  let shareBalance = vaultContract.balanceOf(agent)
  
  if (shareBalance.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  // Convert shares to underlying assets using convertToAssets
  let underlyingAmount = vaultContract.convertToAssets(shareBalance)
  
  // Get underlying asset decimals and convert to human readable
  let assetContract = ERC20.bind(underlyingAsset)
  let assetDecimals = assetContract.decimals()
  let underlyingHuman = toHumanAmount(underlyingAmount, assetDecimals as i32)
  
  // Get USD price of underlying asset
  let assetPrice = getTokenPriceUSD(underlyingAsset, timestamp, false)
  let usdValue = assetPrice.times(underlyingHuman)
  
  return usdValue
}
