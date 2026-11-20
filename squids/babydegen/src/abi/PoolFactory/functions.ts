import { uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** allPoolsLength() */
export const allPoolsLength = func('0xefde4e64', {}, uint256)
export type AllPoolsLengthParams = FunctionArguments<typeof allPoolsLength>
export type AllPoolsLengthReturn = FunctionReturn<typeof allPoolsLength>
