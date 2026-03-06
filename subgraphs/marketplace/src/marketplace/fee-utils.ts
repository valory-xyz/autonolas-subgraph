import { Address, BigDecimal, BigInt, Bytes, dataSource, log } from '@graphprotocol/graph-ts';
import { BalancerV2Vault } from '../../generated/templates/MechFixedPriceToken/BalancerV2Vault';
import { BalancerV2WeightedPool } from '../../generated/templates/MechFixedPriceToken/BalancerV2WeightedPool';
import { IUniswapV2Pair } from '../../generated/templates/MechFixedPriceToken/IUniswapV2Pair';
import { AggregatorV3Interface } from '../../generated/templates/MechFixedPriceNative/AggregatorV3Interface';
import {
  getGnosisNvmXdaiRatio,
  GNOSIS_NVM_TOKEN_DECIMALS,
  getBaseNvmUsdcRatio,
  BASE_NVM_TOKEN_DECIMALS,
  CHAINLINK_PRICE_FEED_DECIMALS,
  ETH_DECIMALS,
  USDC_DECIMALS,
  CELO_DECIMALS,
  BALANCER_VAULT_ADDRESS_GNOSIS,
  BALANCER_VAULT_ADDRESS_BASE,
  BALANCER_VAULT_ADDRESS_ARBITRUM,
  OLAS_ADDRESS_GNOSIS,
  OLAS_ADDRESS_BASE,
  OLAS_ADDRESS_ETHEREUM,
  OLAS_ADDRESS_ARBITRUM,
  WXDAI_ADDRESS_GNOSIS,
  USDC_ADDRESS_BASE,
  WETH_ADDRESS_ETHEREUM,
  WETH_ADDRESS_ARBITRUM,
  OLAS_WXDAI_POOL_ADDRESS_GNOSIS,
  OLAS_USDC_POOL_ADDRESS_BASE,
  OLAS_WETH_UNISWAP_V2_PAIR_ETHEREUM,
  OLAS_WETH_POOL_ADDRESS_ARBITRUM,
  CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD,
  CHAINLINK_PRICE_FEED_ADDRESS_POLYGON_POL_USD,
  CHAINLINK_PRICE_FEED_ADDRESS_OPTIMISM_ETH_USD,
  CHAINLINK_PRICE_FEED_ADDRESS_ETHEREUM_ETH_USD,
  CHAINLINK_PRICE_FEED_ADDRESS_ARBITRUM_ETH_USD,
  CHAINLINK_PRICE_FEED_ADDRESS_CELO_CELO_USD,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN,
  GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_TOKEN,
  BASE_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC,
  BASE_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE,
  BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC,
  POLYGON_MECH_FACTORY_FIXED_PRICE_NATIVE,
  POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN,
  POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC,
  POLYGON_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC,
  OPTIMISM_MECH_FACTORY_FIXED_PRICE_NATIVE,
  OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN,
  OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC,
  OPTIMISM_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC,
  ETHEREUM_MECH_FACTORY_FIXED_PRICE_NATIVE,
  ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN,
  ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC,
  ARBITRUM_MECH_FACTORY_FIXED_PRICE_NATIVE,
  ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN,
  ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC,
  CELO_MECH_FACTORY_FIXED_PRICE_NATIVE,
  CELO_MECH_FACTORY_FIXED_PRICE_TOKEN,
  CELO_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC,
} from './constants';

// Fee unit type (matches schema FeeUnit enum)
export const FEE_UNIT_NATIVE = 'NATIVE';
export const FEE_UNIT_TOKEN = 'TOKEN';
export const FEE_UNIT_USDC = 'USDC';
export const FEE_UNIT_CREDITS = 'CREDITS';

