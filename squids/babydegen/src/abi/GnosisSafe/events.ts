import { address, bytes32, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** ExecutionFromModuleSuccess(address) */
export const ExecutionFromModuleSuccess = event('0x6895c13664aa4f67288b25d7a21d7aaa34916e355fb9b6fae0a139a9085becb8', {
    module: indexed(address),
})
export type ExecutionFromModuleSuccessEventArgs = EParams<typeof ExecutionFromModuleSuccess>

/** ExecutionSuccess(bytes32,uint256) */
export const ExecutionSuccess = event('0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e', {
    txHash: bytes32,
    payment: uint256,
})
export type ExecutionSuccessEventArgs = EParams<typeof ExecutionSuccess>

/** SafeReceived(address,uint256) */
export const SafeReceived = event('0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d', {
    sender: indexed(address),
    value: uint256,
})
export type SafeReceivedEventArgs = EParams<typeof SafeReceived>
