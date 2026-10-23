import { address, array, bytes31, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** ConditionResolved(bytes31,uint256[]) */
export const ConditionResolved = event('0xe560c1a2847d4cf2e66de11fe592605556989449f38cc3ab96e2e287daa68caa', {
    conditionId: indexed(bytes31),
    result: array(uint256),
})
export type ConditionResolvedEventArgs = EParams<typeof ConditionResolved>

/** PositionRedeemed(address,uint256,address,uint256,uint256) */
export const PositionRedeemed = event('0x4fd474b703f46b453536518b4cbc159dfbea6fd663233763d321a9bc8ccdf97f', {
    initiator: indexed(address),
    positionId: indexed(uint256),
    recipient: indexed(address),
    amount: uint256,
    payout: uint256,
})
export type PositionRedeemedEventArgs = EParams<typeof PositionRedeemed>
