import { address, bytes32, uint256, uint8 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** FeeCharged(address,uint256) */
export const FeeCharged = event('0x55bb3cade9d43b798a4fe5ffdd05024b2d7870df53920673bfc7e68047cd0ab1', {
    receiver: indexed(address),
    amount: uint256,
})
export type FeeChargedEventArgs = EParams<typeof FeeCharged>

/** FeeReceiverUpdated(address) */
export const FeeReceiverUpdated = event('0x27aae5db36d94179909d019ae0b1ac7c16d96d953148f63c0f6a0a9c8ead79ee', {
    feeReceiver: indexed(address),
})
export type FeeReceiverUpdatedEventArgs = EParams<typeof FeeReceiverUpdated>

/** MaxFeeRateUpdated(uint256) */
export const MaxFeeRateUpdated = event('0xe380d7c3967dd06cc7c01db8b17332a1d806fd18f63206dcbd12aaef455c7ff2', {
    maxFeeRate: uint256,
})
export type MaxFeeRateUpdatedEventArgs = EParams<typeof MaxFeeRateUpdated>

/** NewAdmin(address,address) */
export const NewAdmin = event('0xf9ffabca9c8276e99321725bcb43fb076a6c66a54b7f21c4e8146d8519b417dc', {
    newAdminAddress: indexed(address),
    admin: indexed(address),
})
export type NewAdminEventArgs = EParams<typeof NewAdmin>

/** NewOperator(address,address) */
export const NewOperator = event('0xf1e04d73c4304b5ff164f9d10c7473e2a1593b740674a6107975e2a7001c1e5c', {
    newOperatorAddress: indexed(address),
    admin: indexed(address),
})
export type NewOperatorEventArgs = EParams<typeof NewOperator>

/** OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32) */
export const OrderFilled = event('0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee', {
    orderHash: indexed(bytes32),
    maker: indexed(address),
    taker: indexed(address),
    side: uint8,
    tokenId: uint256,
    makerAmountFilled: uint256,
    takerAmountFilled: uint256,
    fee: uint256,
    builder: bytes32,
    metadata: bytes32,
})
export type OrderFilledEventArgs = EParams<typeof OrderFilled>

/** OrderPreapprovalInvalidated(bytes32) */
export const OrderPreapprovalInvalidated = event('0xb766aa470f20b094f26a9a14ea5bf63a60af51703c15776e2e739b6a0428adf6', {
    orderHash: indexed(bytes32),
})
export type OrderPreapprovalInvalidatedEventArgs = EParams<typeof OrderPreapprovalInvalidated>

/** OrderPreapproved(bytes32) */
export const OrderPreapproved = event('0xe92c22722d9c284034b6c9f5aaec018edb3e593c0e084900b6b9d390a1182a0b', {
    orderHash: indexed(bytes32),
})
export type OrderPreapprovedEventArgs = EParams<typeof OrderPreapproved>

/** OrdersMatched(bytes32,address,uint8,uint256,uint256,uint256) */
export const OrdersMatched = event('0x174b3811690657c217184f89418266767c87e4805d09680c39fc9c031c0cab7c', {
    takerOrderHash: indexed(bytes32),
    takerOrderMaker: indexed(address),
    side: uint8,
    tokenId: uint256,
    makerAmountFilled: uint256,
    takerAmountFilled: uint256,
})
export type OrdersMatchedEventArgs = EParams<typeof OrdersMatched>

/** RemovedAdmin(address,address) */
export const RemovedAdmin = event('0x787a2e12f4a55b658b8f573c32432ee11a5e8b51677d1e1e937aaf6a0bb5776e', {
    removedAdmin: indexed(address),
    admin: indexed(address),
})
export type RemovedAdminEventArgs = EParams<typeof RemovedAdmin>

/** RemovedOperator(address,address) */
export const RemovedOperator = event('0xf7262ed0443cc211121ceb1a80d69004f319245615a7488f951f1437fd91642c', {
    removedOperator: indexed(address),
    admin: indexed(address),
})
export type RemovedOperatorEventArgs = EParams<typeof RemovedOperator>

/** TradingPaused(address) */
export const TradingPaused = event('0x203c4bd3e526634f661575359ff30de3b0edaba6c2cb1eac60f730b6d2d9d536', {
    pauser: indexed(address),
})
export type TradingPausedEventArgs = EParams<typeof TradingPaused>

/** TradingUnpaused(address) */
export const TradingUnpaused = event('0xa1e8a54850dbd7f520bcc09f47bff152294b77b2081da545a7adf531b7ea283b', {
    pauser: indexed(address),
})
export type TradingUnpausedEventArgs = EParams<typeof TradingUnpaused>

/** UserPauseBlockIntervalUpdated(uint256,uint256) */
export const UserPauseBlockIntervalUpdated = event('0x8c8acf678b7cd311e3b5768c92794d63943684862fdea390856e14d9e2a9ef88', {
    oldInterval: uint256,
    newInterval: uint256,
})
export type UserPauseBlockIntervalUpdatedEventArgs = EParams<typeof UserPauseBlockIntervalUpdated>

/** UserPaused(address,uint256) */
export const UserPaused = event('0xa3e76126f19eb25001b29726d2a9502b6377938633d2d6a955107dd442e7a14a', {
    user: indexed(address),
    effectivePauseBlock: uint256,
})
export type UserPausedEventArgs = EParams<typeof UserPaused>

/** UserUnpaused(address) */
export const UserUnpaused = event('0x1419d4111b5c8636aecff843bf618525f4f8e1aa6898a14357021d68dde8af12', {
    user: indexed(address),
})
export type UserUnpausedEventArgs = EParams<typeof UserUnpaused>
