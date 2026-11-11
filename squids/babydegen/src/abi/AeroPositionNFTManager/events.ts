import { int24, uint128, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** IncreaseLiquidity(uint256,uint128,uint256,uint256,int24,int24) */
export const IncreaseLiquidity = event('0x0f8712c47eb813e705bf827a60bdd551e6f2e055b4a1c2004304d52208a5a513', {
    tokenId: indexed(uint256),
    liquidity: uint128,
    amount0: uint256,
    amount1: uint256,
    tickLower: int24,
    tickUpper: int24,
})
export type IncreaseLiquidityEventArgs = EParams<typeof IncreaseLiquidity>
