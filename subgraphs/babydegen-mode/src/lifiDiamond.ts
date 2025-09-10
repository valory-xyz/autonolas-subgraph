import { Address, BigInt } from "@graphprotocol/graph-ts"
import { LiFiGenericSwapCompleted } from "../generated/LiFiDiamond/LiFiDiamond"
import { getServiceByAgent } from "./config"
import { updateETHBalance } from "./tokenBalances"
import { createSwapTransaction } from "./swapTracking"

/**
 * Handler for LiFiGenericSwapCompleted events
 * Tracks ETH transfers during swaps with the LiFi Diamond contract
 * - Only processes events where the integrator is "valory"
 * - Only processes events where the receiver is a service safe
 * - Handles ETH outflows when fromAssetId is the zero address
 * - Handles ETH inflows when toAssetId is the zero address
 * - Creates SwapTransaction entities for slippage tracking
 */
export function handleLiFiGenericSwapCompleted(event: LiFiGenericSwapCompleted): void {
  const integrator = event.params.integrator
  const receiver = event.params.receiver
  const fromAssetId = event.params.fromAssetId
  const toAssetId = event.params.toAssetId
  const fromAmount = event.params.fromAmount
  const toAmount = event.params.toAmount
  const transactionId = event.params.transactionId

  // Filter 1: Check if integrator is "valory"
  if (integrator != "valory") {
    return
  }

  // Filter 2: Check if receiver is a service safe
  const service = getServiceByAgent(receiver)
  if (service === null) {
    return
  }

  // Create SwapTransaction entity for tracking and association
  createSwapTransaction(
    receiver,                    // agent
    transactionId,              // LiFi transaction ID
    event.transaction.hash,     // transaction hash
    event.block.timestamp,      // timestamp
    event.block.number,         // block number
    fromAssetId,                // input token
    toAssetId,                  // output token
    fromAmount,                 // input amount
    toAmount,                   // output amount
    event.logIndex              // log index for unique ID
  )

  // Handle ETH outflows (fromAssetId is zero address - ETH)
  if (fromAssetId.equals(Address.zero())) {
    updateETHBalance(receiver, fromAmount, false, event.block)
  }

  // Handle ETH inflows (toAssetId is zero address - ETH)
  if (toAssetId.equals(Address.zero())) {
    updateETHBalance(receiver, toAmount, true, event.block)
  }
}
