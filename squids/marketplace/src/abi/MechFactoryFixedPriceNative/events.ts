import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** CreateMechFixedPriceNative(address,uint256,uint256) */
export const CreateMechFixedPriceNative = event('0x0fa12e8b60b83f27ad2a2028740fbb1954b8edf443193f4a580f0a82c12e5d41', {
    mech: indexed(address),
    serviceId: indexed(uint256),
    maxDeliveryRate: uint256,
})
export type CreateMechFixedPriceNativeEventArgs = EParams<typeof CreateMechFixedPriceNative>
