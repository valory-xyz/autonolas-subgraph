import { newMockEvent, createMockedFunction } from 'matchstick-as';
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import {
  mockMarketplaceDeliverIpfs,
  mockMarketplaceRequestIpfs,
} from './ipfs-mock-helpers';

// Helper to mock maxDeliveryRate for a mech address
export function mockMaxDeliveryRate(mech: Address, rate: BigInt): void {
  createMockedFunction(mech, 'maxDeliveryRate', 'maxDeliveryRate():(uint256)')
    .returns([ethereum.Value.fromUnsignedBigInt(rate)]);
}

export function createBaseDeliverEvent(
  mech: Address,
  requestId: Bytes,
  mechServiceMultisig: Address,
  deliveryRate: BigInt,
  data: Bytes
): ethereum.Event {
  let event = newMockEvent();
  event.address = mech;
  event.transaction.hash = requestId;
  event.parameters = new Array<ethereum.EventParam>();

  event.parameters.push(
    new ethereum.EventParam('mech', ethereum.Value.fromAddress(mech))
  );
  event.parameters.push(
    new ethereum.EventParam(
      'mechServiceMultisig',
      ethereum.Value.fromAddress(mechServiceMultisig)
    )
  );
  event.parameters.push(
    new ethereum.EventParam('requestId', ethereum.Value.fromBytes(requestId))
  );
  event.parameters.push(
    new ethereum.EventParam(
      'deliveryRate',
      ethereum.Value.fromUnsignedBigInt(deliveryRate)
    )
  );
  event.parameters.push(
    new ethereum.EventParam('data', ethereum.Value.fromBytes(data))
  );

  mockMarketplaceDeliverIpfs(data, requestId);

  return event;
}

export function createBaseRequestEvent(
  mech: Address,
  requestId: Bytes,
  data: Bytes
): ethereum.Event {
  let event = newMockEvent();
  event.address = mech;
  event.transaction.hash = requestId;
  event.parameters = new Array<ethereum.EventParam>();

  event.parameters.push(
    new ethereum.EventParam('mech', ethereum.Value.fromAddress(mech))
  );
  event.parameters.push(
    new ethereum.EventParam('requestId', ethereum.Value.fromBytes(requestId))
  );
  event.parameters.push(
    new ethereum.EventParam('data', ethereum.Value.fromBytes(data))
  );

  mockMarketplaceRequestIpfs(data, requestId);

  return event;
}

export function createBaseRevokeRequestEvent(
  mech: Address,
  requestId: Bytes
): ethereum.Event {
  let event = newMockEvent();
  event.address = mech;
  event.transaction.hash = requestId;
  event.parameters = new Array<ethereum.EventParam>();

  event.parameters.push(
    new ethereum.EventParam('requestId', ethereum.Value.fromBytes(requestId))
  );

  return event;
}

export function createBaseMaxDeliveryRateUpdatedEvent(
  mech: Address,
  maxDeliveryRate: BigInt
): ethereum.Event {
  let event = newMockEvent();
  event.address = mech;
  event.parameters = new Array<ethereum.EventParam>();

  event.parameters.push(
    new ethereum.EventParam(
      'maxDeliveryRate',
      ethereum.Value.fromUnsignedBigInt(maxDeliveryRate)
    )
  );

  return event;
}

