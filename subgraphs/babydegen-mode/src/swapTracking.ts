import { 
  Address, 
  BigInt, 
  BigDecimal, 
  Bytes, 
  ethereum,
  log
} from "@graphprotocol/graph-ts"

import { 
  SwapTransaction, 
  SwapToEntryAssociation, 
  ProtocolPosition,
  Service,
  AgentSwapBuffer
} from "../generated/schema"

import { getTokenPriceUSD } from "./priceDiscovery"
import { getTokenDecimals } from "./tokenUtils"
import { parseTotalSlippageFromBucket } from "./helpers"
import { WETH } from "./constants"

const ASSOCIATION_WINDOW = BigInt.fromI32(1200)

function toHumanAmount(amount: BigInt, decimals: i32): BigDecimal {
  if (amount.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  let divisor = BigInt.fromI32(10).pow(decimals as u8)
  return amount.toBigDecimal().div(divisor.toBigDecimal())
}

function getTokenDecimalsWithFallback(tokenAddress: Address): i32 {
  if (tokenAddress.equals(Address.zero())) {
    return 18
  }
  
  return getTokenDecimals(tokenAddress)
}

function calculateExpectedOutput(
  fromAmount: BigInt,
  fromToken: Address,
  toToken: Address,
  timestamp: BigInt
): BigDecimal {
  let fromTokenForPrice = fromToken.equals(Address.zero()) ? WETH : fromToken
  let toTokenForPrice = toToken.equals(Address.zero()) ? WETH : toToken
  
  let fromPrice = getTokenPriceUSD(fromTokenForPrice, timestamp, false)
  let toPrice = getTokenPriceUSD(toTokenForPrice, timestamp, false)
  
  if (fromPrice.equals(BigDecimal.zero()) || toPrice.equals(BigDecimal.zero())) {
    return BigDecimal.zero()
  }
  
  let fromDecimals = getTokenDecimalsWithFallback(fromToken)
  let fromAmountHuman = toHumanAmount(fromAmount, fromDecimals)
  let fromAmountUSD = fromAmountHuman.times(fromPrice)
  let expectedOutputUSD = fromAmountUSD
  
  return expectedOutputUSD
}

function getBucketIndex(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(300))
}

function createSwapDataString(timestamp: BigInt, swapId: Bytes, slippageUSD: BigDecimal, expiresAt: BigInt): string {
  return timestamp.toString() + "," + swapId.toHexString() + "," + slippageUSD.toString() + "," + expiresAt.toString() + "," + swapId.toHexString()
}

export function createSwapTransaction(
  agent: Address,
  transactionId: Bytes,
  txHash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  fromAssetId: Address,
  toAssetId: Address,
  fromAmount: BigInt,
  toAmount: BigInt,
  logIndex: BigInt
): void {
  let swapId = txHash.concat(Bytes.fromUTF8("-")).concat(Bytes.fromUTF8(logIndex.toString()))
  
  let swap = new SwapTransaction(swapId)
  
  swap.agent = agent
  swap.transactionId = transactionId
  swap.txHash = txHash
  swap.timestamp = timestamp
  swap.block = blockNumber
  swap.fromAssetId = fromAssetId
  swap.toAssetId = toAssetId
  swap.fromAmount = fromAmount
  swap.toAmount = toAmount
  
  let fromDecimals = getTokenDecimalsWithFallback(fromAssetId)
  let toDecimals = getTokenDecimalsWithFallback(toAssetId)
  
  let fromAmountHuman = toHumanAmount(fromAmount, fromDecimals)
  let toAmountHuman = toHumanAmount(toAmount, toDecimals)
  
  let fromTokenForPrice = fromAssetId.equals(Address.zero()) ? WETH : fromAssetId
  let toTokenForPrice = toAssetId.equals(Address.zero()) ? WETH : toAssetId
  
  let fromPrice = getTokenPriceUSD(fromTokenForPrice, timestamp, false)
  let toPrice = getTokenPriceUSD(toTokenForPrice, timestamp, false)
  
  swap.fromAmountUSD = fromPrice.times(fromAmountHuman)
  swap.toAmountUSD = toPrice.times(toAmountHuman)
  
  let expectedToAmountUSD = calculateExpectedOutput(fromAmount, fromAssetId, toAssetId, timestamp)
  swap.expectedToAmountUSD = expectedToAmountUSD
  
  if (expectedToAmountUSD.gt(BigDecimal.zero())) {
    swap.slippageUSD = expectedToAmountUSD.minus(swap.toAmountUSD)
    swap.slippagePercentage = swap.slippageUSD.div(expectedToAmountUSD).times(BigDecimal.fromString("100"))
  } else {
    swap.slippageUSD = BigDecimal.zero()
    swap.slippagePercentage = BigDecimal.zero()
  }
  
  swap.isAssociated = false
  swap.expiresAt = timestamp.plus(ASSOCIATION_WINDOW)
  
  swap.save()
  addSwapToBuffer(agent, timestamp, swapId, swap.slippageUSD)
}

