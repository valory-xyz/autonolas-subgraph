import { 
  BigInt, 
  BigDecimal, 
  Address, 
  Bytes,
  ethereum,
  log
} from "@graphprotocol/graph-ts"

import { ProtocolPosition, Service, AgentSwapBuffer } from "../generated/schema"
import { BalancerV2WeightedPool } from "../generated/BalancerVault/BalancerV2WeightedPool"
import { BalancerV2Vault } from "../generated/BalancerVault/BalancerV2Vault"
import { ERC20 } from "../generated/BalancerVault/ERC20"
import { getTokenPriceUSD } from "./priceDiscovery"
import { getServiceByAgent } from "./config"
import { updateFirstTradingTimestamp, calculatePortfolioMetrics, parseTotalSlippageFromBucket, associateSwapsWithPosition } from "./helpers"
import { getTokenDecimals, getTokenSymbol } from "./tokenUtils"
import { BALANCER_VAULT } from "./constants"

// Helper function to convert token amount to human readable format
function toHumanAmount(amount: BigInt, decimals: i32): BigDecimal {
  if (amount.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  let divisor = BigInt.fromI32(10).pow(decimals as u8)
  return amount.toBigDecimal().div(divisor.toBigDecimal())
}

// Extract pool address from poolId (first 20 bytes of 32-byte poolId)
export function extractPoolAddress(poolId: Bytes): Address {
  // Balancer poolId is 32 bytes: first 20 bytes are pool address, last 12 bytes are specialization
  const poolAddressHex = poolId.toHexString().slice(0, 42) // "0x" + 40 hex chars = 20 bytes
  return Address.fromString(poolAddressHex)
}

// Detect transaction type based on deltas array
export function detectTransactionType(deltas: Array<BigInt>): string {
  let positiveCount = 0
  let negativeCount = 0
  let zeroCount = 0
  
  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i]
    if (delta.gt(BigInt.zero())) {
      positiveCount++
    } else if (delta.lt(BigInt.zero())) {
      negativeCount++
    } else {
      zeroCount++
    }
  }
  
  // All positive deltas = entry (adding liquidity)
  if (positiveCount > 0 && negativeCount == 0) {
    return "entry"
  }
  
  // All negative deltas = exit (removing liquidity)
  if (negativeCount > 0 && positiveCount == 0) {
    return "exit"
  }
  
  // Mixed deltas = rebalancing or complex operation
  if (positiveCount > 0 && negativeCount > 0) {
    return "rebalance"
  }
  
  // All zero deltas = no change
  return "no-change"
}

// Create or get Balancer position ID
export function getBalancerPositionId(userAddress: Address, poolAddress: Address): Bytes {
  // Position ID format: <serviceSafe>-balancer-<poolAddress>
  const positionId = userAddress.toHex() + "-balancer-" + poolAddress.toHex()
  return Bytes.fromUTF8(positionId)
}

// Get BPT (Balancer Pool Token) balance via RPC call
export function getBPTBalance(serviceSafe: Address, poolAddress: Address): BigDecimal {
  // Use the pool contract as an ERC20 token to get BPT balance
  const poolContract = BalancerV2WeightedPool.bind(poolAddress)
  
  // Get the user's BPT balance using the pool contract's balanceOf method
  const balanceResult = poolContract.try_balanceOf(serviceSafe)
  
  if (balanceResult.reverted) {
    return BigDecimal.zero()
  }
  
  // BPT tokens typically have 18 decimals
  const bptBalance = toHumanAmount(balanceResult.value, 18)
  
  return bptBalance
}



