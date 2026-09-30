import { ContractBase } from '../abi.support.js'
import { DOMAIN_SEPARATOR, allowance, approve, balanceOf, decimals, decreaseAllowance, increaseAllowance, inflationControl, inflationRemainder, maxMintCapFraction, minter, name, nonces, oneYear, owner, symbol, tenYearSupplyCap, timeLaunch, totalSupply, transfer, transferFrom } from './functions.js'
import type { AllowanceParams, ApproveParams, BalanceOfParams, DecreaseAllowanceParams, IncreaseAllowanceParams, InflationControlParams, NoncesParams, TransferFromParams, TransferParams } from './functions.js'

export class Contract extends ContractBase {
    DOMAIN_SEPARATOR() {
        return this.eth_call(DOMAIN_SEPARATOR, {})
    }

    allowance(_0: AllowanceParams["_0"], _1: AllowanceParams["_1"]) {
        return this.eth_call(allowance, {_0, _1})
    }

    approve(spender: ApproveParams["spender"], amount: ApproveParams["amount"]) {
        return this.eth_call(approve, {spender, amount})
    }

    balanceOf(_0: BalanceOfParams["_0"]) {
        return this.eth_call(balanceOf, {_0})
    }

    decimals() {
        return this.eth_call(decimals, {})
    }

    decreaseAllowance(spender: DecreaseAllowanceParams["spender"], amount: DecreaseAllowanceParams["amount"]) {
        return this.eth_call(decreaseAllowance, {spender, amount})
    }

    increaseAllowance(spender: IncreaseAllowanceParams["spender"], amount: IncreaseAllowanceParams["amount"]) {
        return this.eth_call(increaseAllowance, {spender, amount})
    }

    inflationControl(amount: InflationControlParams["amount"]) {
        return this.eth_call(inflationControl, {amount})
    }

    inflationRemainder() {
        return this.eth_call(inflationRemainder, {})
    }

    maxMintCapFraction() {
        return this.eth_call(maxMintCapFraction, {})
    }

    minter() {
        return this.eth_call(minter, {})
    }

    name() {
        return this.eth_call(name, {})
    }

    nonces(_0: NoncesParams["_0"]) {
        return this.eth_call(nonces, {_0})
    }

    oneYear() {
        return this.eth_call(oneYear, {})
    }

    owner() {
        return this.eth_call(owner, {})
    }

    symbol() {
        return this.eth_call(symbol, {})
    }

    tenYearSupplyCap() {
        return this.eth_call(tenYearSupplyCap, {})
    }

    timeLaunch() {
        return this.eth_call(timeLaunch, {})
    }

    totalSupply() {
        return this.eth_call(totalSupply, {})
    }

    transfer(to: TransferParams["to"], amount: TransferParams["amount"]) {
        return this.eth_call(transfer, {to, amount})
    }

    transferFrom(from: TransferFromParams["from"], to: TransferFromParams["to"], amount: TransferFromParams["amount"]) {
        return this.eth_call(transferFrom, {from, to, amount})
    }
}
