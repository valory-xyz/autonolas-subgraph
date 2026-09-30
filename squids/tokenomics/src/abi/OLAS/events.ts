import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Approval(address,address,uint256) */
export const Approval = event('0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', {
    owner: indexed(address),
    spender: indexed(address),
    amount: uint256,
})
export type ApprovalEventArgs = EParams<typeof Approval>

/** MinterUpdated(address) */
export const MinterUpdated = event('0xad0f299ec81a386c98df0ac27dae11dd020ed1b56963c53a7292e7a3a314539a', {
    minter: indexed(address),
})
export type MinterUpdatedEventArgs = EParams<typeof MinterUpdated>

/** OwnerUpdated(address) */
export const OwnerUpdated = event('0x4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b', {
    owner: indexed(address),
})
export type OwnerUpdatedEventArgs = EParams<typeof OwnerUpdated>

/** Transfer(address,address,uint256) */
export const Transfer = event('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', {
    from: indexed(address),
    to: indexed(address),
    amount: uint256,
})
export type TransferEventArgs = EParams<typeof Transfer>
