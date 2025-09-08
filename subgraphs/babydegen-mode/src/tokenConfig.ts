import { Address, BigInt } from "@graphprotocol/graph-ts"
import { 
  WETH, MODE, OLAS, EZETH, UNIBTC, WEETH_MODE, STONE, WRSETH, WMLT, BMX, XVELO, USDC, USDT, OUSDT,
  WETH_USDC_VELOV3_POOL, VELO_WETH_VELOV3_POOL, OUSDT_USDC_VELOV3_POOL, WETH_MODE_VELOV3_POOL,
  EZETH_WETH_VELOV2_POOL, WEETH_WETH_VELOV2_POOL, STONE_WETH_VELOV2_POOL, USDT_USDC_VELOV2_POOL,
  OLAS_USDC_BALANCER_POOL
} from "./constants"

// Token configurations with empty price sources for MODE chain
export const TOKENS = new Map<string, TokenConfig>()

export class TokenConfig {
  address: Address
  symbol: string
  decimals: i32
  priceSources: PriceSourceConfig[]
  
  constructor(
    address: Address,
    symbol: string,
    decimals: i32,
    priceSources: PriceSourceConfig[]
  ) {
    this.address = address
    this.symbol = symbol
    this.decimals = decimals
    this.priceSources = priceSources
  }
}

export class PriceSourceConfig {
  address: Address
  sourceType: string
  priority: i32
  pairToken: Address | null
  fee: i32
  confidence: i32  // Expected confidence level (0-100)
  
  constructor(
    address: Address,
    sourceType: string,
    priority: i32,
    confidence: i32 = 95,
    pairToken: Address | null = null,
    fee: i32 = 0
  ) {
    this.address = address
    this.sourceType = sourceType
    this.priority = priority
    this.confidence = confidence
    this.pairToken = pairToken
    this.fee = fee
  }
}

export function getTokenConfig(address: Address): TokenConfig | null {
  let key = address.toHexString().toLowerCase()
  if (TOKENS.has(key)) {
    let config = TOKENS.get(key)
    return config ? config : null
  }
  return null
}

// Initialize token configurations with empty price sources
function initializeTokens(): void {
  
  // Native ETH - Use same pricing as WETH (1 ETH = 1 WETH)
  TOKENS.set("0x0000000000000000000000000000000000000000", new TokenConfig(
    Address.fromString("0x0000000000000000000000000000000000000000"),
    "ETH",
    18,
    [
      new PriceSourceConfig(WETH_USDC_VELOV3_POOL, "velodrome_slipstream", 1, 95, USDC, 500)
    ]
  ))

  // WETH - Direct USDC pair via Velodrome V3
  TOKENS.set(WETH.toHexString().toLowerCase(), new TokenConfig(
    WETH,
    "WETH",
    18,
    [
      new PriceSourceConfig(WETH_USDC_VELOV3_POOL, "velodrome_slipstream", 1, 95, USDC, 500)
    ]
  ))

  // MODE - WETH pair via Velodrome V3, requires multi-hop pricing (MODE → WETH → USDC)
  TOKENS.set(MODE.toHexString().toLowerCase(), new TokenConfig(
    MODE,
    "MODE",
    18,
    [
      new PriceSourceConfig(WETH_MODE_VELOV3_POOL, "velodrome_slipstream", 1, 90, WETH, 500)
    ]
  ))

  // OLAS - Direct USDC pair via Balancer
  TOKENS.set(OLAS.toHexString().toLowerCase(), new TokenConfig(
    OLAS,
    "OLAS",
    18,
    [
      new PriceSourceConfig(OLAS_USDC_BALANCER_POOL, "balancer", 1, 95, USDC, 0)
    ]
  ))

  // ezETH - WETH pair via Velodrome V2, requires multi-hop pricing (ezETH → WETH → USDC)
  TOKENS.set(EZETH.toHexString().toLowerCase(), new TokenConfig(
    EZETH,
    "ezETH",
    18,
    [
      new PriceSourceConfig(EZETH_WETH_VELOV2_POOL, "velodrome_v2", 1, 90, WETH, 0)
    ]
  ))

  // uniBTC - No price sources configured (not in requirements)
  TOKENS.set(UNIBTC.toHexString().toLowerCase(), new TokenConfig(
    UNIBTC,
    "uniBTC",
    8,
    [] // No price sources configured
  ))

  // weETH.mode - WETH pair via Velodrome V2, requires multi-hop pricing (weETH → WETH → USDC)
  TOKENS.set(WEETH_MODE.toHexString().toLowerCase(), new TokenConfig(
    WEETH_MODE,
    "weETH.mode",
    18,
    [
      new PriceSourceConfig(WEETH_WETH_VELOV2_POOL, "velodrome_v2", 1, 90, WETH, 0)
    ]
  ))

  // STONE - WETH pair via Velodrome V2, requires multi-hop pricing (STONE → WETH → USDC)
  TOKENS.set(STONE.toHexString().toLowerCase(), new TokenConfig(
    STONE,
    "STONE",
    18,
    [
      new PriceSourceConfig(STONE_WETH_VELOV2_POOL, "velodrome_v2", 1, 90, WETH, 0)
    ]
  ))

  // wrsETH - No price sources configured (not in requirements)
  TOKENS.set(WRSETH.toHexString().toLowerCase(), new TokenConfig(
    WRSETH,
    "wrsETH",
    18,
    [] // No price sources configured
  ))

  // wMLT - No price sources configured (not in requirements)
  TOKENS.set(WMLT.toHexString().toLowerCase(), new TokenConfig(
    WMLT,
    "wMLT",
    18,
    [] // No price sources configured
  ))

  // BMX - No price sources configured (not in requirements)
  TOKENS.set(BMX.toHexString().toLowerCase(), new TokenConfig(
    BMX,
    "BMX",
    18,
    [] // No price sources configured
  ))

  // XVELO - WETH pair via Velodrome V3, requires multi-hop pricing (VELO → WETH → USDC)
  TOKENS.set(XVELO.toHexString().toLowerCase(), new TokenConfig(
    XVELO,
    "XVELO",
    18,
    [
      new PriceSourceConfig(VELO_WETH_VELOV3_POOL, "velodrome_slipstream", 1, 90, WETH, 500)
    ]
  ))

  // USDC - Stablecoin, uses fallback pricing (no pool needed)
  TOKENS.set(USDC.toHexString().toLowerCase(), new TokenConfig(
    USDC,
    "USDC",
    6,
    [] // Stablecoin - uses fallback pricing
  ))

  // USDT - USDC pair via Velodrome V2
  TOKENS.set(USDT.toHexString().toLowerCase(), new TokenConfig(
    USDT,
    "USDT",
    6,
    [
      new PriceSourceConfig(USDT_USDC_VELOV2_POOL, "velodrome_v2", 1, 95, USDC, 0)
    ]
  ))

  // oUSDT - USDC pair via Velodrome V3
  TOKENS.set(OUSDT.toHexString().toLowerCase(), new TokenConfig(
    OUSDT,
    "oUSDT",
    6,
    [
      new PriceSourceConfig(OUSDT_USDC_VELOV3_POOL, "velodrome_slipstream", 1, 95, USDC, 500)
    ]
  ))
}

// Call initialization
initializeTokens()
