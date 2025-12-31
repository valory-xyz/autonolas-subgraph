import { Address, BigDecimal, BigInt, Bytes, dataSource, log } from '@graphprotocol/graph-ts';
import { BalancerV2Vault } from '../../generated/templates/MechFixedPriceToken/BalancerV2Vault';
import { BalancerV2WeightedPool } from '../../generated/templates/MechFixedPriceToken/BalancerV2WeightedPool';
import { AggregatorV3Interface } from '../../generated/templates/MechFixedPriceNative/AggregatorV3Interface';
import {
  TOKEN_RATIO_GNOSIS,
  TOKEN_DECIMALS_GNOSIS,
  TOKEN_RATIO_BASE,
  TOKEN_DECIMALS_BASE,
  CHAINLINK_PRICE_FEED_DECIMALS,
  ETH_DECIMALS,
  USDC_DECIMALS,
  BALANCER_VAULT_ADDRESS_GNOSIS,
  BALANCER_VAULT_ADDRESS_BASE,
  OLAS_ADDRESS_GNOSIS,
  OLAS_ADDRESS_BASE,
  WXDAI_ADDRESS_GNOSIS,
  USDC_ADDRESS_BASE,
  OLAS_WXDAI_POOL_ADDRESS_GNOSIS,
  OLAS_USDC_POOL_ADDRESS_BASE,
  CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN,
  GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_TOKEN,
  BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC,
} from './constants';

// Fee unit type (matches schema FeeUnit enum)
export const FEE_UNIT_NATIVE = 'NATIVE';
export const FEE_UNIT_TOKEN = 'TOKEN';
export const FEE_UNIT_CREDITS = 'CREDITS';

// Detect fee unit from mech factory address
export function getFeeUnitFromMechFactory(mechFactory: Bytes): string {
  const factoryLower = mechFactory.toHexString().toLowerCase();

  if (
    factoryLower == GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase() ||
    factoryLower == BASE_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase()
  ) {
    return FEE_UNIT_NATIVE;
  }

  if (
    factoryLower == GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase() ||
    factoryLower == BASE_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase()
  ) {
    return FEE_UNIT_TOKEN;
  }

  if (
    factoryLower == GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE.toLowerCase() ||
    factoryLower == BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC.toLowerCase()
  ) {
    return FEE_UNIT_CREDITS;
  }

  log.warning('Unknown mechFactory for fee unit detection: {}', [factoryLower]);
  return FEE_UNIT_NATIVE; // Default fallback
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

// Convert Gnosis NVM credits to USD (credits -> xDAI -> USD)
export function calculateGnosisNvmCreditsToUsd(deliveryRate: BigInt): BigDecimal {
  const tokenDivisor = BigInt.fromI32(10).pow(TOKEN_DECIMALS_GNOSIS).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(18).toBigDecimal();

  return deliveryRate
    .toBigDecimal()
    .times(TOKEN_RATIO_GNOSIS)
    .div(ethDivisor)
    .div(tokenDivisor);
}

// Convert Base NVM credits to USD (credits -> USDC -> USD)
export function calculateBaseNvmCreditsToUsd(deliveryRate: BigInt): BigDecimal {
  const tokenDivisor = BigInt.fromI32(10).pow(TOKEN_DECIMALS_BASE).toBigDecimal();
  const ethDivisor = BigInt.fromI32(10).pow(18).toBigDecimal();

  return deliveryRate
    .toBigDecimal()
    .times(TOKEN_RATIO_BASE)
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
  const olasDecimalsBigInt = BigInt.fromI32(10).pow(18);
  const stablecoinDecimalsBigInt = BigInt.fromI32(10).pow(stablecoinDecimals);

  const olasAmountDecimal = olasAmount.toBigDecimal().div(olasDecimalsBigInt.toBigDecimal());
  const olasBalanceDecimal = olasBalance.toBigDecimal().div(olasDecimalsBigInt.toBigDecimal());
  const stablecoinBalanceDecimal = stablecoinBalance
    .toBigDecimal()
    .div(stablecoinDecimalsBigInt.toBigDecimal());

  const pricePerOlas = stablecoinBalanceDecimal.div(olasBalanceDecimal);
  return olasAmountDecimal.times(pricePerOlas);
}

// Convert OLAS amount to USD using Balancer pool
export function calculateOlasInUsd(olasAmount: BigInt): BigDecimal {
  const network = dataSource.network();
  const isGnosis = network == 'gnosis' || network == 'xdai';

  const vaultAddress = isGnosis
    ? Address.fromString(BALANCER_VAULT_ADDRESS_GNOSIS)
    : Address.fromString(BALANCER_VAULT_ADDRESS_BASE);

  const poolAddress = isGnosis
    ? Address.fromString(OLAS_WXDAI_POOL_ADDRESS_GNOSIS)
    : Address.fromString(OLAS_USDC_POOL_ADDRESS_BASE);

  const olasAddress = isGnosis
    ? Address.fromString(OLAS_ADDRESS_GNOSIS)
    : Address.fromString(OLAS_ADDRESS_BASE);

  const stableAddress = isGnosis
    ? Address.fromString(WXDAI_ADDRESS_GNOSIS)
    : Address.fromString(USDC_ADDRESS_BASE);

  const stableDecimals: u8 = isGnosis ? 18 : USDC_DECIMALS;

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
  const isGnosis = network == 'gnosis' || network == 'xdai';
  const isBase = network == 'base';

  // Skip conversion for unknown networks (e.g., mainnet in tests)
  if (!isGnosis && !isBase) {
    log.warning('Unknown network: {} (cleaned: {}), returning 0', [network, network]);
    return BigDecimal.fromString('0');
  }

  if (feeUnit == FEE_UNIT_NATIVE) {
    return isGnosis
      ? convertGnosisNativeWeiToUsd(feeRaw)
      : convertBaseNativeWeiToUsd(feeRaw);
  }

  if (feeUnit == FEE_UNIT_TOKEN) {
    return calculateOlasInUsd(feeRaw);
  }

  if (feeUnit == FEE_UNIT_CREDITS) {
    return isGnosis
      ? calculateGnosisNvmCreditsToUsd(feeRaw)
      : calculateBaseNvmCreditsToUsd(feeRaw);
  }

  log.warning('Unknown fee unit: {}, returning 0', [feeUnit]);
  return BigDecimal.fromString('0');
}

