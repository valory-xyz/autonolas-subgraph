import { CreateMech } from '../../generated/MechFactoryFixedPriceNative/MechFactory';
import { PendingMechData } from '../../generated/schema';

/**
 * Handles MechFactory CreateMech events.
 * Stores maxDeliveryRate in PendingMechData entity for later consumption by handleCreateMech.
 * Factory events fire BEFORE MechMarketplace events in the same transaction (log 89 vs log 90).
 */
export function handleMechFactoryCreate(event: CreateMech): void {
  const mechAddress = event.params.mech.toHexString();

  // Create or load PendingMechData entity keyed by mech address
  let pendingData = PendingMechData.load(mechAddress);
  if (pendingData === null) {
    pendingData = new PendingMechData(mechAddress);
  }

  pendingData.maxDeliveryRate = event.params.maxDeliveryRate;
  pendingData.createdAtBlock = event.block.number;
  pendingData.save();
}
