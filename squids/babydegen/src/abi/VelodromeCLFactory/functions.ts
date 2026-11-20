import { address, int24 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** getPool(address,address,int24) */
export const getPool = func('0x28af8d0b', {
    _0: address,
    _1: address,
    _2: int24,
}, address)
export type GetPoolParams = FunctionArguments<typeof getPool>
export type GetPoolReturn = FunctionReturn<typeof getPool>