// Refresh Balancer position with event amounts (for PoolBalanceChanged events)
export function refreshBalancerPositionWithEventAmounts(
  userAddress: Address,
  poolAddress: Address,
  poolId: Bytes,
  tokens: Array<Address>,
  deltas: Array<BigInt>,
  block: ethereum.Block,
  txHash: Bytes
): void {
  const positionId = getBalancerPositionId(userAddress, poolAddress)
  
  // Service validation - early return if not a service
  const service = getServiceByAgent(userAddress)
  if (service == null) {
    return
  }
  
  let pp = ProtocolPosition.load(positionId)
  if (!pp) {
    pp = new ProtocolPosition(positionId)
    pp.agent = userAddress
    pp.protocol = "balancer"
    pp.pool = poolAddress
    pp.isActive = true
    pp.tokenId = BigInt.fromUnsignedBytes(poolId) // Store poolId as tokenId for uniqueness
    
    // Update service positionIds array
    let serviceEntity = Service.load(userAddress)
    if (serviceEntity != null) {
      if (serviceEntity.positionIds == null) {
        serviceEntity.positionIds = []
      }
      let positionIds = serviceEntity.positionIds
      let positionIdString = positionId.toHexString()
      if (positionIds.indexOf(positionIdString) == -1) {
        positionIds.push(positionIdString)
        serviceEntity.positionIds = positionIds
        serviceEntity.save()
      }
      
      // Update first trading timestamp
      updateFirstTradingTimestamp(userAddress, block.timestamp)
    }
    
    // Initialize cost tracking for new position
    pp.totalCostsUSD = BigDecimal.zero()
    pp.swapSlippageUSD = BigDecimal.zero()
    pp.investmentUSD = BigDecimal.zero()
    pp.grossGainUSD = BigDecimal.zero()
    pp.netGainUSD = BigDecimal.zero()
    pp.positionROI = BigDecimal.zero()
    
    // Use centralized swap association logic
    let totalSlippageUSD = associateSwapsWithPosition(userAddress, block)
    
    // Update position costs if any swaps were associated
    if (totalSlippageUSD.gt(BigDecimal.zero())) {
      pp.swapSlippageUSD = totalSlippageUSD
      pp.totalCostsUSD = totalSlippageUSD
      pp.investmentUSD = pp.entryAmountUSD.plus(totalSlippageUSD)
    }
    
    // Initialize all required fields
    pp.usdCurrent = BigDecimal.zero()
    pp.amount0 = BigDecimal.zero()
    pp.amount0USD = BigDecimal.zero()
    pp.amount1 = BigDecimal.zero()
    pp.amount1USD = BigDecimal.zero()
    pp.liquidity = BigInt.zero()
    
    // Initialize entry tracking fields
    pp.entryTxHash = txHash
    pp.entryTimestamp = block.timestamp
    pp.entryAmount0 = BigDecimal.zero()
    pp.entryAmount0USD = BigDecimal.zero()
    pp.entryAmount1 = BigDecimal.zero()
    pp.entryAmount1USD = BigDecimal.zero()
    pp.entryAmountUSD = BigDecimal.zero()
    
    // Initialize static metadata fields
    pp.tickLower = 0
    pp.tickUpper = 0
    pp.tickSpacing = 0 // Not applicable for Balancer
    pp.fee = 0 // Will be set based on pool
    
    // Get pool metadata
    const poolContract = BalancerV2WeightedPool.bind(poolAddress)
    
    // Set token0 and token1 as first two tokens in the pool
    if (tokens.length >= 2) {
      pp.token0 = tokens[0]
      pp.token1 = tokens[1]
      pp.token0Symbol = getTokenSymbol(tokens[0])
      pp.token1Symbol = getTokenSymbol(tokens[1])
    } else if (tokens.length == 1) {
      pp.token0 = tokens[0]
      pp.token1 = null
      pp.token0Symbol = getTokenSymbol(tokens[0])
      pp.token1Symbol = null
    }
    
    // Try to get swap fee from pool
    const swapFeeResult = poolContract.try_getSwapFeePercentage()
    if (!swapFeeResult.reverted) {
      // Convert from 18 decimal percentage to basis points
      const feeDecimal = toHumanAmount(swapFeeResult.value, 18)
      const feeBasisPoints = feeDecimal.times(BigDecimal.fromString("10000"))
      pp.fee = I32.parseInt(feeBasisPoints.toString()) // Convert to basis points
    }
  }
  
  // Process event amounts for entry tracking
  const transactionType = detectTransactionType(deltas)
  
  if (transactionType == "entry") {
    // Calculate USD values for entry amounts
    let totalEntryUSD = BigDecimal.zero()
    let amount0Delta = BigDecimal.zero()
    let amount1Delta = BigDecimal.zero()
    let amount0USD = BigDecimal.zero()
    let amount1USD = BigDecimal.zero()
    
    for (let i = 0; i < tokens.length && i < deltas.length; i++) {
      const token = tokens[i]
      const delta = deltas[i]
      
      if (delta.gt(BigInt.zero())) {
        const tokenDecimals = getTokenDecimals(token)
        const deltaHuman = toHumanAmount(delta, tokenDecimals)
        const tokenPrice = getTokenPriceUSD(token, block.timestamp, false)
        const deltaUSD = tokenPrice.times(deltaHuman)
        
        totalEntryUSD = totalEntryUSD.plus(deltaUSD)
        
        // Map to token0/token1 for consistency
        if (pp.token0 && token.equals(Address.fromBytes(pp.token0!))) {
          amount0Delta = amount0Delta.plus(deltaHuman)
          amount0USD = amount0USD.plus(deltaUSD)
        } else if (pp.token1 && token.equals(Address.fromBytes(pp.token1!))) {
          amount1Delta = amount1Delta.plus(deltaHuman)
          amount1USD = amount1USD.plus(deltaUSD)
        }
      }
    }
    
    // Update entry amounts
    if (pp.entryAmountUSD.equals(BigDecimal.zero())) {
      // First entry
      pp.entryTxHash = txHash
      pp.entryTimestamp = block.timestamp
      pp.entryAmount0 = amount0Delta
      pp.entryAmount0USD = amount0USD
      pp.entryAmount1 = amount1Delta
      pp.entryAmount1USD = amount1USD
      pp.entryAmountUSD = totalEntryUSD
    } else {
      // Additional entry
      pp.entryAmount0 = pp.entryAmount0.plus(amount0Delta)
      pp.entryAmount0USD = pp.entryAmount0USD.plus(amount0USD)
      pp.entryAmount1 = pp.entryAmount1.plus(amount1Delta)
      pp.entryAmount1USD = pp.entryAmount1USD.plus(amount1USD)
      pp.entryAmountUSD = pp.entryAmountUSD.plus(totalEntryUSD)
    }
    
  } else if (transactionType == "exit") {
    // Handle exit tracking
    let totalExitUSD = BigDecimal.zero()
    let amount0Delta = BigDecimal.zero()
    let amount1Delta = BigDecimal.zero()
    let amount0USD = BigDecimal.zero()
    let amount1USD = BigDecimal.zero()
    
    for (let i = 0; i < tokens.length && i < deltas.length; i++) {
      const token = tokens[i]
      const delta = deltas[i]
      
      if (delta.lt(BigInt.zero())) {
        const tokenDecimals = getTokenDecimals(token)
        const deltaHuman = toHumanAmount(delta.neg(), tokenDecimals) // Make positive
        const tokenPrice = getTokenPriceUSD(token, block.timestamp, false)
        const deltaUSD = tokenPrice.times(deltaHuman)
        
        totalExitUSD = totalExitUSD.plus(deltaUSD)
        
        // Map to token0/token1 for consistency
        if (pp.token0 && token.equals(Address.fromBytes(pp.token0!))) {
          amount0Delta = amount0Delta.plus(deltaHuman)
          amount0USD = amount0USD.plus(deltaUSD)
        } else if (pp.token1 && token.equals(Address.fromBytes(pp.token1!))) {
          amount1Delta = amount1Delta.plus(deltaHuman)
          amount1USD = amount1USD.plus(deltaUSD)
        }
      }
    }
    
    // Update exit tracking
    pp.exitTxHash = txHash
    pp.exitTimestamp = block.timestamp
    pp.exitAmount0 = amount0Delta
    pp.exitAmount0USD = amount0USD
    pp.exitAmount1 = amount1Delta
    pp.exitAmount1USD = amount1USD
    pp.exitAmountUSD = totalExitUSD
    
  }
  
  // Save and refresh current state
  pp.save()
  refreshBalancerPosition(userAddress, poolAddress, poolId, block, txHash)
}

