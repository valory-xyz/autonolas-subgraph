import { ContractBase } from '../abi.support.js'
import { balanceOf, earned } from './functions.js'
import type { BalanceOfParams, EarnedParams } from './functions.js'

export class Contract extends ContractBase {
    balanceOf(account: BalanceOfParams["account"]) {
        return this.eth_call(balanceOf, {account})
    }

    earned(account: EarnedParams["account"]) {
        return this.eth_call(earned, {account})
    }
}
