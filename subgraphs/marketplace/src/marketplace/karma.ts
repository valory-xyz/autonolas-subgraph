import { MechKarmaChanged as MechKarmaChangedEvent } from '../../generated/Karma/Karma';
import { Mech } from '../../generated/schema';
import { getServiceIdFromMech } from './utils';
import { BigInt, log } from '@graphprotocol/graph-ts';

export function handleMechKarmaChanged(event: MechKarmaChangedEvent): void {
  const mechAddress = event.params.mech;
  const karmaChange = event.params.karmaChange;


  log.info('MechKarmaChanged event received: tx={}, mech={}, karmaChange={}', [

    event.transaction.hash.toHexString(),

    mechAddress.toHexString(),
    karmaChange.toString()
  ]);

  const serviceId = getServiceIdFromMech(mechAddress);
  if (serviceId === null) {
    log.critical('MechKarmaChanged: Could not find serviceId for mech {}. Skipping karma update.', [
      mechAddress.toHexString()
    ]);
    return;
  }
  
  let mech = Mech.load(serviceId);
  if (mech === null) {
    log.critical('MechKarmaChanged: Mech entity not found for serviceId {}. Skipping karma update.', [
      serviceId
    ]);
    return;
  }
  
  // Initialize karma to 0 if null (shouldn't happen, but defensive)
  if (mech.karma === null) {
    mech.karma = BigInt.fromI32(0);
  }
  
  // Update cumulative karma (karmaChange can be positive or negative)
  // BigInt.plus() handles negative values correctly (effectively subtracts)
  mech.karma = mech.karma.plus(karmaChange);
  mech.save();
}
