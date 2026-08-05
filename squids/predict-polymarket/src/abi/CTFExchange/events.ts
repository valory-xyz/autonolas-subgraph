import { address, bytes32, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** FeeCharged(address,uint256,uint256) */
export const FeeCharged = event('0xacffcc86834d0f1a64b0d5a675798deed6ff0bcfc2231edd3480e7288dba7ff4', {
    receiver: indexed(address),
    tokenId: uint256,
    amount: uint256,
})
export type FeeChargedEventArgs = EParams<typeof FeeCharged>

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

/** OrderCancelled(bytes32) */
export const OrderCancelled = event('0x5152abf959f6564662358c2e52b702259b78bac5ee7842a0f01937e670efcc7d', {
    orderHash: indexed(bytes32),
})
export type OrderCancelledEventArgs = EParams<typeof OrderCancelled>

/** OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256) */
export const OrderFilled = event('0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6', {
    orderHash: indexed(bytes32),
    maker: indexed(address),
    taker: indexed(address),
    makerAssetId: uint256,
    takerAssetId: uint256,
    makerAmountFilled: uint256,
    takerAmountFilled: uint256,
    fee: uint256,
})
export type OrderFilledEventArgs = EParams<typeof OrderFilled>

/** OrdersMatched(bytes32,address,uint256,uint256,uint256,uint256) */
export const OrdersMatched = event('0x63bf4d16b7fa898ef4c4b2b6d90fd201e9c56313b65638af6088d149d2ce956c', {
    takerOrderHash: indexed(bytes32),
    takerOrderMaker: indexed(address),
    makerAssetId: uint256,
    takerAssetId: uint256,
    makerAmountFilled: uint256,
    takerAmountFilled: uint256,
})
export type OrdersMatchedEventArgs = EParams<typeof OrdersMatched>

/** ProxyFactoryUpdated(address,address) */
export const ProxyFactoryUpdated = event('0x3053c6252a932554235c173caffc1913604dba3a41cee89516f631c4a1a50a37', {
    oldProxyFactory: indexed(address),
    newProxyFactory: indexed(address),
})
export type ProxyFactoryUpdatedEventArgs = EParams<typeof ProxyFactoryUpdated>

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

/** SafeFactoryUpdated(address,address) */
export const SafeFactoryUpdated = event('0x9726d7faf7429d6b059560dc858ed769377ccdf8b7541eabe12b22548719831f', {
    oldSafeFactory: indexed(address),
    newSafeFactory: indexed(address),
})
export type SafeFactoryUpdatedEventArgs = EParams<typeof SafeFactoryUpdated>

/** TokenRegistered(uint256,uint256,bytes32) */
export const TokenRegistered = event('0xbc9a2432e8aeb48327246cddd6e872ef452812b4243c04e6bfb786a2cd8faf0d', {
    token0: indexed(uint256),
    token1: indexed(uint256),
    conditionId: indexed(bytes32),
})
export type TokenRegisteredEventArgs = EParams<typeof TokenRegistered>

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