// Detect fee unit from mech factory address
export function getFeeUnitFromMechFactory(mechFactory: Bytes): string {
  const network = dataSource.network();

  if (network == 'gnosis' || network == 'xdai') {
    if (mechFactory.equals(Bytes.fromHexString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE))) {
      return FEE_UNIT_NATIVE;
    }
    if (mechFactory.equals(Bytes.fromHexString(GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN))) {
      return FEE_UNIT_TOKEN;
    }
    if (mechFactory.equals(Bytes.fromHexString(GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE))) {
      return FEE_UNIT_CREDITS;
    }
  }

  if (network == 'base') {
    if (mechFactory.equals(Bytes.fromHexString(BASE_MECH_FACTORY_FIXED_PRICE_NATIVE))) {
      return FEE_UNIT_NATIVE;
    }
    if (mechFactory.equals(Bytes.fromHexString(BASE_MECH_FACTORY_FIXED_PRICE_TOKEN))) {
      return FEE_UNIT_TOKEN;
    }
    if (mechFactory.equals(Bytes.fromHexString(BASE_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC))) {
      return FEE_UNIT_USDC;
    }
    if (mechFactory.equals(Bytes.fromHexString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE))) {
      return FEE_UNIT_CREDITS;
    }
    if (mechFactory.equals(Bytes.fromHexString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC))) {
      return FEE_UNIT_CREDITS;
    }
  }

  if (network == 'matic') {
    if (mechFactory.equals(Bytes.fromHexString(POLYGON_MECH_FACTORY_FIXED_PRICE_NATIVE))) {
      return FEE_UNIT_NATIVE;
    }
    if (mechFactory.equals(Bytes.fromHexString(POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN))) {
      return FEE_UNIT_TOKEN;
    }
    if (mechFactory.equals(Bytes.fromHexString(POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC))) {
      return FEE_UNIT_USDC;
    }
    if (mechFactory.equals(Bytes.fromHexString(POLYGON_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC))) {
      return FEE_UNIT_CREDITS;
    }
  }

  if (network == 'optimism') {
    if (mechFactory.equals(Bytes.fromHexString(OPTIMISM_MECH_FACTORY_FIXED_PRICE_NATIVE))) {
      return FEE_UNIT_NATIVE;
    }
    if (mechFactory.equals(Bytes.fromHexString(OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN))) {
      return FEE_UNIT_TOKEN;
    }
    if (mechFactory.equals(Bytes.fromHexString(OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC))) {
      return FEE_UNIT_USDC;
    }
    if (mechFactory.equals(Bytes.fromHexString(OPTIMISM_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC))) {
      return FEE_UNIT_CREDITS;
    }
  }

  if (network == 'mainnet') {
    if (mechFactory.equals(Bytes.fromHexString(ETHEREUM_MECH_FACTORY_FIXED_PRICE_NATIVE))) {
      return FEE_UNIT_NATIVE;
    }
    if (mechFactory.equals(Bytes.fromHexString(ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN))) {
      return FEE_UNIT_TOKEN;
    }
    if (mechFactory.equals(Bytes.fromHexString(ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC))) {
      return FEE_UNIT_USDC;
    }
  }

  if (network == 'arbitrum-one') {
    if (mechFactory.equals(Bytes.fromHexString(ARBITRUM_MECH_FACTORY_FIXED_PRICE_NATIVE))) {
      return FEE_UNIT_NATIVE;
    }
    if (mechFactory.equals(Bytes.fromHexString(ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN))) {
      return FEE_UNIT_TOKEN;
    }
    if (mechFactory.equals(Bytes.fromHexString(ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC))) {
      return FEE_UNIT_USDC;
    }
  }

  if (network == 'celo') {
    if (mechFactory.equals(Bytes.fromHexString(CELO_MECH_FACTORY_FIXED_PRICE_NATIVE))) {
      return FEE_UNIT_NATIVE;
    }
    if (mechFactory.equals(Bytes.fromHexString(CELO_MECH_FACTORY_FIXED_PRICE_TOKEN))) {
      return FEE_UNIT_TOKEN;
    }
    if (mechFactory.equals(Bytes.fromHexString(CELO_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC))) {
      return FEE_UNIT_USDC;
    }
  }

  log.warning('Unknown mechFactory for fee unit detection: {} on network: {}', [mechFactory.toHexString(), network]);
  return FEE_UNIT_NATIVE;
}

// Convert Gnosis native (xDAI) wei to USD (1 xDAI ≈ 1 USD)
export function convertGnosisNativeWeiToUsd(amountInWei: BigInt): BigDecimal {
  const ethDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS);
  return amountInWei.toBigDecimal().div(ethDivisor.toBigDecimal());
}

// Convert Base native (ETH) wei to USD using Chainlink price feed
export function convertBaseNativeWeiToUsd(amountInWei: BigInt): BigDecimal {
  const priceFeed = AggregatorV3Interface.bind(
    Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD)
  );
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink price feed reverted, returning 0 USD', []);
    return BigDecimal.fromString('0');
  }

  const ethPrice = latestRoundData.value.value1; // answer field
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  return amountInWei
    .toBigDecimal()
    .times(ethPrice.toBigDecimal())
    .div(priceDivisor)
    .div(ethDivisor);
}

