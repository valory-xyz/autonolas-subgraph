import { address, bool, bytes32, string, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** DOMAIN_SEPARATOR() */
export const DOMAIN_SEPARATOR = func('0x3644e515', {}, bytes32)
export type DOMAIN_SEPARATORParams = FunctionArguments<typeof DOMAIN_SEPARATOR>
export type DOMAIN_SEPARATORReturn = FunctionReturn<typeof DOMAIN_SEPARATOR>

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
    amount: uint256,
}, bool)
export type ApproveParams = FunctionArguments<typeof approve>
export type ApproveReturn = FunctionReturn<typeof approve>

/** balanceOf(address) */
export const balanceOf = func('0x70a08231', {
    _0: address,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** burn(uint256) */
export const burn = func('0x42966c68', {
    amount: uint256,
})
export type BurnParams = FunctionArguments<typeof burn>
export type BurnReturn = FunctionReturn<typeof burn>

/** changeMinter(address) */
export const changeMinter = func('0x2c4d4d18', {
    newMinter: address,
})
export type ChangeMinterParams = FunctionArguments<typeof changeMinter>
export type ChangeMinterReturn = FunctionReturn<typeof changeMinter>

/** changeOwner(address) */
export const changeOwner = func('0xa6f9dae1', {
    newOwner: address,
})
export type ChangeOwnerParams = FunctionArguments<typeof changeOwner>
export type ChangeOwnerReturn = FunctionReturn<typeof changeOwner>

/** decimals() */
export const decimals = func('0x313ce567', {}, uint8)
export type DecimalsParams = FunctionArguments<typeof decimals>
export type DecimalsReturn = FunctionReturn<typeof decimals>

/** decreaseAllowance(address,uint256) */
export const decreaseAllowance = func('0xa457c2d7', {
    spender: address,
    amount: uint256,
}, bool)
export type DecreaseAllowanceParams = FunctionArguments<typeof decreaseAllowance>
export type DecreaseAllowanceReturn = FunctionReturn<typeof decreaseAllowance>

/** increaseAllowance(address,uint256) */
export const increaseAllowance = func('0x39509351', {
    spender: address,
    amount: uint256,
}, bool)
export type IncreaseAllowanceParams = FunctionArguments<typeof increaseAllowance>
export type IncreaseAllowanceReturn = FunctionReturn<typeof increaseAllowance>

/** inflationControl(uint256) */
export const inflationControl = func('0x6e79265c', {
    amount: uint256,
}, bool)
export type InflationControlParams = FunctionArguments<typeof inflationControl>
export type InflationControlReturn = FunctionReturn<typeof inflationControl>

/** inflationRemainder() */
export const inflationRemainder = func('0xb091dab3', {}, uint256)
export type InflationRemainderParams = FunctionArguments<typeof inflationRemainder>
export type InflationRemainderReturn = FunctionReturn<typeof inflationRemainder>

/** maxMintCapFraction() */
export const maxMintCapFraction = func('0x5ff99e9d', {}, uint256)
export type MaxMintCapFractionParams = FunctionArguments<typeof maxMintCapFraction>
export type MaxMintCapFractionReturn = FunctionReturn<typeof maxMintCapFraction>

/** mint(address,uint256) */
export const mint = func('0x40c10f19', {
    account: address,
    amount: uint256,
})
export type MintParams = FunctionArguments<typeof mint>
export type MintReturn = FunctionReturn<typeof mint>

/** minter() */
export const minter = func('0x07546172', {}, address)
export type MinterParams = FunctionArguments<typeof minter>
export type MinterReturn = FunctionReturn<typeof minter>

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

/** oneYear() */
export const oneYear = func('0xf27c3bf6', {}, uint256)
export type OneYearParams = FunctionArguments<typeof oneYear>
export type OneYearReturn = FunctionReturn<typeof oneYear>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

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

/** symbol() */
export const symbol = func('0x95d89b41', {}, string)
export type SymbolParams = FunctionArguments<typeof symbol>
export type SymbolReturn = FunctionReturn<typeof symbol>

/** tenYearSupplyCap() */
export const tenYearSupplyCap = func('0x0a8ded1d', {}, uint256)
export type TenYearSupplyCapParams = FunctionArguments<typeof tenYearSupplyCap>
export type TenYearSupplyCapReturn = FunctionReturn<typeof tenYearSupplyCap>

/** timeLaunch() */
export const timeLaunch = func('0x8e4a8379', {}, uint256)
export type TimeLaunchParams = FunctionArguments<typeof timeLaunch>
export type TimeLaunchReturn = FunctionReturn<typeof timeLaunch>

/** totalSupply() */
export const totalSupply = func('0x18160ddd', {}, uint256)
export type TotalSupplyParams = FunctionArguments<typeof totalSupply>
export type TotalSupplyReturn = FunctionReturn<typeof totalSupply>

/** transfer(address,uint256) */
export const transfer = func('0xa9059cbb', {
    to: address,
    amount: uint256,
}, bool)
export type TransferParams = FunctionArguments<typeof transfer>
export type TransferReturn = FunctionReturn<typeof transfer>

/** transferFrom(address,address,uint256) */
export const transferFrom = func('0x23b872dd', {
    from: address,
    to: address,
    amount: uint256,
}, bool)
export type TransferFromParams = FunctionArguments<typeof transferFrom>
export type TransferFromReturn = FunctionReturn<typeof transferFrom>
