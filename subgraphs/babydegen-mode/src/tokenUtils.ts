import { Address, log } from "@graphprotocol/graph-ts"
import { 
  USDC_NATIVE, 
  USDC_BRIDGED, 
  USDT, 
  WETH,
  MODE,
  OLAS,
  EZETH,
  UNIBTC,
  WEETH_MODE,
  STONE,
  WRSETH,
  WMLT,
  BMX,
  XVELO,
  OUSDT
} from "./constants"

// Centralized function to get token decimals for MODE tokens
export function getTokenDecimals(tokenAddress: Address): i32 {
  const tokenHex = tokenAddress.toHexString().toLowerCase()
  
  // MODE token decimals
  if (tokenHex == USDC_NATIVE.toHexString().toLowerCase()) return 6   // USDC
  if (tokenHex == USDC_BRIDGED.toHexString().toLowerCase()) return 6  // USDC (same as native)
  if (tokenHex == USDT.toHexString().toLowerCase()) return 6          // USDT
  if (tokenHex == OUSDT.toHexString().toLowerCase()) return 6         // oUSDT
  if (tokenHex == WETH.toHexString().toLowerCase()) return 18         // WETH
  if (tokenHex == MODE.toHexString().toLowerCase()) return 18         // MODE
  if (tokenHex == OLAS.toHexString().toLowerCase()) return 18         // OLAS
  if (tokenHex == EZETH.toHexString().toLowerCase()) return 18        // ezETH
  if (tokenHex == UNIBTC.toHexString().toLowerCase()) return 8        // uniBTC (Bitcoin has 8 decimals)
  if (tokenHex == WEETH_MODE.toHexString().toLowerCase()) return 18   // weETH.mode
  if (tokenHex == STONE.toHexString().toLowerCase()) return 18        // STONE
  if (tokenHex == WRSETH.toHexString().toLowerCase()) return 18       // wrsETH
  if (tokenHex == WMLT.toHexString().toLowerCase()) return 18         // wMLT
  if (tokenHex == BMX.toHexString().toLowerCase()) return 18          // BMX
  if (tokenHex == XVELO.toHexString().toLowerCase()) return 18        // XVELO
  
  // Default to 18 decimals for unknown tokens
  return 18
}

// Centralized function to get token symbol for MODE tokens
export function getTokenSymbol(tokenAddress: Address): string {
  const tokenHex = tokenAddress.toHexString().toLowerCase()
  
  // MODE token symbols
  if (tokenHex == USDC_NATIVE.toHexString().toLowerCase()) return "USDC"
  if (tokenHex == USDC_BRIDGED.toHexString().toLowerCase()) return "USDC"
  if (tokenHex == USDT.toHexString().toLowerCase()) return "USDT"
  if (tokenHex == OUSDT.toHexString().toLowerCase()) return "oUSDT"
  if (tokenHex == WETH.toHexString().toLowerCase()) return "WETH"
  if (tokenHex == MODE.toHexString().toLowerCase()) return "MODE"
  if (tokenHex == OLAS.toHexString().toLowerCase()) return "OLAS"
  if (tokenHex == EZETH.toHexString().toLowerCase()) return "ezETH"
  if (tokenHex == UNIBTC.toHexString().toLowerCase()) return "uniBTC"
  if (tokenHex == WEETH_MODE.toHexString().toLowerCase()) return "weETH.mode"
  if (tokenHex == STONE.toHexString().toLowerCase()) return "STONE"
  if (tokenHex == WRSETH.toHexString().toLowerCase()) return "wrsETH"
  if (tokenHex == WMLT.toHexString().toLowerCase()) return "wMLT"
  if (tokenHex == BMX.toHexString().toLowerCase()) return "BMX"
  if (tokenHex == XVELO.toHexString().toLowerCase()) return "XVELO"
  
  // Return the address as fallback for unknown tokens
  return tokenHex
}