// Convert Polygon native (POL) wei to USD using Chainlink price feed
export function convertPolygonNativeWeiToUsd(amountInWei: BigInt): BigDecimal {
  const priceFeed = AggregatorV3Interface.bind(
    Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_POLYGON_POL_USD)
  );
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink POL/USD price feed reverted, returning 0 USD', []);
    return BigDecimal.fromString('0');
  }

  const polPrice = latestRoundData.value.value1;
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const polDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  return amountInWei
    .toBigDecimal()
    .times(polPrice.toBigDecimal())
    .div(priceDivisor)
    .div(polDivisor);
}

// Convert Optimism native (ETH) wei to USD using Chainlink price feed
export function convertOptimismNativeWeiToUsd(amountInWei: BigInt): BigDecimal {
  const priceFeed = AggregatorV3Interface.bind(
    Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_OPTIMISM_ETH_USD)
  );
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink Optimism ETH/USD price feed reverted, returning 0 USD', []);
    return BigDecimal.fromString('0');
  }

  const ethPrice = latestRoundData.value.value1;
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  return amountInWei
    .toBigDecimal()
    .times(ethPrice.toBigDecimal())
    .div(priceDivisor)
    .div(ethDivisor);
}

// Convert Ethereum native (ETH) wei to USD using Chainlink price feed
export function convertEthereumNativeWeiToUsd(amountInWei: BigInt): BigDecimal {
  const priceFeed = AggregatorV3Interface.bind(
    Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_ETHEREUM_ETH_USD)
  );
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink Ethereum ETH/USD price feed reverted, returning 0 USD', []);
    return BigDecimal.fromString('0');
  }

  const ethPrice = latestRoundData.value.value1;
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  return amountInWei
    .toBigDecimal()
    .times(ethPrice.toBigDecimal())
    .div(priceDivisor)
    .div(ethDivisor);
}

// Convert Arbitrum native (ETH) wei to USD using Chainlink price feed
export function convertArbitrumNativeWeiToUsd(amountInWei: BigInt): BigDecimal {
  const priceFeed = AggregatorV3Interface.bind(
    Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_ARBITRUM_ETH_USD)
  );
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink Arbitrum ETH/USD price feed reverted, returning 0 USD', []);
    return BigDecimal.fromString('0');
  }

  const ethPrice = latestRoundData.value.value1;
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  return amountInWei
    .toBigDecimal()
    .times(ethPrice.toBigDecimal())
    .div(priceDivisor)
    .div(ethDivisor);
}

// Convert Celo native (CELO) wei to USD using Chainlink price feed
export function convertCeloNativeWeiToUsd(amountInWei: BigInt): BigDecimal {
  const priceFeed = AggregatorV3Interface.bind(
    Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_CELO_CELO_USD)
  );
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink Celo CELO/USD price feed reverted, returning 0 USD', []);
    return BigDecimal.fromString('0');
  }

  const celoPrice = latestRoundData.value.value1;
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const celoDivisor = BigInt.fromI32(10).pow(CELO_DECIMALS).toBigDecimal();

  return amountInWei
    .toBigDecimal()
    .times(celoPrice.toBigDecimal())
    .div(priceDivisor)
    .div(celoDivisor);
}

// Convert USDC amount to USD (1 USDC = 1 USD, 6 decimals)
export function convertUsdcToUsd(amountInUsdc: BigInt): BigDecimal {
  const usdcDivisor = BigInt.fromI32(10).pow(USDC_DECIMALS);
  return amountInUsdc.toBigDecimal().div(usdcDivisor.toBigDecimal());
}

// Convert Gnosis NVM credits to USD (credits -> xDAI -> USD)
export function calculateGnosisNvmCreditsToUsd(deliveryRate: BigInt): BigDecimal {
  const tokenDivisor = BigInt.fromI32(10).pow(GNOSIS_NVM_TOKEN_DECIMALS).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  return deliveryRate
    .toBigDecimal()
    .times(getGnosisNvmXdaiRatio())
    .div(ethDivisor)
    .div(tokenDivisor);
}

