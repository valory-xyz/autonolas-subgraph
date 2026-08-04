import { address, array, bool, bytes32, string, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** ConditionPreparation(bytes32,address,bytes32,uint256) */
export const ConditionPreparation = event('0xab3760c3bd2bb38b5bcf54dc79802ed67338b4cf29f3054ded67ed24661e4177', {
    conditionId: indexed(bytes32),
    oracle: indexed(address),
    questionId: indexed(bytes32),
    outcomeSlotCount: uint256,
})
export type ConditionPreparationEventArgs = EParams<typeof ConditionPreparation>

/** ConditionResolution(bytes32,address,bytes32,uint256,uint256[]) */
export const ConditionResolution = event('0xb44d84d3289691f71497564b85d4233648d9dbae8cbdbb4329f301c3a0185894', {
    conditionId: indexed(bytes32),
    oracle: indexed(address),
    questionId: indexed(bytes32),
    outcomeSlotCount: uint256,
    payoutNumerators: array(uint256),
})
export type ConditionResolutionEventArgs = EParams<typeof ConditionResolution>

/** PositionSplit(address,address,bytes32,bytes32,uint256[],uint256) */
export const PositionSplit = event('0x2e6bb91f8cbcda0c93623c54d0403a43514fabc40084ec96b6d5379a74786298', {
    stakeholder: indexed(address),
    collateralToken: address,
    parentCollectionId: indexed(bytes32),
    conditionId: indexed(bytes32),
    partition: array(uint256),
    amount: uint256,
})
export type PositionSplitEventArgs = EParams<typeof PositionSplit>

/** PositionsMerge(address,address,bytes32,bytes32,uint256[],uint256) */
export const PositionsMerge = event('0x6f13ca62553fcc2bcd2372180a43949c1e4cebba603901ede2f4e14f36b282ca', {
    stakeholder: indexed(address),
    collateralToken: address,
    parentCollectionId: indexed(bytes32),
    conditionId: indexed(bytes32),
    partition: array(uint256),
    amount: uint256,
})
export type PositionsMergeEventArgs = EParams<typeof PositionsMerge>

/** PayoutRedemption(address,address,bytes32,bytes32,uint256[],uint256) */
export const PayoutRedemption = event('0x2682012a4a4f1973119f1c9b90745d1bd91fa2bab387344f044cb3586864d18d', {
    redeemer: indexed(address),
    collateralToken: indexed(address),
    parentCollectionId: indexed(bytes32),
    conditionId: bytes32,
    indexSets: array(uint256),
    payout: uint256,
})
export type PayoutRedemptionEventArgs = EParams<typeof PayoutRedemption>

/** TransferSingle(address,address,address,uint256,uint256) */
export const TransferSingle = event('0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62', {
    operator: indexed(address),
    from: indexed(address),
    to: indexed(address),
    id: uint256,
    value: uint256,
})
export type TransferSingleEventArgs = EParams<typeof TransferSingle>

/** TransferBatch(address,address,address,uint256[],uint256[]) */
export const TransferBatch = event('0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb', {
    operator: indexed(address),
    from: indexed(address),
    to: indexed(address),
    ids: array(uint256),
    values: array(uint256),
})
export type TransferBatchEventArgs = EParams<typeof TransferBatch>

/** ApprovalForAll(address,address,bool) */
export const ApprovalForAll = event('0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31', {
    owner: indexed(address),
    operator: indexed(address),
    approved: bool,
})
export type ApprovalForAllEventArgs = EParams<typeof ApprovalForAll>

/** URI(string,uint256) */
export const URI = event('0x6bb7ff708619ba0610cba295a58592e0451dee2622938c8755667688daf3529b', {
    value: string,
    id: indexed(uint256),
})
export type URIEventArgs = EParams<typeof URI>
