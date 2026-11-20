import { ContractBase } from '../abi.support.js'
import { earned } from './functions.js'
import type { EarnedParams } from './functions.js'

export class Contract extends ContractBase {
    earned(account: EarnedParams["account"], tokenId: EarnedParams["tokenId"]) {
        return this.eth_call(earned, {account, tokenId})
    }
}