// Convert Base NVM credits to USD (credits -> USDC -> USD)
export function calculateBaseNvmCreditsToUsd(deliveryRate: BigInt): BigDecimal {
  const tokenDivisor = BigInt.fromI32(10).pow(BASE_NVM_TOKEN_DECIMALS).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  return deliveryRate
    .toBigDecimal()
    .times(getBaseNvmUsdcRatio())
    .div(ethDivisor)
    .div(tokenDivisor);
}

// Get pool token balances from Balancer vault
function getPoolTokenBalances(
  vault: BalancerV2Vault,
  poolId: Bytes,
  olasAddress: Address,
  stablecoinAddress: Address
): BigInt[] {
  const poolTokensResult = vault.try_getPoolTokens(poolId);
  if (poolTokensResult.reverted) {
    log.error('Could not get pool tokens for pool {}', [poolId.toHexString()]);
    return [BigInt.zero(), BigInt.zero()];
  }

  const tokens = poolTokensResult.value.getTokens();
  const balances = poolTokensResult.value.getBalances();

  let olasBalance = BigInt.zero();
  let stablecoinBalance = BigInt.zero();

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].equals(olasAddress)) {
      olasBalance = balances[i];
    } else if (tokens[i].equals(stablecoinAddress)) {
      stablecoinBalance = balances[i];
    }
  }

  return [olasBalance, stablecoinBalance];
}

// Calculate OLAS price from pool balances
function calculateOlasPriceFromPool(
  olasAmount: BigInt,
  olasBalance: BigInt,
  stablecoinBalance: BigInt,
  stablecoinDecimals: u8
): BigDecimal {
  const olasDecimalsBigInt = BigInt.fromI32(10).pow(ETH_DECIMALS);
  const stablecoinDecimalsBigInt = BigInt.fromI32(10).pow(stablecoinDecimals);

  const olasAmountDecimal = olasAmount.toBigDecimal().div(olasDecimalsBigInt.toBigDecimal());
  const olasBalanceDecimal = olasBalance.toBigDecimal().div(olasDecimalsBigInt.toBigDecimal());
  const stablecoinBalanceDecimal = stablecoinBalance
    .toBigDecimal()
    .div(stablecoinDecimalsBigInt.toBigDecimal());

  const pricePerOlas = stablecoinBalanceDecimal.div(olasBalanceDecimal);
  return olasAmountDecimal.times(pricePerOlas);
}

// Calculate OLAS price via Uniswap V2 pair (OLAS/WETH) + Chainlink ETH/USD
function calculateOlasPriceFromUniswapV2(
  olasAmount: BigInt,
  pairAddress: Address,
  olasAddress: Address,
  chainlinkAddress: Address
): BigDecimal {
  const pair = IUniswapV2Pair.bind(pairAddress);

  const reservesResult = pair.try_getReserves();
  if (reservesResult.reverted) {
    log.warning('Uniswap V2 getReserves reverted for pair {}', [pairAddress.toHexString()]);
    return BigDecimal.fromString('0');
  }

  const token0Result = pair.try_token0();
  if (token0Result.reverted) {
    log.warning('Uniswap V2 token0 reverted for pair {}', [pairAddress.toHexString()]);
    return BigDecimal.fromString('0');
  }

  const reserve0 = reservesResult.value.value0;
  const reserve1 = reservesResult.value.value1;
  const token0 = token0Result.value;

  let olasReserve: BigInt;
  let wethReserve: BigInt;

  if (token0.equals(olasAddress)) {
    olasReserve = reserve0;
    wethReserve = reserve1;
  } else {
    olasReserve = reserve1;
    wethReserve = reserve0;
  }

  if (olasReserve.isZero() || wethReserve.isZero()) {
    log.warning('Zero reserves in Uniswap V2 pair {}', [pairAddress.toHexString()]);
    return BigDecimal.fromString('0');
  }

  // OLAS price in WETH = wethReserve / olasReserve
  const olasDecimalsBigInt = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();
  const olasPriceInWeth = wethReserve.toBigDecimal().div(olasReserve.toBigDecimal());

  // Get ETH/USD price from Chainlink
  const priceFeed = AggregatorV3Interface.bind(chainlinkAddress);
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink ETH/USD price feed reverted for OLAS conversion', []);
    return BigDecimal.fromString('0');
  }

  const ethPrice = latestRoundData.value.value1;
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const ethPriceUsd = ethPrice.toBigDecimal().div(priceDivisor);

  // OLAS amount in USD = (olasAmount / 10^18) * olasPriceInWeth * ethPriceUsd
  const olasAmountDecimal = olasAmount.toBigDecimal().div(olasDecimalsBigInt);
  return olasAmountDecimal.times(olasPriceInWeth).times(ethPriceUsd);
}

