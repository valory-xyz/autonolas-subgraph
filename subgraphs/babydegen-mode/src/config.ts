import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts"
import { Service } from "../generated/schema"

// =============================================================================
// DYNAMIC SERVICE CONFIGURATION
// =============================================================================

// Token addresses (network-specific) - Keep these as they're protocol tokens, not service-specific
export const USDC_NATIVE = Address.fromString("0xd988097fb8612cc24eec14542bc03424c656005f") // USDC on MODE
export const USDT_NATIVE = Address.fromString("0xf0f161fda2712db8b566946122a5af183995e2ed") // USDT on MODE

// Chainlink price feeds are NOT available on MODE network
// ETH pricing: Use WETH/USDC Velodrome V3 pool via tokenConfig.ts
// USDC pricing: Use stablecoin fallback ($1.00) via priceDiscovery.ts
// No Chainlink feeds should be used for MODE network
export const USDC_BRIDGED = USDC_NATIVE // MODE only has one USDC

// Other contract addresses
export const VELO_NFT_MANAGER = Address.fromString("0x991d5546C4B442B4c5fdc4c8B8b8d131DEB24702")

// Service lookup functions - now uses dynamic service registry
export function getServiceByAgent(address: Address): Service | null {
  // Load service directly by address (service safe address is the entity ID)
  return Service.load(Address.fromString(address.toHexString().toLowerCase()))
}

export function isServiceAgent(address: Address): boolean {
  return getServiceByAgent(address) !== null
}

// Legacy function name for compatibility
export function isValidAgent(address: Address): boolean {
  return isServiceAgent(address)
}
