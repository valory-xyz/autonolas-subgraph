import { log } from '@graphprotocol/graph-ts';
import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
  RevokeRequest as RevokeRequestEvent,
  MaxDeliveryRateUpdated as MaxDeliveryRateUpdatedEvent,
} from '../../generated/templates/MechNvmSubscriptionNative/MechNvmSubscriptionNative';
import {
  OnChainDeliverArgs,
  OnChainRequestArgs,
  processOnChainDeliver,
  processOnChainRequest,
  logRevokeRequest,
  updateMaxDeliveryRate,
} from './utils';

export function handleDeliver(event: DeliverEvent): void {
  log.info('MechNvmSubscriptionNative Deliver event: tx={}, requestId={}, mech={}', [
    event.transaction.hash.toHexString(),
    event.params.requestId.toHexString(),
    event.params.mech.toHexString()
  ]);
  
  processOnChainDeliver(
    new OnChainDeliverArgs(
      event.transaction.hash,
      event.logIndex.toI32(),
      event.params.mech,
      event.params.requestId,
      event.params.data,
      event.params.deliveryRate,
      event.params.mechServiceMultisig,
      event.transaction.from,
      event.block.number,
      event.block.timestamp
    )
  );
}

export function handleRequest(event: RequestEvent): void {
  log.info('MechNvmSubscriptionNative Request event: tx={}, requestId={}, mech={}', [
    event.transaction.hash.toHexString(),
    event.params.requestId.toHexString(),
    event.params.mech.toHexString()
  ]);
  
  processOnChainRequest(
    new OnChainRequestArgs(
      event.params.requestId,
      event.params.mech,
      event.params.data,
      event.transaction.from,
      event.block.number,
      event.block.timestamp,
      event.transaction.hash
    )
  );
}

export function handleRevokeRequest(event: RevokeRequestEvent): void {
  logRevokeRequest(event.address, event.params.requestId);
}

export function handleMaxDeliveryRateUpdated(event: MaxDeliveryRateUpdatedEvent): void {
  updateMaxDeliveryRate(event.address, event.params.maxDeliveryRate);
}
