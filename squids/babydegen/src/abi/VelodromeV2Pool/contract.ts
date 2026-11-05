import { ContractBase } from '../abi.support.js'
import { balanceOf, getReserves, stable, token0, token1, totalSupply } from './functions.js'
import type { BalanceOfParams } from './functions.js'

export class Contract extends ContractBase {
    token0() {
        return this.eth_call(token0, {})
    }

    token1() {
        return this.eth_call(token1, {})
    }

    stable() {
        return this.eth_call(stable, {})
    }

    getReserves() {
        return this.eth_call(getReserves, {})
    }

    totalSupply() {
        return this.eth_call(totalSupply, {})
    }

    balanceOf(account: BalanceOfParams["account"]) {
        return this.eth_call(balanceOf, {account})
    }
}
