import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Deposit(address,address,uint256) */
export const Deposit = event('0x5548c837ab068cf56a2c2479df0882a4922fd203edb7517321831d95078c5f62', {
    account: indexed(address),
    token: indexed(address),
    amount: uint256,
})
export type DepositEventArgs = EParams<typeof Deposit>

/** Drained(address,uint256) */
export const Drained = event('0xb2559daa129ad136aac2133ac6a0c75920abbef7d6663a017a94e181b13786c3', {
    token: indexed(address),
    collectedFees: uint256,
})
export type DrainedEventArgs = EParams<typeof Drained>

/** MechBalanceAdjusted(address,uint256,uint256,uint256) */
export const MechBalanceAdjusted = event('0xd11af879a940c7604caa3933cb8a021f09a06692f4d05a5843fe06a003abed68', {
    mech: indexed(address),
    deliveryRate: uint256,
    balance: uint256,
    rateDiff: uint256,
})
export type MechBalanceAdjustedEventArgs = EParams<typeof MechBalanceAdjusted>

/** RequesterBalanceAdjusted(address,uint256,uint256) */
export const RequesterBalanceAdjusted = event('0x00572a5ba2b0e6be13dc09fac07a0c06782c5defdef8694b0085972ebdb12012', {
    requester: indexed(address),
    deliveryRate: uint256,
    balance: uint256,
})
export type RequesterBalanceAdjustedEventArgs = EParams<typeof RequesterBalanceAdjusted>

/** Withdraw(address,address,uint256) */
export const Withdraw = event('0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb', {
    account: indexed(address),
    token: indexed(address),
    amount: uint256,
})
export type WithdrawEventArgs = EParams<typeof Withdraw>
