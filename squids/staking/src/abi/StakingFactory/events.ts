import { address, bool } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** InstanceCreated(address,address,address) */
export const InstanceCreated = event('0xc88bd7cfbe8bae024ebb6f3cf291adfd7db2588a07e1c78768ea3c81b992496b', {
    sender: indexed(address),
    instance: indexed(address),
    implementation: indexed(address),
})
export type InstanceCreatedEventArgs = EParams<typeof InstanceCreated>

/** InstanceRemoved(address) */
export const InstanceRemoved = event('0x5e8652b9d1a24d82bfe7a9bfae71e26899d688827382d41f69b1c79342c586aa', {
    instance: indexed(address),
})
export type InstanceRemovedEventArgs = EParams<typeof InstanceRemoved>

/** InstanceStatusChanged(address,bool) */
export const InstanceStatusChanged = event('0x11126b4c1d3b69d7dd553c2f8b2be5f8fabfe22552ceffc3240126fdc087eca0', {
    instance: indexed(address),
    isEnabled: bool,
})
export type InstanceStatusChangedEventArgs = EParams<typeof InstanceStatusChanged>

/** OwnerUpdated(address) */
export const OwnerUpdated = event('0x4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b', {
    owner: indexed(address),
})
export type OwnerUpdatedEventArgs = EParams<typeof OwnerUpdated>

/** VerifierUpdated(address) */
export const VerifierUpdated = event('0xd24015cc99cc1700cafca3042840a1d8ac1e3964fd2e0e37ea29c654056ee327', {
    verifier: indexed(address),
})
export type VerifierUpdatedEventArgs = EParams<typeof VerifierUpdated>
