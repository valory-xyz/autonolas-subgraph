import { address, bool, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** PoolCreated(address,address,bool,address,uint256) */
export const PoolCreated = event('0x2128d88d14c80cb081c1252a5acff7a264671bf199ce226b53788fb26065005e', {
    token0: indexed(address),
    token1: indexed(address),
    stable: indexed(bool),
    pool: address,
    _4: uint256,
})
export type PoolCreatedEventArgs = EParams<typeof PoolCreated>
