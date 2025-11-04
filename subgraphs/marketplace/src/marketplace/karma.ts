import { MechKarmaChanged as MechKarmaChangedEvent } from '../../generated/Karma/Karma';
import { Mech } from '../../generated/schema';
import { getServiceIdFromMech } from './utils';
import { BigInt, log } from '@graphprotocol/graph-ts';

export function handleMechKarmaChanged(event: MechKarmaChangedEvent): void {
  const mechAddress = event.params.mech;
  const karmaChange = event.params.karmaChange;
  
  const serviceId = getServiceIdFromMech(mechAddress);
  if (serviceId === null) {
    log.warning('MechKarmaChanged: Could not find serviceId for mech {}. Skipping karma update.', [
      mechAddress.toHexString()
    ]);
    return;
  }
  
  let mech = Mech.load(serviceId.toString());
  if (mech === null) {
    log.warning('MechKarmaChanged: Mech entity not found for serviceId {}. Skipping karma update.', [
      serviceId.toString()
    ]);
    return;
  }
  
  // Initialize karma to 0 if null (shouldn't happen, but defensive)
  if (mech.karma === null) {
    mech.karma = BigInt.fromI32(0);
  }
  
  // Update cumulative karma
  mech.karma = mech.karma.plus(karmaChange);
  mech.save();
}
