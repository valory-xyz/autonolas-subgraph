import { Address, BigInt, ethereum, Bytes } from "@graphprotocol/graph-ts"
import { getServiceByAgent } from "./config"
import { updateETHBalance } from "./tokenBalances"

// Define the event structure manually since we can't import from the generated code yet
class LiFiGenericSwapCompletedEvent extends ethereum.Event {
  get params(): LiFiGenericSwapCompletedParams {
    return new LiFiGenericSwapCompletedParams(this);
  }
}

class LiFiGenericSwapCompletedParams {
  _event: ethereum.Event;

  constructor(event: ethereum.Event) {
    this._event = event;
  }

  get transactionId(): Bytes {
    return this._event.parameters[0].value.toBytes();
  }

  get integrator(): string {
    return this._event.parameters[1].value.toString();
  }

  get referrer(): string {
    return this._event.parameters[2].value.toString();
  }

  get receiver(): Address {
    return this._event.parameters[3].value.toAddress();
  }

  get fromAssetId(): Address {
    return this._event.parameters[4].value.toAddress();
  }

  get toAssetId(): Address {
    return this._event.parameters[5].value.toAddress();
  }

  get fromAmount(): BigInt {
    return this._event.parameters[6].value.toBigInt();
  }

  get toAmount(): BigInt {
    return this._event.parameters[7].value.toBigInt();
  }
}

/**
 * Handler for LiFiGenericSwapCompleted events
 * Tracks ETH transfers during swaps with the LiFi Diamond contract
 * - Only processes events where the integrator is "valory"
 * - Only processes events where the receiver is a service safe
 * - Handles ETH outflows when fromAssetId is the zero address
 * - Handles ETH inflows when toAssetId is the zero address
 */
export function handleLiFiGenericSwapCompleted(event: LiFiGenericSwapCompletedEvent): void {
  const integrator = event.params.integrator
  const receiver = event.params.receiver
  const fromAssetId = event.params.fromAssetId
  const toAssetId = event.params.toAssetId
  const fromAmount = event.params.fromAmount
  const toAmount = event.params.toAmount
  const txHash = event.transaction.hash.toHexString()

  // Removed detailed swap logging to improve performance

  // Filter 1: Check if integrator is "valory"
  if (integrator != "valory") {
    return
  }

  // Filter 2: Check if receiver is a service safe
  const service = getServiceByAgent(receiver)
  if (service === null) {
    return
  }

  // Handle ETH outflows (fromAssetId is zero address - ETH)
  if (fromAssetId.equals(Address.zero())) {
    // Update ETH balance (outflow - decrease balance)
    updateETHBalance(receiver, fromAmount, false, event.block)
  }

  // Handle ETH inflows (toAssetId is zero address - ETH)
  if (toAssetId.equals(Address.zero())) {
    // Update ETH balance (inflow - increase balance)
    updateETHBalance(receiver, toAmount, true, event.block)
  }
}
