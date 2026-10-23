import { bytes31, bytes32 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** legacyConditionId(bytes31) */
export const legacyConditionId = func('0x932094f6', {
    _0: bytes31,
}, bytes32)
export type LegacyConditionIdParams = FunctionArguments<typeof legacyConditionId>
export type LegacyConditionIdReturn = FunctionReturn<typeof legacyConditionId>
