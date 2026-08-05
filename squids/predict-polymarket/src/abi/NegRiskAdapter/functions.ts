import { address, array, bool, bytes, bytes32, bytes4, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** FEE_DENOMINATOR() */
export const FEE_DENOMINATOR = func('0xd73792a9', {}, uint256)
export type FEE_DENOMINATORParams = FunctionArguments<typeof FEE_DENOMINATOR>
export type FEE_DENOMINATORReturn = FunctionReturn<typeof FEE_DENOMINATOR>

/** NO_TOKEN_BURN_ADDRESS() */
export const NO_TOKEN_BURN_ADDRESS = func('0x7ad7fe36', {}, address)
export type NO_TOKEN_BURN_ADDRESSParams = FunctionArguments<typeof NO_TOKEN_BURN_ADDRESS>
export type NO_TOKEN_BURN_ADDRESSReturn = FunctionReturn<typeof NO_TOKEN_BURN_ADDRESS>

/** addAdmin(address) */
export const addAdmin = func('0x70480275', {
    admin: address,
})
export type AddAdminParams = FunctionArguments<typeof addAdmin>
export type AddAdminReturn = FunctionReturn<typeof addAdmin>

/** admins(address) */
export const admins = func('0x429b62e5', {
    _0: address,
}, uint256)
export type AdminsParams = FunctionArguments<typeof admins>
export type AdminsReturn = FunctionReturn<typeof admins>

/** balanceOf(address,uint256) */
export const balanceOf = func('0x00fdd58e', {
    _owner: address,
    _id: uint256,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** balanceOfBatch(address[],uint256[]) */
export const balanceOfBatch = func('0x4e1273f4', {
    _owners: array(address),
    _ids: array(uint256),
}, array(uint256))
export type BalanceOfBatchParams = FunctionArguments<typeof balanceOfBatch>
export type BalanceOfBatchReturn = FunctionReturn<typeof balanceOfBatch>

/** col() */
export const col = func('0xa78695b0', {}, address)
export type ColParams = FunctionArguments<typeof col>
export type ColReturn = FunctionReturn<typeof col>

/** convertPositions(bytes32,uint256,uint256) */
export const convertPositions = func('0xc64748c4', {
    _marketId: bytes32,
    _indexSet: uint256,
    _amount: uint256,
})
export type ConvertPositionsParams = FunctionArguments<typeof convertPositions>
export type ConvertPositionsReturn = FunctionReturn<typeof convertPositions>

/** ctf() */
export const ctf = func('0x22a9339f', {}, address)
export type CtfParams = FunctionArguments<typeof ctf>
export type CtfReturn = FunctionReturn<typeof ctf>

/** getConditionId(bytes32) */
export const getConditionId = func('0x04329c03', {
    _questionId: bytes32,
}, bytes32)
export type GetConditionIdParams = FunctionArguments<typeof getConditionId>
export type GetConditionIdReturn = FunctionReturn<typeof getConditionId>

/** getDetermined(bytes32) */
export const getDetermined = func('0x7ae2e67b', {
    _marketId: bytes32,
}, bool)
export type GetDeterminedParams = FunctionArguments<typeof getDetermined>
export type GetDeterminedReturn = FunctionReturn<typeof getDetermined>

/** getFeeBips(bytes32) */
export const getFeeBips = func('0x2582cb5e', {
    _marketId: bytes32,
}, uint256)
export type GetFeeBipsParams = FunctionArguments<typeof getFeeBips>
export type GetFeeBipsReturn = FunctionReturn<typeof getFeeBips>

/** getMarketData(bytes32) */
export const getMarketData = func('0x30f4f4bb', {
    _marketId: bytes32,
}, bytes32)
export type GetMarketDataParams = FunctionArguments<typeof getMarketData>
export type GetMarketDataReturn = FunctionReturn<typeof getMarketData>

/** getOracle(bytes32) */
export const getOracle = func('0xdafaf94a', {
    _marketId: bytes32,
}, address)
export type GetOracleParams = FunctionArguments<typeof getOracle>
export type GetOracleReturn = FunctionReturn<typeof getOracle>

/** getPositionId(bytes32,bool) */
export const getPositionId = func('0x752b5ba5', {
    _questionId: bytes32,
    _outcome: bool,
}, uint256)
export type GetPositionIdParams = FunctionArguments<typeof getPositionId>
export type GetPositionIdReturn = FunctionReturn<typeof getPositionId>

/** getQuestionCount(bytes32) */
export const getQuestionCount = func('0xb7f75d2c', {
    _marketId: bytes32,
}, uint256)
export type GetQuestionCountParams = FunctionArguments<typeof getQuestionCount>
export type GetQuestionCountReturn = FunctionReturn<typeof getQuestionCount>

/** getResult(bytes32) */
export const getResult = func('0xadd4c784', {
    _marketId: bytes32,
}, uint256)
export type GetResultParams = FunctionArguments<typeof getResult>
export type GetResultReturn = FunctionReturn<typeof getResult>

/** isAdmin(address) */
export const isAdmin = func('0x24d7806c', {
    addr: address,
}, bool)
export type IsAdminParams = FunctionArguments<typeof isAdmin>
export type IsAdminReturn = FunctionReturn<typeof isAdmin>

/** mergePositions(address,bytes32,bytes32,uint256[],uint256) */
export const mergePositions = func('0x9e7212ad', {
    _collateralToken: address,
    _1: bytes32,
    _conditionId: bytes32,
    _3: array(uint256),
    _amount: uint256,
})
export type MergePositionsParams = FunctionArguments<typeof mergePositions>
export type MergePositionsReturn = FunctionReturn<typeof mergePositions>

/** mergePositions(bytes32,uint256) */
export const mergePositions_1 = func('0xb10c5c17', {
    _conditionId: bytes32,
    _amount: uint256,
})
export type MergePositionsParams_1 = FunctionArguments<typeof mergePositions_1>
export type MergePositionsReturn_1 = FunctionReturn<typeof mergePositions_1>

/** onERC1155BatchReceived(address,address,uint256[],uint256[],bytes) */
export const onERC1155BatchReceived = func('0xbc197c81', {
    _0: address,
    _1: address,
    _2: array(uint256),
    _3: array(uint256),
    _4: bytes,
}, bytes4)
export type OnERC1155BatchReceivedParams = FunctionArguments<typeof onERC1155BatchReceived>
export type OnERC1155BatchReceivedReturn = FunctionReturn<typeof onERC1155BatchReceived>

/** onERC1155Received(address,address,uint256,uint256,bytes) */
export const onERC1155Received = func('0xf23a6e61', {
    _0: address,
    _1: address,
    _2: uint256,
    _3: uint256,
    _4: bytes,
}, bytes4)
export type OnERC1155ReceivedParams = FunctionArguments<typeof onERC1155Received>
export type OnERC1155ReceivedReturn = FunctionReturn<typeof onERC1155Received>

/** prepareMarket(uint256,bytes) */
export const prepareMarket = func('0x8a0db615', {
    _feeBips: uint256,
    _metadata: bytes,
}, bytes32)
export type PrepareMarketParams = FunctionArguments<typeof prepareMarket>
export type PrepareMarketReturn = FunctionReturn<typeof prepareMarket>

/** prepareQuestion(bytes32,bytes) */
export const prepareQuestion = func('0x1d69b48d', {
    _marketId: bytes32,
    _metadata: bytes,
}, bytes32)
export type PrepareQuestionParams = FunctionArguments<typeof prepareQuestion>
export type PrepareQuestionReturn = FunctionReturn<typeof prepareQuestion>

/** redeemPositions(bytes32,uint256[]) */
export const redeemPositions = func('0xdbeccb23', {
    _conditionId: bytes32,
    _amounts: array(uint256),
})
export type RedeemPositionsParams = FunctionArguments<typeof redeemPositions>
export type RedeemPositionsReturn = FunctionReturn<typeof redeemPositions>

/** removeAdmin(address) */
export const removeAdmin = func('0x1785f53c', {
    admin: address,
})
export type RemoveAdminParams = FunctionArguments<typeof removeAdmin>
export type RemoveAdminReturn = FunctionReturn<typeof removeAdmin>

/** renounceAdmin() */
export const renounceAdmin = func('0x8bad0c0a', {})
export type RenounceAdminParams = FunctionArguments<typeof renounceAdmin>
export type RenounceAdminReturn = FunctionReturn<typeof renounceAdmin>

/** reportOutcome(bytes32,bool) */
export const reportOutcome = func('0xe200affd', {
    _questionId: bytes32,
    _outcome: bool,
})
export type ReportOutcomeParams = FunctionArguments<typeof reportOutcome>
export type ReportOutcomeReturn = FunctionReturn<typeof reportOutcome>

/** safeTransferFrom(address,address,uint256,uint256,bytes) */
export const safeTransferFrom = func('0xf242432a', {
    _from: address,
    _to: address,
    _id: uint256,
    _value: uint256,
    _data: bytes,
})
export type SafeTransferFromParams = FunctionArguments<typeof safeTransferFrom>
export type SafeTransferFromReturn = FunctionReturn<typeof safeTransferFrom>

/** splitPosition(address,bytes32,bytes32,uint256[],uint256) */
export const splitPosition = func('0x72ce4275', {
    _collateralToken: address,
    _1: bytes32,
    _conditionId: bytes32,
    _3: array(uint256),
    _amount: uint256,
})
export type SplitPositionParams = FunctionArguments<typeof splitPosition>
export type SplitPositionReturn = FunctionReturn<typeof splitPosition>

/** splitPosition(bytes32,uint256) */
export const splitPosition_1 = func('0xa3d7da1d', {
    _conditionId: bytes32,
    _amount: uint256,
})
export type SplitPositionParams_1 = FunctionArguments<typeof splitPosition_1>
export type SplitPositionReturn_1 = FunctionReturn<typeof splitPosition_1>

/** vault() */
export const vault = func('0xfbfa77cf', {}, address)
export type VaultParams = FunctionArguments<typeof vault>
export type VaultReturn = FunctionReturn<typeof vault>

/** wcol() */
export const wcol = func('0x7e3b74c3', {}, address)
export type WcolParams = FunctionArguments<typeof wcol>
export type WcolReturn = FunctionReturn<typeof wcol>
