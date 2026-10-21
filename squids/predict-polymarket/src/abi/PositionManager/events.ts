import { address, array, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** TransferBatch(address,address,address,uint256[],uint256[]) */
export const TransferBatch = event('0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb', {
    operator: indexed(address),
    from: indexed(address),
    to: indexed(address),
    ids: array(uint256),
    amounts: array(uint256),
})
export type TransferBatchEventArgs = EParams<typeof TransferBatch>

/** TransferSingle(address,address,address,uint256,uint256) */
export const TransferSingle = event('0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62', {
    operator: indexed(address),
    from: indexed(address),
    to: indexed(address),
    id: uint256,
    amount: uint256,
})
export type TransferSingleEventArgs = EParams<typeof TransferSingle>
