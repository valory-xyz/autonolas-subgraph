import { 
  Mint,
  Burn,
  Transfer
} from "../generated/VeloV2Pool_USDC_LUSD/VelodromeV2Pool"

import { 
  refreshVeloV2Position,
  refreshVeloV2PositionWithBurnAmounts
} from "./veloV2Shared"

import { log } from "@graphprotocol/graph-ts"
import { isSafe } from "./common"

// Handle direct VelodromeV2 Pool Mint events
export function handleVeloV2DirectMint(event: Mint): void {
  // For direct pool tracking, we don't need to wait for Transfer
  // The Mint event tells us liquidity was added
  // But we still need the Transfer event to know who received the LP tokens
}

// Handle direct VelodromeV2 Pool Burn events
export function handleVeloV2DirectBurn(event: Burn): void {
  const userAddress = event.transaction.from
  
  refreshVeloV2PositionWithBurnAmounts(
    userAddress,
    event.address,
    event.block,
    event.params.amount0,
    event.params.amount1,
    event.transaction.hash
  )
}

// Handle direct VelodromeV2 Pool Transfer events
export function handleVeloV2DirectTransfer(event: Transfer): void {
  const from = event.params.from
  const to = event.params.to
  const value = event.params.value
  
  // Handle minting (from zero address)
  if (from.toHexString() == "0x0000000000000000000000000000000000000000") {
    if (isSafe(to)) {
      refreshVeloV2Position(to, event.address, event.block, event.transaction.hash)
    } else {
      refreshVeloV2Position(to, event.address, event.block, event.transaction.hash)
    }
    return
  }
  
  // Handle burning (to zero address)
  if (to.toHexString() == "0x0000000000000000000000000000000000000000") {
    refreshVeloV2Position(from, event.address, event.block, event.transaction.hash)
    return
  }
  
  // Handle regular transfers
  refreshVeloV2Position(from, event.address, event.block, event.transaction.hash)
  refreshVeloV2Position(to, event.address, event.block, event.transaction.hash)
}
