import { address, array, bool, bytes, bytes32, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** CreateMech(address,uint256,address) */
export const CreateMech = event('0x46e1ca45c09520471c43e2e88eca33bb51803011cfd456933629dcc645ecacd6', {
    mech: indexed(address),
    serviceId: indexed(uint256),
    mechFactory: indexed(address),
})
export type CreateMechEventArgs = EParams<typeof CreateMech>

/** Deliver(address,address,bytes32,uint256,bytes,bytes) */
export const Deliver = event('0xb52c441d5d16afb15432ee2f89555eb92952fedce6726bbcb8aba672d49d28f6', {
    mech: indexed(address),
    mechServiceMultisig: indexed(address),
    requestId: bytes32,
    deliveryRate: uint256,
    requestData: bytes,
    deliveryData: bytes,
})
export type DeliverEventArgs = EParams<typeof Deliver>

/** ImplementationUpdated(address) */
export const ImplementationUpdated = event('0x310ba5f1d2ed074b51e2eccd052a47ae9ab7c6b800d1fca3db3999d6a592ca03', {
    implementation: indexed(address),
})
export type ImplementationUpdatedEventArgs = EParams<typeof ImplementationUpdated>

/** MarketplaceDelivery(address,address[],uint256,bytes32[],bool[]) */
export const MarketplaceDelivery = event('0x894bb814a80f77e14febccf552394d95b38cc21a6dda1b0cf26434433fdf3e4c', {
    deliveryMech: indexed(address),
    requesters: array(address),
    numDeliveries: uint256,
    requestIds: array(bytes32),
    deliveredRequests: array(bool),
})
export type MarketplaceDeliveryEventArgs = EParams<typeof MarketplaceDelivery>

/** MarketplaceDeliveryWithSignatures(address,address,uint256,bytes32[]) */
export const MarketplaceDeliveryWithSignatures = event('0xf980d83e9456535b0f9f3634d171df2a5f052f5d5e706b75d30c4e0433da927d', {
    deliveryMech: indexed(address),
    requester: indexed(address),
    numDeliveries: uint256,
    requestIds: array(bytes32),
})
export type MarketplaceDeliveryWithSignaturesEventArgs = EParams<typeof MarketplaceDeliveryWithSignatures>

/** MarketplaceParamsUpdated(uint256,uint256,uint256) */
export const MarketplaceParamsUpdated = event('0x64d0972bd5d0c2828d80911b61084d86d61214c3081656ca3a720047a8832035', {
    fee: uint256,
    minResponseTimeout: uint256,
    maxResponseTimeout: uint256,
})
export type MarketplaceParamsUpdatedEventArgs = EParams<typeof MarketplaceParamsUpdated>

/** MarketplaceRequest(address,address,uint256,bytes32[],bytes[]) */
export const MarketplaceRequest = event('0xb1ea35a385d4517ac7b3fb0eac4f62db4f0c5b4cf8b7aef789bbd1db097edb25', {
    priorityMech: indexed(address),
    requester: indexed(address),
    numRequests: uint256,
    requestIds: array(bytes32),
    requestDatas: array(bytes),
})
export type MarketplaceRequestEventArgs = EParams<typeof MarketplaceRequest>

/** OwnerUpdated(address) */
export const OwnerUpdated = event('0x4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b', {
    owner: indexed(address),
})
export type OwnerUpdatedEventArgs = EParams<typeof OwnerUpdated>

/** SetMechFactoryStatuses(address[],bool[]) */
export const SetMechFactoryStatuses = event('0x8cc6be981009d13170c616af494b7d671ed2d84b7e6891e4c8f21fe065c00dfc', {
    mechFactories: array(address),
    statuses: array(bool),
})
export type SetMechFactoryStatusesEventArgs = EParams<typeof SetMechFactoryStatuses>

/** SetPaymentTypeBalanceTrackers(bytes32[],address[]) */
export const SetPaymentTypeBalanceTrackers = event('0xa9759667b17e564f26a0d91ce1c5e4a1dc3910aee992dc3f5f4da0a59d48f3cb', {
    paymentTypes: array(bytes32),
    balanceTrackers: array(address),
})
export type SetPaymentTypeBalanceTrackersEventArgs = EParams<typeof SetPaymentTypeBalanceTrackers>
