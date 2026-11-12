import { address, array, int24, struct, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** forSwaps(uint256,uint256) */
export const forSwaps = func('0xb224fcb5', {
    _limit: uint256,
    _offset: uint256,
}, array(struct({
    lp: address,
    type: int24,
    token0: address,
    token1: address,
    factory: address,
    pool_fee: uint256,
})))
export type ForSwapsParams = FunctionArguments<typeof forSwaps>
export type ForSwapsReturn = FunctionReturn<typeof forSwaps>
