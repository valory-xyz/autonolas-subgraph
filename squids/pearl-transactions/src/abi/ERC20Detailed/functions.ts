import { address, bool, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** totalSupply() */
export const totalSupply = func('0x18160ddd', {}, uint256)
export type TotalSupplyParams = FunctionArguments<typeof totalSupply>
export type TotalSupplyReturn = FunctionReturn<typeof totalSupply>

/** balanceOf(address) */
export const balanceOf = func('0x70a08231', {
    account: address,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** transfer(address,uint256) */
export const transfer = func('0xa9059cbb', {
    recipient: address,
    amount: uint256,
}, bool)
export type TransferParams = FunctionArguments<typeof transfer>
export type TransferReturn = FunctionReturn<typeof transfer>

/** allowance(address,address) */
export const allowance = func('0xdd62ed3e', {
    owner: address,
    spender: address,
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

/** transferFrom(address,address,uint256) */
export const transferFrom = func('0x23b872dd', {
    sender: address,
    recipient: address,
    amount: uint256,
}, bool)
export type TransferFromParams = FunctionArguments<typeof transferFrom>
export type TransferFromReturn = FunctionReturn<typeof transferFrom>

/** increaseAllowance(address,uint256) */
export const increaseAllowance = func('0x39509351', {
    spender: address,
    addedValue: uint256,
}, bool)
export type IncreaseAllowanceParams = FunctionArguments<typeof increaseAllowance>
export type IncreaseAllowanceReturn = FunctionReturn<typeof increaseAllowance>

/** decreaseAllowance(address,uint256) */
export const decreaseAllowance = func('0xa457c2d7', {
    spender: address,
    subtractedValue: uint256,
}, bool)
export type DecreaseAllowanceParams = FunctionArguments<typeof decreaseAllowance>
export type DecreaseAllowanceReturn = FunctionReturn<typeof decreaseAllowance>

/** _mint(address,uint256) */
export const _mint = func('0x4e6ec247', {
    account: address,
    amount: uint256,
})
export type _mintParams = FunctionArguments<typeof _mint>
export type _mintReturn = FunctionReturn<typeof _mint>

/** _burn(address,uint256) */
export const _burn = func('0x6161eb18', {
    account: address,
    amount: uint256,
})
export type _burnParams = FunctionArguments<typeof _burn>
export type _burnReturn = FunctionReturn<typeof _burn>

/** _burnFrom(address,uint256) */
export const _burnFrom = func('0xa22b35ce', {
    account: address,
    amount: uint256,
})
export type _burnFromParams = FunctionArguments<typeof _burnFrom>
export type _burnFromReturn = FunctionReturn<typeof _burnFrom>

/** _approve(address,address,uint256) */
export const _approve = func('0x104e81ff', {
    owner: address,
    spender: address,
    amount: uint256,
})
export type _approveParams = FunctionArguments<typeof _approve>
export type _approveReturn = FunctionReturn<typeof _approve>
