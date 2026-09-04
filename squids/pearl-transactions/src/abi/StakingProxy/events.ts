import { address, array, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Checkpoint(uint256,uint256,uint256[],uint256[],uint256) */
export const Checkpoint = event('0x48b735a18ed32318d316214e41387be29c52e29df4598f2b8e40fa843be3f940', {
    epoch: indexed(uint256),
    availableRewards: uint256,
    serviceIds: array(uint256),
    rewards: array(uint256),
    epochLength: uint256,
})
export type CheckpointEventArgs = EParams<typeof Checkpoint>

/** Deposit(address,uint256,uint256,uint256) */
export const Deposit = event('0x36af321ec8d3c75236829c5317affd40ddb308863a1236d2d277a4025cccee1e', {
    sender: indexed(address),
    amount: uint256,
    balance: uint256,
    availableRewards: uint256,
})
export type DepositEventArgs = EParams<typeof Deposit>

/** RewardClaimed(uint256,uint256,address,address,uint256[],uint256) */
export const RewardClaimed = event('0x31add0166dae59ea66bbc180e4fae85b72fc9b7b5fc7b0f7257e4721a840c96e', {
    epoch: uint256,
    serviceId: indexed(uint256),
    owner: indexed(address),
    multisig: indexed(address),
    nonces: array(uint256),
    reward: uint256,
})
export type RewardClaimedEventArgs = EParams<typeof RewardClaimed>

/** ServiceForceUnstaked(uint256,uint256,address,address,uint256[],uint256,uint256) */
export const ServiceForceUnstaked = event('0x91c9f7c7f307bcc0ae02ba613bd8d07c29e94952f0a28803ded176fcd7d96d64', {
    epoch: uint256,
    serviceId: indexed(uint256),
    owner: indexed(address),
    multisig: indexed(address),
    nonces: array(uint256),
    reward: uint256,
    availableRewards: uint256,
})
export type ServiceForceUnstakedEventArgs = EParams<typeof ServiceForceUnstaked>

/** ServiceInactivityWarning(uint256,uint256,uint256) */
export const ServiceInactivityWarning = event('0x33dc5cdf1e035de8a7fe16ad7a30a441d30ee51719d3f07703ee35d4348f0779', {
    epoch: uint256,
    serviceId: indexed(uint256),
    serviceInactivity: uint256,
})
export type ServiceInactivityWarningEventArgs = EParams<typeof ServiceInactivityWarning>

/** ServiceStaked(uint256,uint256,address,address,uint256[]) */
export const ServiceStaked = event('0xaa6b005b4958114a0c90492461c24af6525ae0178db7fbf44125ae9217c69ccb', {
    epoch: uint256,
    serviceId: indexed(uint256),
    owner: indexed(address),
    multisig: indexed(address),
    nonces: array(uint256),
})
export type ServiceStakedEventArgs = EParams<typeof ServiceStaked>

/** ServiceUnstaked(uint256,uint256,address,address,uint256[],uint256,uint256) */
export const ServiceUnstaked = event('0x6d789d063e079a4c156e77a20008529fc448dca2cd7e5e7a20abf969fffb9226', {
    epoch: uint256,
    serviceId: indexed(uint256),
    owner: indexed(address),
    multisig: indexed(address),
    nonces: array(uint256),
    reward: uint256,
    availableRewards: uint256,
})
export type ServiceUnstakedEventArgs = EParams<typeof ServiceUnstaked>

/** ServicesEvicted(uint256,uint256[],address[],address[],uint256[]) */
export const ServicesEvicted = event('0xd19a3d42ed383465e4058c322d9411aeac76ddb8454d22e139fc99808bd56952', {
    epoch: indexed(uint256),
    serviceIds: array(uint256),
    owners: array(address),
    multisigs: array(address),
    serviceInactivity: array(uint256),
})
export type ServicesEvictedEventArgs = EParams<typeof ServicesEvicted>

/** Withdraw(address,uint256) */
export const Withdraw = event('0x884edad9ce6fa2440d8a54cc123490eb96d2768479d49ff9c7366125a9424364', {
    to: indexed(address),
    amount: uint256,
})
export type WithdrawEventArgs = EParams<typeof Withdraw>
