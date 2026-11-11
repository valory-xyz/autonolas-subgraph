import { address, array, bool, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** stakedContains(address,uint256) */
export const stakedContains = func('0xc69deec5', {
    depositor: address,
    tokenId: uint256,
}, bool)
export type StakedContainsParams = FunctionArguments<typeof stakedContains>
export type StakedContainsReturn = FunctionReturn<typeof stakedContains>

/** earned(address) */
export const earned = func('0x008cc262', {
    _account: address,
}, uint256)
export type EarnedParams = FunctionArguments<typeof earned>
export type EarnedReturn = FunctionReturn<typeof earned>

/** earned(address,uint256[]) */
export const earned_1 = func('0xd942be03', {
    _account: address,
    _tokenIds: array(uint256),
}, uint256)
export type EarnedParams_1 = FunctionArguments<typeof earned_1>
export type EarnedReturn_1 = FunctionReturn<typeof earned_1>
