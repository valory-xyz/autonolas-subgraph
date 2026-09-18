import { address, bool, bytes, bytes32, string, struct, uint112, uint256, uint32, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** DOMAIN_SEPARATOR() */
export const DOMAIN_SEPARATOR = func('0x3644e515', {}, bytes32)
export type DOMAIN_SEPARATORParams = FunctionArguments<typeof DOMAIN_SEPARATOR>
export type DOMAIN_SEPARATORReturn = FunctionReturn<typeof DOMAIN_SEPARATOR>

/** MINIMUM_LIQUIDITY() */
export const MINIMUM_LIQUIDITY = func('0xba9a7a56', {}, uint256)
export type MINIMUM_LIQUIDITYParams = FunctionArguments<typeof MINIMUM_LIQUIDITY>
export type MINIMUM_LIQUIDITYReturn = FunctionReturn<typeof MINIMUM_LIQUIDITY>

/** PERMIT_TYPEHASH() */
export const PERMIT_TYPEHASH = func('0x30adf81f', {}, bytes32)
export type PERMIT_TYPEHASHParams = FunctionArguments<typeof PERMIT_TYPEHASH>
export type PERMIT_TYPEHASHReturn = FunctionReturn<typeof PERMIT_TYPEHASH>

/** allowance(address,address) */
export const allowance = func('0xdd62ed3e', {
    _0: address,
    _1: address,
}, uint256)
export type AllowanceParams = FunctionArguments<typeof allowance>
export type AllowanceReturn = FunctionReturn<typeof allowance>

/** approve(address,uint256) */
export const approve = func('0x095ea7b3', {
    spender: address,
    value: uint256,
}, bool)
export type ApproveParams = FunctionArguments<typeof approve>
export type ApproveReturn = FunctionReturn<typeof approve>

/** balanceOf(address) */
export const balanceOf = func('0x70a08231', {
    _0: address,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** burn(address) */
export const burn = func('0x89afcb44', {
    to: address,
}, struct({
    amount0: uint256,
    amount1: uint256,
}))
export type BurnParams = FunctionArguments<typeof burn>
export type BurnReturn = FunctionReturn<typeof burn>

/** decimals() */
export const decimals = func('0x313ce567', {}, uint8)
export type DecimalsParams = FunctionArguments<typeof decimals>
export type DecimalsReturn = FunctionReturn<typeof decimals>

/** factory() */
export const factory = func('0xc45a0155', {}, address)
export type FactoryParams = FunctionArguments<typeof factory>
export type FactoryReturn = FunctionReturn<typeof factory>

/** getReserves() */
export const getReserves = func('0x0902f1ac', {}, struct({
    _reserve0: uint112,
    _reserve1: uint112,
    _blockTimestampLast: uint32,
}))
export type GetReservesParams = FunctionArguments<typeof getReserves>
export type GetReservesReturn = FunctionReturn<typeof getReserves>

/** initialize(address,address) */
export const initialize = func('0x485cc955', {
    _token0: address,
    _token1: address,
})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** kLast() */
export const kLast = func('0x7464fc3d', {}, uint256)
export type KLastParams = FunctionArguments<typeof kLast>
export type KLastReturn = FunctionReturn<typeof kLast>

/** mint(address) */
export const mint = func('0x6a627842', {
    to: address,
}, uint256)
export type MintParams = FunctionArguments<typeof mint>
export type MintReturn = FunctionReturn<typeof mint>

/** name() */
export const name = func('0x06fdde03', {}, string)
export type NameParams = FunctionArguments<typeof name>
export type NameReturn = FunctionReturn<typeof name>

/** nonces(address) */
export const nonces = func('0x7ecebe00', {
    _0: address,
}, uint256)
export type NoncesParams = FunctionArguments<typeof nonces>
export type NoncesReturn = FunctionReturn<typeof nonces>

/** permit(address,address,uint256,uint256,uint8,bytes32,bytes32) */
export const permit = func('0xd505accf', {
    owner: address,
    spender: address,
    value: uint256,
    deadline: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
})
export type PermitParams = FunctionArguments<typeof permit>
export type PermitReturn = FunctionReturn<typeof permit>

/** price0CumulativeLast() */
export const price0CumulativeLast = func('0x5909c0d5', {}, uint256)
export type Price0CumulativeLastParams = FunctionArguments<typeof price0CumulativeLast>
export type Price0CumulativeLastReturn = FunctionReturn<typeof price0CumulativeLast>

/** price1CumulativeLast() */
export const price1CumulativeLast = func('0x5a3d5493', {}, uint256)
export type Price1CumulativeLastParams = FunctionArguments<typeof price1CumulativeLast>
export type Price1CumulativeLastReturn = FunctionReturn<typeof price1CumulativeLast>

/** skim(address) */
export const skim = func('0xbc25cf77', {
    to: address,
})
export type SkimParams = FunctionArguments<typeof skim>
export type SkimReturn = FunctionReturn<typeof skim>

/** swap(uint256,uint256,address,bytes) */
export const swap = func('0x022c0d9f', {
    amount0Out: uint256,
    amount1Out: uint256,
    to: address,
    data: bytes,
})
export type SwapParams = FunctionArguments<typeof swap>
export type SwapReturn = FunctionReturn<typeof swap>

/** symbol() */
export const symbol = func('0x95d89b41', {}, string)
export type SymbolParams = FunctionArguments<typeof symbol>
export type SymbolReturn = FunctionReturn<typeof symbol>

/** sync() */
export const sync = func('0xfff6cae9', {})
export type SyncParams = FunctionArguments<typeof sync>
export type SyncReturn = FunctionReturn<typeof sync>

/** token0() */
export const token0 = func('0x0dfe1681', {}, address)
export type Token0Params = FunctionArguments<typeof token0>
export type Token0Return = FunctionReturn<typeof token0>

/** token1() */
export const token1 = func('0xd21220a7', {}, address)
export type Token1Params = FunctionArguments<typeof token1>
export type Token1Return = FunctionReturn<typeof token1>

/** totalSupply() */
export const totalSupply = func('0x18160ddd', {}, uint256)
export type TotalSupplyParams = FunctionArguments<typeof totalSupply>
export type TotalSupplyReturn = FunctionReturn<typeof totalSupply>

/** transfer(address,uint256) */
export const transfer = func('0xa9059cbb', {
    to: address,
    value: uint256,
}, bool)
export type TransferParams = FunctionArguments<typeof transfer>
export type TransferReturn = FunctionReturn<typeof transfer>

/** transferFrom(address,address,uint256) */
export const transferFrom = func('0x23b872dd', {
    from: address,
    to: address,
    value: uint256,
}, bool)
export type TransferFromParams = FunctionArguments<typeof transferFrom>
export type TransferFromReturn = FunctionReturn<typeof transferFrom>
