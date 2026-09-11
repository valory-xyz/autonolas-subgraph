import { address, array, bool, int256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** ImplementationUpdated(address) */
export const ImplementationUpdated = event('0x310ba5f1d2ed074b51e2eccd052a47ae9ab7c6b800d1fca3db3999d6a592ca03', {
    implementation: indexed(address),
})
export type ImplementationUpdatedEventArgs = EParams<typeof ImplementationUpdated>

/** MechKarmaChanged(address,int256) */
export const MechKarmaChanged = event('0x417740bdbf75bcc9cd063a95c8af25366c2a27f49d23d5eeafc2db269143af5f', {
    mech: indexed(address),
    karmaChange: int256,
})
export type MechKarmaChangedEventArgs = EParams<typeof MechKarmaChanged>

/** OwnerUpdated(address) */
export const OwnerUpdated = event('0x4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b', {
    owner: indexed(address),
})
export type OwnerUpdatedEventArgs = EParams<typeof OwnerUpdated>

/** RequesterMechKarmaChanged(address,address,int256) */
export const RequesterMechKarmaChanged = event('0x3df02d68ad731eb0c4caab8f9424137610f574d333c6a00ce3e0ef6b6d032ba4', {
    requester: indexed(address),
    mech: indexed(address),
    karmaChange: int256,
})
export type RequesterMechKarmaChangedEventArgs = EParams<typeof RequesterMechKarmaChanged>

/** SetMechMarketplaceStatuses(address[],bool[]) */
export const SetMechMarketplaceStatuses = event('0xa643ff1a5a85bb4fd8c0288e824ec47c8cd49401b14544c4bcb2f40ec8adda69', {
    mechMarketplaces: array(address),
    statuses: array(bool),
})
export type SetMechMarketplaceStatusesEventArgs = EParams<typeof SetMechMarketplaceStatuses>
