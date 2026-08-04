import { address, array, bytes32, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** PositionsRedeemed(address,bytes32,uint256[],uint256) */
export const PositionsRedeemed = event('0x1daec0b1f629de29b749a189499f43104a80df46a9f34d9ccf73aa59b85fc0c0', {
    initiator: indexed(address),
    conditionId: indexed(bytes32),
    amounts: array(uint256),
    payout: uint256,
})
export type PositionsRedeemedEventArgs = EParams<typeof PositionsRedeemed>
