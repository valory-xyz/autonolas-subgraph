import { ContractBase } from '../abi.support.js'
import { DOMAIN_SEPARATOR, MINIMUM_LIQUIDITY, PERMIT_TYPEHASH, allowance, approve, balanceOf, burn, decimals, factory, getReserves, kLast, mint, name, nonces, price0CumulativeLast, price1CumulativeLast, symbol, token0, token1, totalSupply, transfer, transferFrom } from './functions.js'
import type { AllowanceParams, ApproveParams, BalanceOfParams, BurnParams, MintParams, NoncesParams, TransferFromParams, TransferParams } from './functions.js'

export class Contract extends ContractBase {
    DOMAIN_SEPARATOR() {
        return this.eth_call(DOMAIN_SEPARATOR, {})
    }

    MINIMUM_LIQUIDITY() {
        return this.eth_call(MINIMUM_LIQUIDITY, {})
    }

    PERMIT_TYPEHASH() {
        return this.eth_call(PERMIT_TYPEHASH, {})
    }

    allowance(_0: AllowanceParams["_0"], _1: AllowanceParams["_1"]) {
        return this.eth_call(allowance, {_0, _1})
    }

    approve(spender: ApproveParams["spender"], value: ApproveParams["value"]) {
        return this.eth_call(approve, {spender, value})
    }

    balanceOf(_0: BalanceOfParams["_0"]) {
        return this.eth_call(balanceOf, {_0})
    }

    burn(to: BurnParams["to"]) {
        return this.eth_call(burn, {to})
    }

    decimals() {
        return this.eth_call(decimals, {})
    }

    factory() {
        return this.eth_call(factory, {})
    }

    getReserves() {
        return this.eth_call(getReserves, {})
    }

    kLast() {
        return this.eth_call(kLast, {})
    }

    mint(to: MintParams["to"]) {
        return this.eth_call(mint, {to})
    }

    name() {
        return this.eth_call(name, {})
    }

    nonces(_0: NoncesParams["_0"]) {
        return this.eth_call(nonces, {_0})
    }

    price0CumulativeLast() {
        return this.eth_call(price0CumulativeLast, {})
    }

    price1CumulativeLast() {
        return this.eth_call(price1CumulativeLast, {})
    }

    symbol() {
        return this.eth_call(symbol, {})
    }

    token0() {
        return this.eth_call(token0, {})
    }

    token1() {
        return this.eth_call(token1, {})
    }

    totalSupply() {
        return this.eth_call(totalSupply, {})
    }

    transfer(to: TransferParams["to"], value: TransferParams["value"]) {
        return this.eth_call(transfer, {to, value})
    }

    transferFrom(from: TransferFromParams["from"], to: TransferFromParams["to"], value: TransferFromParams["value"]) {
        return this.eth_call(transferFrom, {from, to, value})
    }
}
