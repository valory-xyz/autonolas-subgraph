import { Address, BigInt } from "@graphprotocol/graph-ts"
import { LiFiGenericSwapCompleted } from "../generated/LiFiDiamond/LiFiDiamond"
import { getServiceByAgent } from "./config"
import { updateETHBalance } from "./tokenBalances"
import { createSwapTransaction } from "./swapTracking"

export function handleLiFiGenericSwapCompleted(event: LiFiGenericSwapCompleted): void {
  const integrator = event.params.integrator
  const receiver = event.params.receiver
  const fromAssetId = event.params.fromAssetId
  const toAssetId = event.params.toAssetId
  const fromAmount = event.params.fromAmount
  const toAmount = event.params.toAmount
  const transactionId = event.params.transactionId

  if (integrator != "valory") {
    return
  }

  const service = getServiceByAgent(receiver)
  if (service === null) {
    return
  }

  createSwapTransaction(
    receiver,
    transactionId,
    event.transaction.hash,
    event.block.timestamp,
    event.block.number,
    fromAssetId,
    toAssetId,
    fromAmount,
    toAmount,
    event.logIndex
  )

  if (fromAssetId.equals(Address.zero())) {
    updateETHBalance(receiver, fromAmount, false, event.block)
  }

  if (toAssetId.equals(Address.zero())) {
    updateETHBalance(receiver, toAmount, true, event.block)
  }
}
