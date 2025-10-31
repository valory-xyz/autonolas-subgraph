import { Bytes } from '@graphprotocol/graph-ts';
import { ComplementaryMetadataUpdated as ComplementaryMetadataUpdatedEvent } from '../../generated/ComplementaryServiceMetadata/ComplementaryServiceMetadata';
import { Mech } from '../../generated/schema';
import { getOrCreateMetadata } from './utils';

export function handleComplementaryMetadataUpdated(
  event: ComplementaryMetadataUpdatedEvent
): void {
  let metadata = getOrCreateMetadata(event.params.serviceId);
  metadata.metadata = event.params.hash;

  let mech = Mech.load(Bytes.fromHexString(event.params.serviceId.toHexString()));
  if (mech !== null) {
    metadata.mech = mech.address;
  }

  metadata.save();
}
