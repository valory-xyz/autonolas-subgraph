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
