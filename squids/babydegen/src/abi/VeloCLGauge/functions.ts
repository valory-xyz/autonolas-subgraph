import { address, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** earned(address,uint256) */
export const earned = func('0x3e491d47', {
    account: address,
    tokenId: uint256,
}, uint256)
export type EarnedParams = FunctionArguments<typeof earned>
export type EarnedReturn = FunctionReturn<typeof earned>