// Add swap to flattened buffer for later association
function addSwapToBuffer(agent: Address, timestamp: BigInt, swapId: Bytes, slippageUSD: BigDecimal): void {
  const bufferId = agent
  
  let buffer = AgentSwapBuffer.load(bufferId)
  if (!buffer) {
    buffer = new AgentSwapBuffer(bufferId)
    buffer.agent = agent
    buffer.bucket0Swaps = ""
    buffer.bucket1Swaps = ""
    buffer.bucket2Swaps = ""
    buffer.bucket3Swaps = ""
    buffer.totalSlippageUSD = BigDecimal.zero()
    buffer.lastUpdated = timestamp
    buffer.currentBucketIndex = getBucketIndex(timestamp)
  }
  
  // Check if we need to rotate buckets
  const newBucketIndex = getBucketIndex(timestamp)
  if (newBucketIndex > buffer.currentBucketIndex) {
    // Rotate buckets: 0→1, 1→2, 2→3, 3→discard
    buffer.bucket3Swaps = buffer.bucket2Swaps
    buffer.bucket2Swaps = buffer.bucket1Swaps
    buffer.bucket1Swaps = buffer.bucket0Swaps
    buffer.bucket0Swaps = ""
    buffer.currentBucketIndex = newBucketIndex
  }
  
  // Add swap to current bucket (bucket0)
  const expiresAt = timestamp.plus(ASSOCIATION_WINDOW)
  const swapData = createSwapDataString(timestamp, swapId, slippageUSD, expiresAt)
  if (buffer.bucket0Swaps == "") {
    buffer.bucket0Swaps = swapData
  } else {
    buffer.bucket0Swaps = buffer.bucket0Swaps + "|" + swapData
  }
  
  buffer.totalSlippageUSD = buffer.totalSlippageUSD.plus(slippageUSD)
  buffer.lastUpdated = timestamp
  buffer.save()
}

export function searchAndAssociateRecentSwaps(position: ProtocolPosition): void {
  const agent = position.agent
  const bufferId = agent
  
  let buffer = AgentSwapBuffer.load(bufferId)
  
  if (!buffer) {
    return
  }
  
  let consumedSwaps = ""
  let totalSlippage = BigDecimal.zero()
  
  if (buffer.bucket0Swaps != "") {
    consumedSwaps = buffer.bucket0Swaps
    totalSlippage = parseTotalSlippageFromBucket(buffer.bucket0Swaps)
    buffer.bucket0Swaps = ""
  } else if (buffer.bucket1Swaps != "") {
    consumedSwaps = buffer.bucket1Swaps
    totalSlippage = parseTotalSlippageFromBucket(buffer.bucket1Swaps)
    buffer.bucket1Swaps = ""
  } else if (buffer.bucket2Swaps != "") {
    consumedSwaps = buffer.bucket2Swaps
    totalSlippage = parseTotalSlippageFromBucket(buffer.bucket2Swaps)
    buffer.bucket2Swaps = ""
  } else if (buffer.bucket3Swaps != "") {
    consumedSwaps = buffer.bucket3Swaps
    totalSlippage = parseTotalSlippageFromBucket(buffer.bucket3Swaps)
    buffer.bucket3Swaps = ""
  }
  
  if (consumedSwaps != "") {
    buffer.totalSlippageUSD = buffer.totalSlippageUSD.minus(totalSlippage)
    buffer.save()
    updatePositionCosts(position, totalSlippage)
  }
}

export function associateSwapWithPosition(swap: SwapTransaction, position: ProtocolPosition): void {
  swap.isAssociated = true
  swap.save()
  
  let associationId = position.id
  let association = SwapToEntryAssociation.load(associationId)
  
  if (association == null) {
    association = new SwapToEntryAssociation(associationId)
    association.position = position.id
    association.swaps = []
    association.totalSlippageUSD = BigDecimal.zero()
    association.associationTimestamp = swap.timestamp
  }
  
  let swaps = association.swaps
  swaps.push(swap.id)
  association.swaps = swaps
  association.totalSlippageUSD = association.totalSlippageUSD.plus(swap.slippageUSD)
  
  association.save()
  updatePositionCosts(position, association.totalSlippageUSD)
}

function updatePositionCosts(position: ProtocolPosition, totalSlippageUSD: BigDecimal): void {
  position.swapSlippageUSD = totalSlippageUSD
  position.totalCostsUSD = position.swapSlippageUSD
  position.investmentUSD = position.entryAmountUSD.plus(position.totalCostsUSD)
  
  let exitAmount = position.exitAmountUSD as BigDecimal | null
  if (!position.isActive && exitAmount != null) {
    position.grossGainUSD = exitAmount
    position.netGainUSD = position.grossGainUSD.minus(position.investmentUSD)
    
    if (position.investmentUSD.gt(BigDecimal.zero())) {
      position.positionROI = position.netGainUSD.div(position.investmentUSD).times(BigDecimal.fromString("100"))
    } else {
      position.positionROI = BigDecimal.zero()
    }
  }
  
  position.save()
}
