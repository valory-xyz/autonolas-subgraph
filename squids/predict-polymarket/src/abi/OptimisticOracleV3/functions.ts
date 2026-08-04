import { address, array, bool, bytes, bytes32, struct, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** MAX_ANCILLARY_DATA() */
export const MAX_ANCILLARY_DATA = func('0x27f8feac', {}, uint256)
export type MAX_ANCILLARY_DATAParams = FunctionArguments<typeof MAX_ANCILLARY_DATA>
export type MAX_ANCILLARY_DATAReturn = FunctionReturn<typeof MAX_ANCILLARY_DATA>

/** SAFETY_PERIOD() */
export const SAFETY_PERIOD = func('0xd1dfb2e9', {}, uint256)
export type SAFETY_PERIODParams = FunctionArguments<typeof SAFETY_PERIOD>
export type SAFETY_PERIODReturn = FunctionReturn<typeof SAFETY_PERIOD>

/** YES_OR_NO_IDENTIFIER() */
export const YES_OR_NO_IDENTIFIER = func('0x6c66f07d', {}, bytes32)
export type YES_OR_NO_IDENTIFIERParams = FunctionArguments<typeof YES_OR_NO_IDENTIFIER>
export type YES_OR_NO_IDENTIFIERReturn = FunctionReturn<typeof YES_OR_NO_IDENTIFIER>

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

/** collateralWhitelist() */
export const collateralWhitelist = func('0xe4ee614a', {}, address)
export type CollateralWhitelistParams = FunctionArguments<typeof collateralWhitelist>
export type CollateralWhitelistReturn = FunctionReturn<typeof collateralWhitelist>

/** ctf() */
export const ctf = func('0x22a9339f', {}, address)
export type CtfParams = FunctionArguments<typeof ctf>
export type CtfReturn = FunctionReturn<typeof ctf>

/** flag(bytes32) */
export const flag = func('0x78165a48', {
    questionID: bytes32,
})
export type FlagParams = FunctionArguments<typeof flag>
export type FlagReturn = FunctionReturn<typeof flag>

/** getExpectedPayouts(bytes32) */
export const getExpectedPayouts = func('0x34e5e28e', {
    questionID: bytes32,
}, array(uint256))
export type GetExpectedPayoutsParams = FunctionArguments<typeof getExpectedPayouts>
export type GetExpectedPayoutsReturn = FunctionReturn<typeof getExpectedPayouts>

/** getLatestUpdate(bytes32,address) */
export const getLatestUpdate = func('0xc0cab0a2', {
    questionID: bytes32,
    owner: address,
}, struct({
    timestamp: uint256,
    update: bytes,
}))
export type GetLatestUpdateParams = FunctionArguments<typeof getLatestUpdate>
export type GetLatestUpdateReturn = FunctionReturn<typeof getLatestUpdate>

/** getQuestion(bytes32) */
export const getQuestion = func('0x58c039cd', {
    questionID: bytes32,
}, struct({
    requestTimestamp: uint256,
    reward: uint256,
    proposalBond: uint256,
    liveness: uint256,
    manualResolutionTimestamp: uint256,
    resolved: bool,
    paused: bool,
    reset: bool,
    refund: bool,
    rewardToken: address,
    creator: address,
    ancillaryData: bytes,
}))
export type GetQuestionParams = FunctionArguments<typeof getQuestion>
export type GetQuestionReturn = FunctionReturn<typeof getQuestion>

/** getUpdates(bytes32,address) */
export const getUpdates = func('0x555c56fc', {
    questionID: bytes32,
    owner: address,
}, array(struct({
    timestamp: uint256,
    update: bytes,
})))
export type GetUpdatesParams = FunctionArguments<typeof getUpdates>
export type GetUpdatesReturn = FunctionReturn<typeof getUpdates>

/** initialize(bytes,address,uint256,uint256,uint256) */
export const initialize = func('0x185d1646', {
    ancillaryData: bytes,
    rewardToken: address,
    reward: uint256,
    proposalBond: uint256,
    liveness: uint256,
}, bytes32)
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** isAdmin(address) */
export const isAdmin = func('0x24d7806c', {
    addr: address,
}, bool)
export type IsAdminParams = FunctionArguments<typeof isAdmin>
export type IsAdminReturn = FunctionReturn<typeof isAdmin>

/** isFlagged(bytes32) */
export const isFlagged = func('0xbf2dde38', {
    questionID: bytes32,
}, bool)
export type IsFlaggedParams = FunctionArguments<typeof isFlagged>
export type IsFlaggedReturn = FunctionReturn<typeof isFlagged>

/** isInitialized(bytes32) */
export const isInitialized = func('0xf7b637bb', {
    questionID: bytes32,
}, bool)
export type IsInitializedParams = FunctionArguments<typeof isInitialized>
export type IsInitializedReturn = FunctionReturn<typeof isInitialized>

/** optimisticOracle() */
export const optimisticOracle = func('0x22302922', {}, address)
export type OptimisticOracleParams = FunctionArguments<typeof optimisticOracle>
export type OptimisticOracleReturn = FunctionReturn<typeof optimisticOracle>

/** pause(bytes32) */
export const pause = func('0xed56531a', {
    questionID: bytes32,
})
export type PauseParams = FunctionArguments<typeof pause>
export type PauseReturn = FunctionReturn<typeof pause>

/** postUpdate(bytes32,bytes) */
export const postUpdate = func('0x072d1259', {
    questionID: bytes32,
    update: bytes,
})
export type PostUpdateParams = FunctionArguments<typeof postUpdate>
export type PostUpdateReturn = FunctionReturn<typeof postUpdate>

/** priceDisputed(bytes32,uint256,bytes,uint256) */
export const priceDisputed = func('0x0d8f2372', {
    _0: bytes32,
    _1: uint256,
    ancillaryData: bytes,
    _3: uint256,
})
export type PriceDisputedParams = FunctionArguments<typeof priceDisputed>
export type PriceDisputedReturn = FunctionReturn<typeof priceDisputed>

/** questions(bytes32) */
export const questions = func('0x95addb90', {
    _0: bytes32,
}, struct({
    requestTimestamp: uint256,
    reward: uint256,
    proposalBond: uint256,
    liveness: uint256,
    manualResolutionTimestamp: uint256,
    resolved: bool,
    paused: bool,
    reset: bool,
    refund: bool,
    rewardToken: address,
    creator: address,
    ancillaryData: bytes,
}))
export type QuestionsParams = FunctionArguments<typeof questions>
export type QuestionsReturn = FunctionReturn<typeof questions>

/** ready(bytes32) */
export const ready = func('0xfcac49a2', {
    questionID: bytes32,
}, bool)
export type ReadyParams = FunctionArguments<typeof ready>
export type ReadyReturn = FunctionReturn<typeof ready>

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

/** reset(bytes32) */
export const reset = func('0xed3c7d40', {
    questionID: bytes32,
})
export type ResetParams = FunctionArguments<typeof reset>
export type ResetReturn = FunctionReturn<typeof reset>

/** resolve(bytes32) */
export const resolve = func('0x5c23bdf5', {
    questionID: bytes32,
})
export type ResolveParams = FunctionArguments<typeof resolve>
export type ResolveReturn = FunctionReturn<typeof resolve>

/** resolveManually(bytes32,uint256[]) */
export const resolveManually = func('0x80696d85', {
    questionID: bytes32,
    payouts: array(uint256),
})
export type ResolveManuallyParams = FunctionArguments<typeof resolveManually>
export type ResolveManuallyReturn = FunctionReturn<typeof resolveManually>

/** unflag(bytes32) */
export const unflag = func('0x88697de4', {
    questionID: bytes32,
})
export type UnflagParams = FunctionArguments<typeof unflag>
export type UnflagReturn = FunctionReturn<typeof unflag>

/** unpause(bytes32) */
export const unpause = func('0x2f4dae9f', {
    questionID: bytes32,
})
export type UnpauseParams = FunctionArguments<typeof unpause>
export type UnpauseReturn = FunctionReturn<typeof unpause>

/** updates(bytes32,uint256) */
export const updates = func('0x89ab0871', {
    _0: bytes32,
    _1: uint256,
}, struct({
    timestamp: uint256,
    update: bytes,
}))
export type UpdatesParams = FunctionArguments<typeof updates>
export type UpdatesReturn = FunctionReturn<typeof updates>
