import { address } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** gauges(address) */
export const gauges = func('0xb9a09fd5', {
    pool: address,
}, address)
export type GaugesParams = FunctionArguments<typeof gauges>
export type GaugesReturn = FunctionReturn<typeof gauges>
