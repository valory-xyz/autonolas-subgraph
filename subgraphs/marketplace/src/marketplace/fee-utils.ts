import { Address, BigDecimal, BigInt, Bytes, dataSource, log } from '@graphprotocol/graph-ts';
import { BalancerV2Vault } from '../../generated/templates/MechFixedPriceToken/BalancerV2Vault';
import { BalancerV2WeightedPool } from '../../generated/templates/MechFixedPriceToken/BalancerV2WeightedPool';
import { AggregatorV3Interface } from '../../generated/templates/MechFixedPriceNative/AggregatorV3Interface';
import {
  getGnosisNvmXdaiRatio,
  GNOSIS_NVM_TOKEN_DECIMALS,
  getBaseNvmUsdcRatio,
  BASE_NVM_TOKEN_DECIMALS,
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
    if (mechFactory.equals(Bytes.fromHexString(BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC))) {
      return FEE_UNIT_CREDITS;
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

// Convert OLAS amount to USD using Balancer pool
export function calculateOlasInUsd(olasAmount: BigInt): BigDecimal {
  const network = dataSource.network();

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
  }

  if (feeUnit == FEE_UNIT_TOKEN) {
    return calculateOlasInUsd(feeRaw);
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

