import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** PoolCreated(address,address,address,uint256) */
export const PoolCreated = event('0xebbbe9dc3a19d2f959ac76ac0372b4983cdfb945f5d6aef4873c36fabb2ba8aa', {
    token0: indexed(address),
    token1: indexed(address),
    pool: address,
    _3: uint256,
})
export type PoolCreatedEventArgs = EParams<typeof PoolCreated>
