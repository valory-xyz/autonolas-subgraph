import { address, array, bool, uint256 } from '@subsquid/evm-codec'
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

/** RewardClaimed(uint256,uint256,address,address,uint256[],address[],uint256[]) */
export const RewardClaimed = event('0x864efc4da684ac6ad62200fbb4a99b645db477eb2956f086eeeafd2c7bcc73c7', {
    epoch: uint256,
    serviceId: indexed(uint256),
    owner: indexed(address),
    multisig: indexed(address),
    nonces: array(uint256),
    receivers: array(address),
    rewardAmounts: array(uint256),
})
export type RewardClaimedEventArgs = EParams<typeof RewardClaimed>

/** ServiceBaselineMissing(uint256,uint256) */
export const ServiceBaselineMissing = event('0x144506abaa154e8ed21802b3de99b6df3428f32221b7931c08a61a4cc7cbc265', {
    epoch: indexed(uint256),
    serviceId: indexed(uint256),
})
export type ServiceBaselineMissingEventArgs = EParams<typeof ServiceBaselineMissing>

/** ServiceBaselineRecovered(uint256,uint256) */
export const ServiceBaselineRecovered = event('0x4b5933f1b3c898c9f6125df508b829fb84f69385186537aa53af1c19800ea84d', {
    epoch: indexed(uint256),
    serviceId: indexed(uint256),
})
export type ServiceBaselineRecoveredEventArgs = EParams<typeof ServiceBaselineRecovered>

/** ServiceInactivityWarning(uint256,uint256,uint256) */
export const ServiceInactivityWarning = event('0x33dc5cdf1e035de8a7fe16ad7a30a441d30ee51719d3f07703ee35d4348f0779', {
    epoch: uint256,
    serviceId: indexed(uint256),
    serviceInactivity: uint256,
})
export type ServiceInactivityWarningEventArgs = EParams<typeof ServiceInactivityWarning>

/** ServiceStaked(uint256,uint256,address,address,uint256[],uint256) */
export const ServiceStaked = event('0x6b61c467ca2c6260d447e4fd9558e73f39bcfb12c6c5d623c036b229593919c2', {
    epoch: uint256,
    serviceId: indexed(uint256),
    owner: indexed(address),
    multisig: indexed(address),
    nonces: array(uint256),
    rewardDistributionInfo: uint256,
})
export type ServiceStakedEventArgs = EParams<typeof ServiceStaked>

/** ServiceUnstaked(uint256,uint256,address,address,uint256[],uint256,bool) */
export const ServiceUnstaked = event('0x942b79f9aa49061a8803eaff2163188d7f0eec496d4fb942b553f0e9cb2290f1', {
    epoch: uint256,
    serviceId: indexed(uint256),
    owner: indexed(address),
    multisig: indexed(address),
    nonces: array(uint256),
    availableRewards: uint256,
    enforced: bool,
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

/** ServicesRebaselined(uint256) */
export const ServicesRebaselined = event('0xf4041f84c1957fcf914f43ffe042f77154975b00ccdcf9498166246618a28a5b', {
    epoch: indexed(uint256),
})
export type ServicesRebaselinedEventArgs = EParams<typeof ServicesRebaselined>

/** Withdraw(address,uint256) */
export const Withdraw = event('0x884edad9ce6fa2440d8a54cc123490eb96d2768479d49ff9c7366125a9424364', {
    receiver: indexed(address),
    amount: uint256,
})
export type WithdrawEventArgs = EParams<typeof Withdraw>
