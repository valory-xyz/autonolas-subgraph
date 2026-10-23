import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** CreateMechNvmSubscriptionNative(address,uint256,uint256) */
export const CreateMechNvmSubscriptionNative = event('0x8dd47925092428734cd34eadad0f32760621162776705146b3f009a17f5fe6b2', {
    mech: indexed(address),
    serviceId: indexed(uint256),
    maxDeliveryRate: uint256,
})
export type CreateMechNvmSubscriptionNativeEventArgs = EParams<typeof CreateMechNvmSubscriptionNative>
