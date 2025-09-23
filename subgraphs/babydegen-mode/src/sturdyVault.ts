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

import { updatePositionROI } from "./roiCalculation"

import { getServiceByAgent } from "./config"
import { getTokenPriceUSD } from "./priceDiscovery"
import { getTokenDecimals } from "./tokenUtils"
import { STURDY_VAULT } from "./constants"

import { Deposit, Withdraw, YearnV3Vault } from "../generated/SturdyVault/YearnV3Vault"
import { ERC20 } from "../generated/SturdyVault/ERC20"

function getSturdyPositionId(agent: Address, timestamp: BigInt): Bytes {
  const positionId = agent.toHex() + "-sturdy-" + timestamp.toString()
  return Bytes.fromUTF8(positionId)
}

function findActiveSturdyPosition(agent: Address): ProtocolPosition | null {
  let service = Service.load(agent)
  if (service == null || service.positionIds == null) {
    return null
  }
  
  let positionIds = service.positionIds
  for (let i = 0; i < positionIds.length; i++) {
    let positionIdString = positionIds[i]
    
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

function toHumanAmount(amount: BigInt, decimals: i32): BigDecimal {
  if (amount.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  let divisor = BigInt.fromI32(10).pow(decimals as u8)
  return amount.toBigDecimal().div(divisor.toBigDecimal())
}

export function handleSturdyDeposit(event: Deposit): void {
  const sender = event.params.sender
  const owner = event.params.owner
  const assets = event.params.assets
  const shares = event.params.shares
  
  const service = getServiceByAgent(owner)
  
  if (service != null) {
    refreshSturdyPosition(
      owner,
      event.block,
      event.transaction.hash,
      assets,
      true
    )
  }
}

export function handleSturdyWithdraw(event: Withdraw): void {
  const sender = event.params.sender
  const receiver = event.params.receiver
  const owner = event.params.owner
  const assets = event.params.assets
  const shares = event.params.shares
  
  const service = getServiceByAgent(owner)
  
  if (service != null) {
    refreshSturdyPosition(
      owner,
      event.block,
      event.transaction.hash,
      assets,
      false
    )
  }
}

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
    position = findActiveSturdyPosition(agent)
    
    if (position != null) {
      positionIdBytes = position.id
      positionId = positionIdBytes.toString()
    } else {
      positionIdBytes = getSturdyPositionId(agent, block.timestamp)
      positionId = positionIdBytes.toString()
    }
  } else {
    position = findActiveSturdyPosition(agent)
    
    if (position == null) {
      return
    }
    
    positionIdBytes = position.id
    positionId = positionIdBytes.toString()
  }
  
  let vaultContract = YearnV3Vault.bind(STURDY_VAULT)
  let underlyingAsset = vaultContract.asset()
  
  if (position == null) {
    position = new ProtocolPosition(positionIdBytes)
    position.agent = agent
    position.protocol = "STURDY"
    position.pool = STURDY_VAULT
    position.isActive = true
    
    position.entryAmount0 = BigDecimal.zero()
    position.entryAmount0USD = BigDecimal.zero()
    position.entryAmount1 = BigDecimal.zero()
    position.entryAmount1USD = BigDecimal.zero()
    position.entryAmountUSD = BigDecimal.zero()
    
    position.entryTxHash = txHash
    position.entryTimestamp = block.timestamp
    
    position.tokenId = BigInt.zero()
    position.tickLower = 0
    position.tickUpper = 0
    position.liquidity = BigInt.zero()
    
    position.token0 = underlyingAsset
    position.token1 = null
    
    position.amount0 = BigDecimal.zero()
    position.amount0USD = BigDecimal.zero()
    position.amount1 = BigDecimal.zero()
    position.amount1USD = BigDecimal.zero()
    position.usdCurrent = BigDecimal.zero()
    
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
    
    updateFirstTradingTimestamp(agent, block.timestamp)
    
    position.totalCostsUSD = BigDecimal.zero()
    position.swapSlippageUSD = BigDecimal.zero()
    position.investmentUSD = BigDecimal.zero()
    position.grossGainUSD = BigDecimal.zero()
    position.netGainUSD = BigDecimal.zero()
    position.positionROI = BigDecimal.zero()
    
    let totalSlippageUSD = associateSwapsWithPosition(agent, block, position)
    
    if (totalSlippageUSD.lt(BigDecimal.zero())) {
      totalSlippageUSD = BigDecimal.zero()
    }
    
    position.swapSlippageUSD = totalSlippageUSD
    position.totalCostsUSD = totalSlippageUSD
  }
  
  let assetContract = ERC20.bind(underlyingAsset)
  let assetDecimals = assetContract.decimals()
  
  let assetsHuman = toHumanAmount(assets, assetDecimals)
  
  let assetPrice = getTokenPriceUSD(underlyingAsset, block.timestamp, false)
  let assetsUSD = assetPrice.times(assetsHuman)
  
  if (isDeposit) {
    position.amount0 = position.amount0!.plus(assetsHuman)
    position.amount0USD = position.amount0USD.plus(assetsUSD)
    
    if (position.entryAmountUSD.equals(BigDecimal.zero())) {
      position.entryAmount0 = assetsHuman
      position.entryAmount0USD = assetsUSD
      position.entryAmountUSD = assetsUSD
      
      position.investmentUSD = position.entryAmountUSD.plus(position.totalCostsUSD)
    }
    
    position.isActive = true
  } else {
    position.amount0 = position.amount0!.minus(assetsHuman)
    position.amount0USD = position.amount0USD.minus(assetsUSD)
    
    let shareBalance = vaultContract.balanceOf(agent)
    
    if (shareBalance.equals(BigInt.zero())) {
      position.isActive = false
      position.amount0 = BigDecimal.zero()
      position.amount0USD = BigDecimal.zero()
      position.usdCurrent = BigDecimal.zero()
      
      position.exitTxHash = txHash
      position.exitTimestamp = block.timestamp
      position.exitAmount0 = assetsHuman
      position.exitAmount0USD = assetsUSD
      position.exitAmount1 = BigDecimal.zero()
      position.exitAmount1USD = BigDecimal.zero()
      position.exitAmountUSD = assetsUSD
      
      // Calculate ROI for closed position
      updatePositionROI(position)
    }
  }
  
  let currentUSDValue = calculateSturdyPositionValue(agent, underlyingAsset, block.timestamp)
  position.usdCurrent = currentUSDValue
  position.amount0USD = currentUSDValue
  
  position.save()
  calculatePortfolioMetrics(agent, block)
}

function calculateSturdyPositionValue(agent: Address, underlyingAsset: Address, timestamp: BigInt): BigDecimal {
  let vaultContract = YearnV3Vault.bind(STURDY_VAULT)
  
  let shareBalance = vaultContract.balanceOf(agent)
  
  if (shareBalance.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  let underlyingAmount = vaultContract.convertToAssets(shareBalance)
  
  let assetContract = ERC20.bind(underlyingAsset)
  let assetDecimals = assetContract.decimals()
  let underlyingHuman = toHumanAmount(underlyingAmount, assetDecimals as i32)
  
  let assetPrice = getTokenPriceUSD(underlyingAsset, timestamp, false)
  let usdValue = assetPrice.times(underlyingHuman)
  
  return usdValue
}
