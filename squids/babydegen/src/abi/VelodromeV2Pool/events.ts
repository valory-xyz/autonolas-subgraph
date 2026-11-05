import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Mint(address,uint256,uint256) */
export const Mint = event('0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f', {
    sender: indexed(address),
    amount0: uint256,
    amount1: uint256,
})
export type MintEventArgs = EParams<typeof Mint>

/** Burn(address,address,uint256,uint256) */
export const Burn = event('0x5d624aa9c148153ab3446c1b154f660ee7701e549fe9b62dab7171b1c80e6fa2', {
    sender: indexed(address),
    to: indexed(address),
    amount0: uint256,
    amount1: uint256,
})
export type BurnEventArgs = EParams<typeof Burn>

/** Sync(uint256,uint256) */
export const Sync = event('0xcf2aa50876cdfbb541206f89af0ee78d44a2abf8d328e37fa4917f982149848a', {
    reserve0: uint256,
    reserve1: uint256,
})
export type SyncEventArgs = EParams<typeof Sync>

/** Swap(address,address,uint256,uint256,uint256,uint256) */
export const Swap = event('0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b', {
    sender: indexed(address),
    to: indexed(address),
    amount0In: uint256,
    amount1In: uint256,
    amount0Out: uint256,
    amount1Out: uint256,
})
export type SwapEventArgs = EParams<typeof Swap>

/** Transfer(address,address,uint256) */
export const Transfer = event('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', {
    from: indexed(address),
    to: indexed(address),
    value: uint256,
})
export type TransferEventArgs = EParams<typeof Transfer>
