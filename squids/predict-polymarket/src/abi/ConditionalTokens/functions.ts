import { address, array, bool, bytes, bytes32, bytes4, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** balanceOf(address,uint256) */
export const balanceOf = func('0x00fdd58e', {
    owner: address,
    id: uint256,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** redeemPositions(address,bytes32,bytes32,uint256[]) */
export const redeemPositions = func('0x01b7037c', {
    collateralToken: address,
    parentCollectionId: bytes32,
    conditionId: bytes32,
    indexSets: array(uint256),
})
export type RedeemPositionsParams = FunctionArguments<typeof redeemPositions>
export type RedeemPositionsReturn = FunctionReturn<typeof redeemPositions>

/** supportsInterface(bytes4) */
export const supportsInterface = func('0x01ffc9a7', {
    interfaceId: bytes4,
}, bool)
export type SupportsInterfaceParams = FunctionArguments<typeof supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof supportsInterface>

/** payoutNumerators(bytes32,uint256) */
export const payoutNumerators = func('0x0504c814', {
    _0: bytes32,
    _1: uint256,
}, uint256)
export type PayoutNumeratorsParams = FunctionArguments<typeof payoutNumerators>
export type PayoutNumeratorsReturn = FunctionReturn<typeof payoutNumerators>

/** safeBatchTransferFrom(address,address,uint256[],uint256[],bytes) */
export const safeBatchTransferFrom = func('0x2eb2c2d6', {
    from: address,
    to: address,
    ids: array(uint256),
    values: array(uint256),
    data: bytes,
})
export type SafeBatchTransferFromParams = FunctionArguments<typeof safeBatchTransferFrom>
export type SafeBatchTransferFromReturn = FunctionReturn<typeof safeBatchTransferFrom>

/** getPositionId(address,bytes32) */
export const getPositionId = func('0x39dd7530', {
    collateralToken: address,
    collectionId: bytes32,
}, uint256)
export type GetPositionIdParams = FunctionArguments<typeof getPositionId>
export type GetPositionIdReturn = FunctionReturn<typeof getPositionId>

/** balanceOfBatch(address[],uint256[]) */
export const balanceOfBatch = func('0x4e1273f4', {
    owners: array(address),
    ids: array(uint256),
}, array(uint256))
export type BalanceOfBatchParams = FunctionArguments<typeof balanceOfBatch>
export type BalanceOfBatchReturn = FunctionReturn<typeof balanceOfBatch>

/** splitPosition(address,bytes32,bytes32,uint256[],uint256) */
export const splitPosition = func('0x72ce4275', {
    collateralToken: address,
    parentCollectionId: bytes32,
    conditionId: bytes32,
    partition: array(uint256),
    amount: uint256,
})
export type SplitPositionParams = FunctionArguments<typeof splitPosition>
export type SplitPositionReturn = FunctionReturn<typeof splitPosition>

/** getConditionId(address,bytes32,uint256) */
export const getConditionId = func('0x852c6ae2', {
    oracle: address,
    questionId: bytes32,
    outcomeSlotCount: uint256,
}, bytes32)
export type GetConditionIdParams = FunctionArguments<typeof getConditionId>
export type GetConditionIdReturn = FunctionReturn<typeof getConditionId>

/** getCollectionId(bytes32,bytes32,uint256) */
export const getCollectionId = func('0x856296f7', {
    parentCollectionId: bytes32,
    conditionId: bytes32,
    indexSet: uint256,
}, bytes32)
export type GetCollectionIdParams = FunctionArguments<typeof getCollectionId>
export type GetCollectionIdReturn = FunctionReturn<typeof getCollectionId>

/** mergePositions(address,bytes32,bytes32,uint256[],uint256) */
export const mergePositions = func('0x9e7212ad', {
    collateralToken: address,
    parentCollectionId: bytes32,
    conditionId: bytes32,
    partition: array(uint256),
    amount: uint256,
})
export type MergePositionsParams = FunctionArguments<typeof mergePositions>
export type MergePositionsReturn = FunctionReturn<typeof mergePositions>

/** setApprovalForAll(address,bool) */
export const setApprovalForAll = func('0xa22cb465', {
    operator: address,
    approved: bool,
})
export type SetApprovalForAllParams = FunctionArguments<typeof setApprovalForAll>
export type SetApprovalForAllReturn = FunctionReturn<typeof setApprovalForAll>

/** reportPayouts(bytes32,uint256[]) */
export const reportPayouts = func('0xc49298ac', {
    questionId: bytes32,
    payouts: array(uint256),
})
export type ReportPayoutsParams = FunctionArguments<typeof reportPayouts>
export type ReportPayoutsReturn = FunctionReturn<typeof reportPayouts>

/** getOutcomeSlotCount(bytes32) */
export const getOutcomeSlotCount = func('0xd42dc0c2', {
    conditionId: bytes32,
}, uint256)
export type GetOutcomeSlotCountParams = FunctionArguments<typeof getOutcomeSlotCount>
export type GetOutcomeSlotCountReturn = FunctionReturn<typeof getOutcomeSlotCount>

/** prepareCondition(address,bytes32,uint256) */
export const prepareCondition = func('0xd96ee754', {
    oracle: address,
    questionId: bytes32,
    outcomeSlotCount: uint256,
})
export type PrepareConditionParams = FunctionArguments<typeof prepareCondition>
export type PrepareConditionReturn = FunctionReturn<typeof prepareCondition>

/** payoutDenominator(bytes32) */
export const payoutDenominator = func('0xdd34de67', {
    _0: bytes32,
}, uint256)
export type PayoutDenominatorParams = FunctionArguments<typeof payoutDenominator>
export type PayoutDenominatorReturn = FunctionReturn<typeof payoutDenominator>

/** isApprovedForAll(address,address) */
export const isApprovedForAll = func('0xe985e9c5', {
    owner: address,
    operator: address,
}, bool)
export type IsApprovedForAllParams = FunctionArguments<typeof isApprovedForAll>
export type IsApprovedForAllReturn = FunctionReturn<typeof isApprovedForAll>

/** safeTransferFrom(address,address,uint256,uint256,bytes) */
export const safeTransferFrom = func('0xf242432a', {
    from: address,
    to: address,
    id: uint256,
    value: uint256,
    data: bytes,
})
export type SafeTransferFromParams = FunctionArguments<typeof safeTransferFrom>
export type SafeTransferFromReturn = FunctionReturn<typeof safeTransferFrom>
