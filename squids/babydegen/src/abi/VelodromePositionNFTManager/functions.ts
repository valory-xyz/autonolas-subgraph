import { address, int24, struct, uint128, uint256, uint96 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** positions(uint256) */
export const positions = func('0x99fbab88', {
    tokenId: uint256,
}, struct({
    nonce: uint96,
    operator: address,
    token0: address,
    token1: address,
    tickSpacing: int24,
    tickLower: int24,
    tickUpper: int24,
    liquidity: uint128,
    feeGrowthInside0LastX128: uint256,
    feeGrowthInside1LastX128: uint256,
    tokensOwed0: uint128,
    tokensOwed1: uint128,
}))
export type PositionsParams = FunctionArguments<typeof positions>
export type PositionsReturn = FunctionReturn<typeof positions>
