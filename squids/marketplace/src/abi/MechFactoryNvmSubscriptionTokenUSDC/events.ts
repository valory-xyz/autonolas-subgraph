import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** CreateMechNvmSubscriptionTokenUSDC(address,uint256,uint256) */
export const CreateMechNvmSubscriptionTokenUSDC = event('0x46349b498bb481b4d54dcbfeddb9140dbaf5079cdaf976bdb3538670a42e5d22', {
    mech: indexed(address),
    serviceId: indexed(uint256),
    maxDeliveryRate: uint256,
})
export type CreateMechNvmSubscriptionTokenUSDCEventArgs = EParams<typeof CreateMechNvmSubscriptionTokenUSDC>
