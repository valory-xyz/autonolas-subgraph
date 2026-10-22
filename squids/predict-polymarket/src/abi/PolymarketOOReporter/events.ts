import { address, bytes, bytes32, uint64 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** RequestRegistered(bytes32,address,bytes32,bytes,uint64,uint64) */
export const RequestRegistered = event('0x459464e3d93204e986f0b20e33596daba585b1f37d5afe1eb1821551f7cb6f49', {
    requestId: indexed(bytes32),
    requester: indexed(address),
    priceIdentifier: indexed(bytes32),
    requestRules: bytes,
    minimumLiveness: uint64,
    maximumLiveness: uint64,
})
export type RequestRegisteredEventArgs = EParams<typeof RequestRegistered>
