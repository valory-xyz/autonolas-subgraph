import { CreateMechFixedPriceNative } from '../../generated/MechFactoryFixedPriceNative/MechFactoryFixedPriceNative';
import { PendingMechData } from '../../generated/schema';

/**
 * Handles MechFactory CreateMech* events from all factory types.
 * All factory events have identical parameter structure (mech, serviceId, maxDeliveryRate).
 * Stores maxDeliveryRate in PendingMechData entity for later consumption by handleCreateMech.
 * Factory events fire BEFORE MechMarketplace events in the same transaction.
 */
export function handleMechFactoryCreate(event: CreateMechFixedPriceNative): void {
  const mechAddress = event.params.mech;

  // Create or load PendingMechData entity keyed by mech address
  let pendingData = PendingMechData.load(mechAddress.toHexString());
  if (pendingData === null) {
    pendingData = new PendingMechData(mechAddress.toHexString());
  }

  pendingData.maxDeliveryRate = event.params.maxDeliveryRate;
  pendingData.createdAtBlock = event.block.number;
  pendingData.save();
}