// Refresh Balancer position (for current state updates)
export function refreshBalancerPosition(
  userAddress: Address,
  poolAddress: Address,
  poolId: Bytes,
  block: ethereum.Block,
  txHash: Bytes
): void {
  const positionId = getBalancerPositionId(userAddress, poolAddress)
  
  // Only track positions owned by a service
  const service = getServiceByAgent(userAddress)
  if (service == null) {
    return
  }
  
  let pp = ProtocolPosition.load(positionId)
  if (!pp) {
    // Create a new position if it doesn't exist
    pp = new ProtocolPosition(positionId)
    pp.agent = userAddress
    pp.protocol = "balancer"
    pp.pool = poolAddress
    pp.isActive = true
    pp.tokenId = BigInt.fromUnsignedBytes(poolId)
    
    // Update service positionIds array
    let serviceEntity = Service.load(userAddress)
    if (serviceEntity != null) {
      if (serviceEntity.positionIds == null) {
        serviceEntity.positionIds = []
      }
      let positionIds = serviceEntity.positionIds
      let positionIdString = positionId.toHexString()
      if (positionIds.indexOf(positionIdString) == -1) {
        positionIds.push(positionIdString)
        serviceEntity.positionIds = positionIds
        serviceEntity.save()
      }
      
      // Update first trading timestamp
      updateFirstTradingTimestamp(userAddress, block.timestamp)
    }
    
    // Initialize entry tracking fields
    pp.entryTxHash = txHash
    pp.entryTimestamp = block.timestamp
    pp.entryAmount0 = BigDecimal.zero()
    pp.entryAmount0USD = BigDecimal.zero()
    pp.entryAmount1 = BigDecimal.zero()
    pp.entryAmount1USD = BigDecimal.zero()
    pp.entryAmountUSD = BigDecimal.zero()
    
    // Initialize static metadata fields
    pp.tickLower = 0
    pp.tickUpper = 0
    pp.tickSpacing = 0
    pp.fee = 30 // 30 basis points = 0.3% (default for Balancer pools)
    
    // Set ALL required fields BEFORE calling any initialization functions
    pp.usdCurrent = BigDecimal.zero()
    pp.amount0 = BigDecimal.zero()
    pp.amount0USD = BigDecimal.zero()
    pp.amount1 = BigDecimal.zero()
    pp.amount1USD = BigDecimal.zero()
    pp.liquidity = BigInt.zero()
    
    // Initialize cost tracking for new position (inline) - AFTER all required fields are set
    pp.totalCostsUSD = BigDecimal.zero()
    pp.swapSlippageUSD = BigDecimal.zero()
    pp.investmentUSD = BigDecimal.zero()
    pp.grossGainUSD = BigDecimal.zero()
    pp.netGainUSD = BigDecimal.zero()
    pp.positionROI = BigDecimal.zero()
  }
  
  // Get current BPT balance
  const bptBalance = getBPTBalance(userAddress, poolAddress)
  
  // If user has no BPT tokens, mark position as inactive
  if (bptBalance.equals(BigDecimal.zero())) {
    pp.isActive = false
    pp.usdCurrent = BigDecimal.zero()
    pp.amount0 = BigDecimal.zero()
    pp.amount0USD = BigDecimal.zero()
    pp.amount1 = BigDecimal.zero()
    pp.amount1USD = BigDecimal.zero()
    pp.liquidity = BigInt.zero()
    
  } else {
    // Calculate position value directly using Balancer Vault - following Velodrome/Sturdy pattern
    const vaultContract = BalancerV2Vault.bind(BALANCER_VAULT)
    const poolTokensResult = vaultContract.try_getPoolTokens(poolId)
    
    if (!poolTokensResult.reverted) {
      const poolTokens = poolTokensResult.value.value0
      const poolBalances = poolTokensResult.value.value1
      
      // Get pool's total supply
      const poolContract = BalancerV2WeightedPool.bind(poolAddress)
      const totalSupplyResult = poolContract.try_totalSupply()
      
      if (!totalSupplyResult.reverted) {
        const totalSupply = totalSupplyResult.value
        const totalSupplyHuman = toHumanAmount(totalSupply, 18)
        
        // Calculate user's share of the pool
        const userShare = bptBalance.div(totalSupplyHuman)
        
        let totalUSD = BigDecimal.zero()
        let amount0Current = BigDecimal.zero()
        let amount1Current = BigDecimal.zero()
        let amount0USD = BigDecimal.zero()
        let amount1USD = BigDecimal.zero()
        
        // Calculate user's token amounts based on their share
        for (let i = 0; i < poolTokens.length && i < poolBalances.length; i++) {
          const token = poolTokens[i]
          const balance = poolBalances[i]
          
          const tokenDecimals = getTokenDecimals(token)
          const balanceHuman = toHumanAmount(balance, tokenDecimals)
          const userTokenAmount = balanceHuman.times(userShare)
          
          const tokenPrice = getTokenPriceUSD(token, block.timestamp, false)
          const tokenUSD = tokenPrice.times(userTokenAmount)
          totalUSD = totalUSD.plus(tokenUSD)
          
          // Map to amount0/amount1 for the first two tokens (following existing pattern)
          if (i == 0) {
            amount0Current = amount0Current.plus(userTokenAmount)
            amount0USD = amount0USD.plus(tokenUSD)
          } else if (i == 1) {
            amount1Current = amount1Current.plus(userTokenAmount)
            amount1USD = amount1USD.plus(tokenUSD)
          }
        }
        
        // Update ProtocolPosition fields directly (same as Velodrome/Sturdy pattern)
        pp.amount0 = amount0Current
        pp.amount1 = amount1Current
        pp.amount0USD = amount0USD
        pp.amount1USD = amount1USD
        pp.usdCurrent = totalUSD
        
        // Set token0 and token1 if not already set
        if (!pp.token0 && poolTokens.length >= 1) {
          pp.token0 = poolTokens[0]
          pp.token0Symbol = getTokenSymbol(poolTokens[0])
        }
        if (!pp.token1 && poolTokens.length >= 2) {
          pp.token1 = poolTokens[1]
          pp.token1Symbol = getTokenSymbol(poolTokens[1])
        }
        
      }
    }
    
    // Convert BPT balance to BigInt for liquidity field
    const bptWei = bptBalance.times(BigDecimal.fromString("1000000000000000000"))
    const bptWeiString = bptWei.toString()
    const dotIndex = bptWeiString.indexOf('.')
    const integerPart = dotIndex >= 0 ? bptWeiString.substring(0, dotIndex) : bptWeiString
    pp.liquidity = BigInt.fromString(integerPart)
    
    pp.isActive = true
    
    // If this is a new position (entry amounts not set), use current amounts as entry
    if (pp.entryAmountUSD.equals(BigDecimal.zero()) && pp.entryTimestamp.equals(BigInt.zero())) {
      pp.entryTxHash = txHash
      pp.entryTimestamp = block.timestamp
      pp.entryAmount0 = pp.amount0!
      pp.entryAmount0USD = pp.amount0USD
      pp.entryAmount1 = pp.amount1!
      pp.entryAmount1USD = pp.amount1USD
      pp.entryAmountUSD = pp.usdCurrent
    }
  }
  
  pp.save()
  
  // Update portfolio metrics
  calculatePortfolioMetrics(userAddress, block)
}
