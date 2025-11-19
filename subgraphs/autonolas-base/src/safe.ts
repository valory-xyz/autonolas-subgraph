import { SafeReceived } from "../generated/templates/GnosisSafe/GnosisSafe"
import { Multisig, DailyActivity } from "../generated/schema"
import { BigInt } from "@graphprotocol/graph-ts"

export function handleSafeReceived(event: SafeReceived): void {
  let multisigAddress = event.address
  let multisig = Multisig.load(multisigAddress)

  if (multisig) {
    let dayId = (event.block.timestamp.toI32() / 86400).toString()
    let dailyActivity = DailyActivity.load(dayId)
    
    if (!dailyActivity) {
      dailyActivity = new DailyActivity(dayId)
      dailyActivity.count = 0
      dailyActivity.services = []
    }

    let serviceId = multisig.service.toHexString() 
    let services = dailyActivity.services
    if (!services.includes(serviceId)) {
        services.push(serviceId)
        dailyActivity.services = services
        dailyActivity.count = dailyActivity.count + 1
        dailyActivity.save()
    }
  }
}

