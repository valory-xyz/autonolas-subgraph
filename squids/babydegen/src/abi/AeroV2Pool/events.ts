import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Mint(address,address,uint256,uint256) */
export const Mint = event('0x2f00e3cdd69a77be7ed215ec7b2a36784dd158f921fca79ac29deffa353fe6ee', {
    sender: indexed(address),
    to: indexed(address),
    amount0: uint256,
    amount1: uint256,
})
export type MintEventArgs = EParams<typeof Mint>
