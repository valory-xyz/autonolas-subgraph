import { address, bytes32, uint256, uint8 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32) */
export const OrderFilled = event('0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee', {
    orderHash: indexed(bytes32),
    maker: indexed(address),
    taker: indexed(address),
    side: uint8,
    tokenId: uint256,
    makerAmountFilled: uint256,
    takerAmountFilled: uint256,
    fee: uint256,
    builder: bytes32,
    metadata: bytes32,
})
export type OrderFilledEventArgs = EParams<typeof OrderFilled>
