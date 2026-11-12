import { ContractBase } from '../abi.support.js'
import { earned, earned_1, stakedContains } from './functions.js'
import type { EarnedParams, EarnedParams_1, StakedContainsParams } from './functions.js'

export class Contract extends ContractBase {
    stakedContains(depositor: StakedContainsParams["depositor"], tokenId: StakedContainsParams["tokenId"]) {
        return this.eth_call(stakedContains, {depositor, tokenId})
    }

    earned(_account: EarnedParams["_account"]) {
        return this.eth_call(earned, {_account})
    }

    earned_1(_account: EarnedParams_1["_account"], _tokenIds: EarnedParams_1["_tokenIds"]) {
        return this.eth_call(earned_1, {_account, _tokenIds})
    }
}