// Calculate OLAS price via Balancer V2 OLAS/WETH pool + Chainlink ETH/USD (two-step)
function calculateOlasPriceFromBalancerWeth(
  olasAmount: BigInt,
  vaultAddress: Address,
  poolAddress: Address,
  olasAddress: Address,
  wethAddress: Address,
  chainlinkAddress: Address
): BigDecimal {
  // Step 1: Get OLAS price in WETH from Balancer pool
  const pool = BalancerV2WeightedPool.bind(poolAddress);
  const poolIdResult = pool.try_getPoolId();

  if (poolIdResult.reverted) {
    log.warning('Could not get pool ID for Arbitrum OLAS/WETH conversion', []);
    return BigDecimal.fromString('0');
  }

  const poolId = poolIdResult.value;
  if (
    poolId.equals(
      Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000000')
    )
  ) {
    log.warning('Zero pool ID for Arbitrum OLAS/WETH pool', []);
    return BigDecimal.fromString('0');
  }

  const vault = BalancerV2Vault.bind(vaultAddress);
  const balances = getPoolTokenBalances(vault, poolId, olasAddress, wethAddress);
  const olasBalance = balances[0];
  const wethBalance = balances[1];

  if (olasBalance.isZero() || wethBalance.isZero()) {
    log.warning('Invalid pool balances for Arbitrum OLAS/WETH pool {}', [poolId.toHexString()]);
    return BigDecimal.fromString('0');
  }

  // OLAS price in WETH from pool balances
  const olasDecimalsBigInt = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();
  const wethDecimalsBigInt = BigInt.fromI32(10).pow(ETH_DECIMALS).toBigDecimal();

  const olasBalanceDecimal = olasBalance.toBigDecimal().div(olasDecimalsBigInt);
  const wethBalanceDecimal = wethBalance.toBigDecimal().div(wethDecimalsBigInt);
  const olasPriceInWeth = wethBalanceDecimal.div(olasBalanceDecimal);

  // Step 2: Convert WETH to USD via Chainlink
  const priceFeed = AggregatorV3Interface.bind(chainlinkAddress);
  const latestRoundData = priceFeed.try_latestRoundData();

  if (latestRoundData.reverted) {
    log.warning('Chainlink Arbitrum ETH/USD price feed reverted for OLAS conversion', []);
    return BigDecimal.fromString('0');
  }

  const ethPrice = latestRoundData.value.value1;
  const priceDivisor = BigInt.fromI32(10).pow(CHAINLINK_PRICE_FEED_DECIMALS).toBigDecimal();
  const ethPriceUsd = ethPrice.toBigDecimal().div(priceDivisor);

  // OLAS amount in USD = (olasAmount / 10^18) * olasPriceInWeth * ethPriceUsd
  const olasAmountDecimal = olasAmount.toBigDecimal().div(olasDecimalsBigInt);
  return olasAmountDecimal.times(olasPriceInWeth).times(ethPriceUsd);
}

