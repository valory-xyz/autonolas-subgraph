import { afterEach, assert, clearStore, dataSourceMock, test } from 'matchstick-as/assembly/index';
import { Address, BigInt } from '@graphprotocol/graph-ts';
import { handleMechFactoryCreate } from '../src/marketplace/mech-factory';
import { handleCreateMech } from '../src/marketplace/mech-marketplace';
import { handleMaxDeliveryRateUpdated as nativeRate } from '../src/marketplace/mech-fixed-price-native';
import { handleMaxDeliveryRateUpdated as tokenRate } from '../src/marketplace/mech-fixed-price-token';
import { createMechFactoryCreateEvent } from './mech-factory-utils';
import { createCreateMechEvent } from './mech-marketplace-utils';
import { createMaxDeliveryRateUpdatedEvent as nativeEvent } from './marketplace/mech-fixed-price-native-utils';
import { createMaxDeliveryRateUpdatedEvent as tokenEvent } from './marketplace/mech-fixed-price-token-utils';
import { getFeeUnitFromMechFactory } from '../src/marketplace/fee-utils';
import { createDataSourceForMechContract } from '../src/marketplace/utils';
import { getPaymentTypeFromFactory, PAYMENT_TYPE_FIXED_PRICE_NATIVE, PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC } from '../src/marketplace/constants';

afterEach(() => { clearStore(); dataSourceMock.resetValues(); });

function lifecycle(network: string, factory: string, usdc: boolean): void {
  dataSourceMock.setNetwork(network);
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  const id = BigInt.fromI32(42);
  const address = Address.fromString(factory);
  const rate = BigInt.fromString(usdc ? '1000000' : '1000000000000000000');
  const event = createMechFactoryCreateEvent(mech, id, rate);
  event.address = address;
  handleMechFactoryCreate(event);
  assert.entityCount('PendingMechData', 1);
  handleCreateMech(createCreateMechEvent(mech, id, address));
  assert.entityCount('PendingMechData', 0);
  assert.dataSourceExists(usdc ? 'MechFixedPriceToken' : 'MechFixedPriceNative', mech.toHexString());
  assert.fieldEquals('Mech', '42', 'maxDeliveryRateUSD', '1');
  assert.stringEquals(getFeeUnitFromMechFactory(address), usdc ? 'USDC' : 'NATIVE');
  const next = rate.times(BigInt.fromI32(2));
  if (usdc) tokenRate(tokenEvent(mech, next));
  else nativeRate(nativeEvent(mech, next));
  assert.fieldEquals('Mech', '42', 'maxDeliveryRate', next.toString());
  assert.fieldEquals('Mech', '42', 'maxDeliveryRateUSD', '2');
}

test('Replacement native factory creates a template and indexes a direct rate event', () => {
  lifecycle('gnosis', '0x5270c0797a9d0c59163cf570129e5808be7927fa', false);
});
test('Legacy native factory retains its template and direct rate events', () => {
  lifecycle('gnosis', '0x8b299c20f87e3fcbff0e1b86dc0acc06ab6993ef', false);
});
test('Replacement USDC factory creates a token template and prices 1000000 as $1', () => {
  lifecycle('base', '0x17d8b863f6c4601d67a87fda04d53849c5f9ce00', true);
});
test('Legacy USDC factory retains token pricing and direct rate events', () => {
  lifecycle('base', '0x5b70a66fe68c4c86ffd724b58cc56049c70e9d3d', true);
});

test('eth replacement NATIVE uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('mainnet');
  const factory = Address.fromString('0xf5648bb207ce909d76c219c709433d3ac05e8b86');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceNative', mech.toHexString());
});

test('eth replacement USDC uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('mainnet');
  const factory = Address.fromString('0x1f7f307ecd0ea3778de3eb961dec5a0f814afccf');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'USDC');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceToken', mech.toHexString());
});

test('gnosis replacement NATIVE uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('gnosis');
  const factory = Address.fromString('0x5270c0797a9d0c59163cf570129e5808be7927fa');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceNative', mech.toHexString());
});

test('optimism replacement NATIVE uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('optimism');
  const factory = Address.fromString('0xaafbeef195bdab1bb6f3dc9ceba875cd72499230');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceNative', mech.toHexString());
});

test('optimism replacement USDC uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('optimism');
  const factory = Address.fromString('0xf78b3c22a204da5d9a0b080c5d3d695af4918886');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'USDC');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceToken', mech.toHexString());
});

test('arbitrum replacement NATIVE uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('arbitrum-one');
  const factory = Address.fromString('0xa0da53447c0f6c4987964d8463da7e6628b30f82');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceNative', mech.toHexString());
});

test('arbitrum replacement USDC uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('arbitrum-one');
  const factory = Address.fromString('0x1521918961bdbc9ed4c67a7103d5999e4130e6cb');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'USDC');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceToken', mech.toHexString());
});

test('celo replacement NATIVE uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('celo');
  const factory = Address.fromString('0x0a9a74274b1c30845af98683ca7f843795f6dfa6');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceNative', mech.toHexString());
});

test('celo replacement USDC uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('celo');
  const factory = Address.fromString('0x16184fcf1940dfb8aa5eba7e1effefad49c733f5');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'USDC');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceToken', mech.toHexString());
});

test('base replacement NATIVE uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('base');
  const factory = Address.fromString('0xf8a8c985f46ab6204e6a40845e73a6119f0458ed');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceNative', mech.toHexString());
});

test('base replacement USDC uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('base');
  const factory = Address.fromString('0x17d8b863f6c4601d67a87fda04d53849c5f9ce00');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'USDC');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceToken', mech.toHexString());
});

test('polygon replacement NATIVE uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('matic');
  const factory = Address.fromString('0x40dabcf2deec7241749b320cbc5ca69544a90d68');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceNative', mech.toHexString());
});

test('polygon replacement USDC uses its payment type, fee unit and mech template', () => {
  dataSourceMock.setNetwork('matic');
  const factory = Address.fromString('0x749cdf4bf2e55269b3d1bc4b4408e34689c96b67');
  const mech = Address.fromString('0x00000000000000000000000000000000000000aa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'USDC');
  createDataSourceForMechContract(mech, factory);
  assert.dataSourceExists('MechFixedPriceToken', mech.toHexString());
});

test('xdai resolves the same replacement native factory as gnosis', () => {
  dataSourceMock.setNetwork('xdai');
  const factory = Address.fromString('0x5270c0797a9d0c59163cf570129e5808be7927fa');
  assert.bytesEquals(getPaymentTypeFromFactory(factory), PAYMENT_TYPE_FIXED_PRICE_NATIVE);
  assert.stringEquals(getFeeUnitFromMechFactory(factory), 'NATIVE');
});
