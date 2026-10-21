import { address, array, bool, string, uint256, uint64 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** ApprovalForAll(address,address,bool) */
export const ApprovalForAll = event('0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31', {
    owner: indexed(address),
    operator: indexed(address),
    isApproved: bool,
})
export type ApprovalForAllEventArgs = EParams<typeof ApprovalForAll>

/** CrossModuleAuthSet(address,bool) */
export const CrossModuleAuthSet = event('0x26bdfbc198f2d30945bd9a2384cb5d3b97a1cfe249d1538aa803c7fbb79681cb', {
    module: indexed(address),
    authorized: bool,
})
export type CrossModuleAuthSetEventArgs = EParams<typeof CrossModuleAuthSet>

/** Initialized(uint64) */
export const Initialized = event('0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2', {
    version: uint64,
})
export type InitializedEventArgs = EParams<typeof Initialized>

/** ModuleAdded(uint256,address) */
export const ModuleAdded = event('0xa7839c29a2c3fc5208115d9be22d20b2a981203a3428218dd76c76d690254499', {
    moduleId: indexed(uint256),
    module: indexed(address),
})
export type ModuleAddedEventArgs = EParams<typeof ModuleAdded>

/** ModuleRemoved(uint256,address) */
export const ModuleRemoved = event('0x854cff40228579f66eb3dd26b84ef9d8bb9f43b2a6a03495f29fae9b2827d987', {
    moduleId: indexed(uint256),
    module: indexed(address),
})
export type ModuleRemovedEventArgs = EParams<typeof ModuleRemoved>

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

/** URI(string,uint256) */
export const URI = event('0x6bb7ff708619ba0610cba295a58592e0451dee2622938c8755667688daf3529b', {
    value: string,
    id: indexed(uint256),
})
export type URIEventArgs = EParams<typeof URI>

/** Upgraded(address) */
export const Upgraded = event('0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b', {
    implementation: indexed(address),
})
export type UpgradedEventArgs = EParams<typeof Upgraded>
