import { address, uint112, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Approval(address,address,uint256) */
export const Approval = event('0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', {
    owner: indexed(address),
    spender: indexed(address),
    value: uint256,
})
export type ApprovalEventArgs = EParams<typeof Approval>

/** Burn(address,uint256,uint256,address) */
export const Burn = event('0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496', {
    sender: indexed(address),
    amount0: uint256,
    amount1: uint256,
    to: indexed(address),
})
export type BurnEventArgs = EParams<typeof Burn>

/** Mint(address,uint256,uint256) */
export const Mint = event('0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f', {
    sender: indexed(address),
    amount0: uint256,
    amount1: uint256,
})
export type MintEventArgs = EParams<typeof Mint>

/** Swap(address,uint256,uint256,uint256,uint256,address) */
export const Swap = event('0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822', {
    sender: indexed(address),
    amount0In: uint256,
    amount1In: uint256,
    amount0Out: uint256,
    amount1Out: uint256,
    to: indexed(address),
})
export type SwapEventArgs = EParams<typeof Swap>

/** Sync(uint112,uint112) */
export const Sync = event('0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1', {
    reserve0: uint112,
    reserve1: uint112,
})
export type SyncEventArgs = EParams<typeof Sync>

/** Transfer(address,address,uint256) */
export const Transfer = event('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', {
    from: indexed(address),
    to: indexed(address),
    value: uint256,
})
export type TransferEventArgs = EParams<typeof Transfer>
