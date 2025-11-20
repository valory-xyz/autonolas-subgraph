import {
  Deliver as DeliverEvent,
  Request as RequestEvent,
  RevokeRequest as RevokeRequestEvent,
  MaxDeliveryRateUpdated as MaxDeliveryRateUpdatedEvent,
} from '../../generated/templates/MechNvmSubscriptionNative/MechNvmSubscriptionNative';
import {
  OnChainDeliverArgs,
  OnChainRequestArgs,
  handleTemplateDeliver,
  handleTemplateRequest,
  logRevokeRequest,
  updateMaxDeliveryRate,
} from './utils';

export function handleDeliver(event: DeliverEvent): void {
  handleTemplateDeliver(
    'MechNvmSubscriptionNative',
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
      event.block.timestamp,
      event.transaction.to
    )
  );
}

export function handleRequest(event: RequestEvent): void {
  handleTemplateRequest(
    'MechNvmSubscriptionNative',
    new OnChainRequestArgs(
      event.params.requestId,
      event.params.mech,
      event.params.data,
      event.transaction.from,
      event.block.number,
      event.block.timestamp,
      event.transaction.hash,
      event.transaction.to
    )
  );
}

export function handleRevokeRequest(event: RevokeRequestEvent): void {
  logRevokeRequest(event.address, event.params.requestId);
}

export function handleMaxDeliveryRateUpdated(event: MaxDeliveryRateUpdatedEvent): void {
  updateMaxDeliveryRate(event.address, event.params.maxDeliveryRate);
}
