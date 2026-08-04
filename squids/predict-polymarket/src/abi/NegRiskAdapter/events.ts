import { address, array, bool, bytes, bytes32, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** MarketPrepared(bytes32,address,uint256,bytes) */
export const MarketPrepared = event('0xf059ab16d1ca60e123eab60e3c02b68faf060347c701a5d14885a8e1def7b3a8', {
    marketId: indexed(bytes32),
    oracle: indexed(address),
    feeBips: uint256,
    data: bytes,
})
export type MarketPreparedEventArgs = EParams<typeof MarketPrepared>

/** NewAdmin(address,address) */
export const NewAdmin = event('0xf9ffabca9c8276e99321725bcb43fb076a6c66a54b7f21c4e8146d8519b417dc', {
    admin: indexed(address),
    newAdminAddress: indexed(address),
})
export type NewAdminEventArgs = EParams<typeof NewAdmin>

/** OutcomeReported(bytes32,bytes32,bool) */
export const OutcomeReported = event('0x9e9fa7fd355160bd4cd3f22d4333519354beff1f5689bde87f2c5e63d8d484b2', {
    marketId: indexed(bytes32),
    questionId: indexed(bytes32),
    outcome: bool,
})
export type OutcomeReportedEventArgs = EParams<typeof OutcomeReported>

/** PayoutRedemption(address,bytes32,uint256[],uint256) */
export const PayoutRedemption = event('0x9140a6a270ef945260c03894b3c6b3b2695e9d5101feef0ff24fec960cfd3224', {
    redeemer: indexed(address),
    conditionId: indexed(bytes32),
    amounts: array(uint256),
    payout: uint256,
})
export type PayoutRedemptionEventArgs = EParams<typeof PayoutRedemption>

/** PositionSplit(address,bytes32,uint256) */
export const PositionSplit = event('0xbbed930dbfb7907ae2d60ddf78345610214f26419a0128df39b6cc3d9e5df9b0', {
    stakeholder: indexed(address),
    conditionId: indexed(bytes32),
    amount: uint256,
})
export type PositionSplitEventArgs = EParams<typeof PositionSplit>

/** PositionsConverted(address,bytes32,uint256,uint256) */
export const PositionsConverted = event('0xb03d19dddbc72a87e735ff0ea3b57bef133ebe44e1894284916a84044deb367e', {
    stakeholder: indexed(address),
    marketId: indexed(bytes32),
    indexSet: indexed(uint256),
    amount: uint256,
})
export type PositionsConvertedEventArgs = EParams<typeof PositionsConverted>

/** PositionsMerge(address,bytes32,uint256) */
export const PositionsMerge = event('0xba33ac50d8894676597e6e35dc09cff59854708b642cd069d21eb9c7ca072a04', {
    stakeholder: indexed(address),
    conditionId: indexed(bytes32),
    amount: uint256,
})
export type PositionsMergeEventArgs = EParams<typeof PositionsMerge>

/** QuestionPrepared(bytes32,bytes32,uint256,bytes) */
export const QuestionPrepared = event('0xaac410f87d423a922a7b226ac68f0c2eaf5bf6d15e644ac0758c7f96e2c253f7', {
    marketId: indexed(bytes32),
    questionId: indexed(bytes32),
    index: uint256,
    data: bytes,
})
export type QuestionPreparedEventArgs = EParams<typeof QuestionPrepared>

/** RemovedAdmin(address,address) */
export const RemovedAdmin = event('0x787a2e12f4a55b658b8f573c32432ee11a5e8b51677d1e1e937aaf6a0bb5776e', {
    admin: indexed(address),
    removedAdmin: indexed(address),
})
export type RemovedAdminEventArgs = EParams<typeof RemovedAdmin>
