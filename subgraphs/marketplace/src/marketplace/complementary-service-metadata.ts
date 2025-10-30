import { ComplementaryMetadataUpdated as ComplementaryMetadataUpdatedEvent } from '../generated/ComplementaryServiceMetadata/ComplementaryServiceMetadata';
import { Mech } from '../generated/schema';
import { getOrCreateMetadata } from './utils';

export function handleComplementaryMetadataUpdated(
  event: ComplementaryMetadataUpdatedEvent
): void {
  let metadata = getOrCreateMetadata(event.params.serviceId);
  metadata.metadata = event.params.hash;

  let mech = Mech.load(event.params.serviceId.toString());
  if (mech !== null) {
    metadata.mech = mech.address;
  }

  metadata.save();
}
