import { address, array, bool, bytes32, int256, string } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** KARMA_PROXY() */
export const KARMA_PROXY = func('0xfc3aecd0', {}, bytes32)
export type KARMA_PROXYParams = FunctionArguments<typeof KARMA_PROXY>
export type KARMA_PROXYReturn = FunctionReturn<typeof KARMA_PROXY>

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** changeImplementation(address) */
export const changeImplementation = func('0x17a68dd8', {
    newImplementation: address,
})
export type ChangeImplementationParams = FunctionArguments<typeof changeImplementation>
export type ChangeImplementationReturn = FunctionReturn<typeof changeImplementation>

/** changeMechKarma(address,int256) */
export const changeMechKarma = func('0x4225d37a', {
    mech: address,
    karmaChange: int256,
})
export type ChangeMechKarmaParams = FunctionArguments<typeof changeMechKarma>
export type ChangeMechKarmaReturn = FunctionReturn<typeof changeMechKarma>

/** changeOwner(address) */
export const changeOwner = func('0xa6f9dae1', {
    newOwner: address,
})
export type ChangeOwnerParams = FunctionArguments<typeof changeOwner>
export type ChangeOwnerReturn = FunctionReturn<typeof changeOwner>

/** changeRequesterMechKarma(address,address,int256) */
export const changeRequesterMechKarma = func('0x55e7d044', {
    requester: address,
    mech: address,
    karmaChange: int256,
})
export type ChangeRequesterMechKarmaParams = FunctionArguments<typeof changeRequesterMechKarma>
export type ChangeRequesterMechKarmaReturn = FunctionReturn<typeof changeRequesterMechKarma>

/** initialize() */
export const initialize = func('0x8129fc1c', {})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** mapMechKarma(address) */
export const mapMechKarma = func('0x9ecfd0ef', {
    _0: address,
}, int256)
export type MapMechKarmaParams = FunctionArguments<typeof mapMechKarma>
export type MapMechKarmaReturn = FunctionReturn<typeof mapMechKarma>

/** mapMechMarketplaces(address) */
export const mapMechMarketplaces = func('0x643f28d9', {
    _0: address,
}, bool)
export type MapMechMarketplacesParams = FunctionArguments<typeof mapMechMarketplaces>
export type MapMechMarketplacesReturn = FunctionReturn<typeof mapMechMarketplaces>

/** mapRequesterMechKarma(address,address) */
export const mapRequesterMechKarma = func('0x30a2c843', {
    _0: address,
    _1: address,
}, int256)
export type MapRequesterMechKarmaParams = FunctionArguments<typeof mapRequesterMechKarma>
export type MapRequesterMechKarmaReturn = FunctionReturn<typeof mapRequesterMechKarma>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** setMechMarketplaceStatuses(address[],bool[]) */
export const setMechMarketplaceStatuses = func('0x0aa4a379', {
    mechMarketplaces: array(address),
    statuses: array(bool),
})
export type SetMechMarketplaceStatusesParams = FunctionArguments<typeof setMechMarketplaceStatuses>
export type SetMechMarketplaceStatusesReturn = FunctionReturn<typeof setMechMarketplaceStatuses>
