import { address, bytes32, uint256, uint64, uint8 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** FeeCharged(address,uint256) */
export const FeeCharged = event('0x55bb3cade9d43b798a4fe5ffdd05024b2d7870df53920673bfc7e68047cd0ab1', {
    receiver: indexed(address),
    amount: uint256,
})
export type FeeChargedEventArgs = EParams<typeof FeeCharged>

/** Initialized(uint64) */
export const Initialized = event('0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2', {
    version: uint64,
})
export type InitializedEventArgs = EParams<typeof Initialized>

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

/** OwnershipHandoverCanceled(address) */
export const OwnershipHandoverCanceled = event('0xfa7b8eab7da67f412cc9575ed43464468f9bfbae89d1675917346ca6d8fe3c92', {
    pendingOwner: indexed(address),
})
export type OwnershipHandoverCanceledEventArgs = EParams<typeof OwnershipHandoverCanceled>

/** OwnershipHandoverRequested(address) */
export const OwnershipHandoverRequested = event('0xdbf36a107da19e49527a7176a1babf963b4b0ff8cde35ee35d6cd8f1f9ac7e1d', {
    pendingOwner: indexed(address),
})
export type OwnershipHandoverRequestedEventArgs = EParams<typeof OwnershipHandoverRequested>

/** OwnershipTransferred(address,address) */
export const OwnershipTransferred = event('0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0', {
    oldOwner: indexed(address),
    newOwner: indexed(address),
})
export type OwnershipTransferredEventArgs = EParams<typeof OwnershipTransferred>

/** RolesUpdated(address,uint256) */
export const RolesUpdated = event('0x715ad5ce61fc9595c7b415289d59cf203f23a94fa06f04af7e489a0a76e1fe26', {
    user: indexed(address),
    roles: indexed(uint256),
})
export type RolesUpdatedEventArgs = EParams<typeof RolesUpdated>

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

/** Upgraded(address) */
export const Upgraded = event('0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b', {
    implementation: indexed(address),
})
export type UpgradedEventArgs = EParams<typeof Upgraded>

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
