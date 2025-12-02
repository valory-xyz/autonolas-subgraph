import { SafeReceived } from "../generated/templates/GnosisSafe/GnosisSafe"
import { Multisig, DailyActivity, Service } from "../generated/schema"
import { BigInt } from "@graphprotocol/graph-ts"

const TARGET_AGENT_ID = BigInt.fromI32(41)
const DEPLOYED_STATE = BigInt.fromI32(4)
const ONE_DAY = BigInt.fromI32(86400)

function getDayTimestamp(timestamp: BigInt): BigInt {
  return timestamp.div(ONE_DAY).times(ONE_DAY)
}

export function handleSafeReceived(event: SafeReceived): void {
  let multisigAddress = event.address
  let multisig = Multisig.load(multisigAddress) as Multisig
  let service = Service.load(multisig.service) as Service

  // Only count if service is in Deployed state (not terminated)
  if (service.state != DEPLOYED_STATE) {
    return
  }

  // Only count if this is the CURRENT multisig for the service
  if (service.multisig != multisigAddress.toHexString()) {
    return
  }

  // Only count if service CURRENTLY has agent 41
  let agentIds = service.agentIds
  if (!agentIds || !agentIds.includes(TARGET_AGENT_ID)) {
    return
  }

  let dayTimestamp = getDayTimestamp(event.block.timestamp)
  let dayId = "day-".concat(dayTimestamp.toString())
  let dailyActivity = DailyActivity.load(dayId)
  if (dailyActivity == null) {
    dailyActivity = new DailyActivity(dayId)
    dailyActivity.dayTimestamp = dayTimestamp
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

