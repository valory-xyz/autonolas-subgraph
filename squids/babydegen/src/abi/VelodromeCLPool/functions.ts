import { address } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** gauge() */
export const gauge = func('0xa6f19c84', {}, address)
export type GaugeParams = FunctionArguments<typeof gauge>
export type GaugeReturn = FunctionReturn<typeof gauge>