// Convert OLAS amount to USD using DEX pool pricing
export function calculateOlasInUsd(olasAmount: BigInt): BigDecimal {
  const network = dataSource.network();

  // Ethereum: Uniswap V2 OLAS/WETH + Chainlink ETH/USD
  if (network == 'mainnet') {
    return calculateOlasPriceFromUniswapV2(
      olasAmount,
      Address.fromString(OLAS_WETH_UNISWAP_V2_PAIR_ETHEREUM),
      Address.fromString(OLAS_ADDRESS_ETHEREUM),
      Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_ETHEREUM_ETH_USD)
    );
  }

  // Arbitrum: Balancer V2 OLAS/WETH + Chainlink ETH/USD (two-step)
  if (network == 'arbitrum-one') {
    return calculateOlasPriceFromBalancerWeth(
      olasAmount,
      Address.fromString(BALANCER_VAULT_ADDRESS_ARBITRUM),
      Address.fromString(OLAS_WETH_POOL_ADDRESS_ARBITRUM),
      Address.fromString(OLAS_ADDRESS_ARBITRUM),
      Address.fromString(WETH_ADDRESS_ARBITRUM),
      Address.fromString(CHAINLINK_PRICE_FEED_ADDRESS_ARBITRUM_ETH_USD)
    );
  }

  // Celo: No OLAS pricing pool available yet
  if (network == 'celo') {
    log.warning('OLAS pricing not available on Celo, returning 0 USD', []);
    return BigDecimal.fromString('0');
  }

  // Gnosis/Base: Balancer V2 OLAS/stablecoin pool (direct USD)
  let vaultAddress = Address.zero();
  let poolAddress = Address.zero();
  let olasAddress = Address.zero();
  let stableAddress = Address.zero();
  let stableDecimals: u8 = 0;

  if (network == 'gnosis' || network == 'xdai') {
    vaultAddress = Address.fromString(BALANCER_VAULT_ADDRESS_GNOSIS);
    poolAddress = Address.fromString(OLAS_WXDAI_POOL_ADDRESS_GNOSIS);
    olasAddress = Address.fromString(OLAS_ADDRESS_GNOSIS);
    stableAddress = Address.fromString(WXDAI_ADDRESS_GNOSIS);
    stableDecimals = ETH_DECIMALS;
  }

  if (network == 'base') {
    vaultAddress = Address.fromString(BALANCER_VAULT_ADDRESS_BASE);
    poolAddress = Address.fromString(OLAS_USDC_POOL_ADDRESS_BASE);
    olasAddress = Address.fromString(OLAS_ADDRESS_BASE);
    stableAddress = Address.fromString(USDC_ADDRESS_BASE);
    stableDecimals = USDC_DECIMALS;
  }

  if (vaultAddress.equals(Address.zero())) {
    log.warning('Unknown network for OLAS conversion: {}', [network]);
    return BigDecimal.fromString('0');
  }

  // Get pool ID from pool contract
  const pool = BalancerV2WeightedPool.bind(poolAddress);
  const poolIdResult = pool.try_getPoolId();

  if (poolIdResult.reverted) {
    log.warning('Could not get pool ID for OLAS conversion', []);
    return BigDecimal.fromString('0');
  }

  const poolId = poolIdResult.value;

  if (
    poolId.equals(
      Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000000')
    )
  ) {
    log.warning('Zero pool ID provided for OLAS price calculation', []);
    return BigDecimal.fromString('0');
  }

  const vault = BalancerV2Vault.bind(vaultAddress);
  const balances = getPoolTokenBalances(vault, poolId, olasAddress, stableAddress);
  const olasBalance = balances[0];
  const stablecoinBalance = balances[1];

  if (olasBalance.isZero() || stablecoinBalance.isZero()) {
    log.warning('Invalid pool balances for pool {}', [poolId.toHexString()]);
    return BigDecimal.fromString('0');
  }

  return calculateOlasPriceFromPool(olasAmount, olasBalance, stablecoinBalance, stableDecimals);
}

// Main dispatcher: convert raw fee to USD based on fee unit and network
export function convertFeeToUsd(feeRaw: BigInt, feeUnit: string): BigDecimal {
  const network = dataSource.network();

  if (feeUnit == FEE_UNIT_NATIVE) {
    if (network == 'gnosis' || network == 'xdai') {
      return convertGnosisNativeWeiToUsd(feeRaw);
    }
    if (network == 'base') {
      return convertBaseNativeWeiToUsd(feeRaw);
    }
    if (network == 'matic') {
      return convertPolygonNativeWeiToUsd(feeRaw);
    }
    if (network == 'optimism') {
      return convertOptimismNativeWeiToUsd(feeRaw);
    }
    if (network == 'mainnet') {
      return convertEthereumNativeWeiToUsd(feeRaw);
    }
    if (network == 'arbitrum-one') {
      return convertArbitrumNativeWeiToUsd(feeRaw);
    }
    if (network == 'celo') {
      return convertCeloNativeWeiToUsd(feeRaw);
    }
  }

  if (feeUnit == FEE_UNIT_TOKEN) {
    return calculateOlasInUsd(feeRaw);
  }

  if (feeUnit == FEE_UNIT_USDC) {
    return convertUsdcToUsd(feeRaw);
  }

  if (feeUnit == FEE_UNIT_CREDITS) {
    if (network == 'gnosis' || network == 'xdai') {
      return calculateGnosisNvmCreditsToUsd(feeRaw);
    }
    if (network == 'base') {
      return calculateBaseNvmCreditsToUsd(feeRaw);
    }
  }

  log.warning('Unknown fee unit or network: {} on {}', [feeUnit, network]);
  return BigDecimal.fromString('0');
}

