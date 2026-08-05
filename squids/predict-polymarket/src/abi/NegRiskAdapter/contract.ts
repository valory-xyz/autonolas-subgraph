import { ContractBase } from '../abi.support.js'
import { FEE_DENOMINATOR, NO_TOKEN_BURN_ADDRESS, admins, balanceOf, balanceOfBatch, col, ctf, getConditionId, getDetermined, getFeeBips, getMarketData, getOracle, getPositionId, getQuestionCount, getResult, isAdmin, onERC1155BatchReceived, onERC1155Received, prepareMarket, prepareQuestion, vault, wcol } from './functions.js'
import type { AdminsParams, BalanceOfBatchParams, BalanceOfParams, GetConditionIdParams, GetDeterminedParams, GetFeeBipsParams, GetMarketDataParams, GetOracleParams, GetPositionIdParams, GetQuestionCountParams, GetResultParams, IsAdminParams, OnERC1155BatchReceivedParams, OnERC1155ReceivedParams, PrepareMarketParams, PrepareQuestionParams } from './functions.js'

export class Contract extends ContractBase {
    FEE_DENOMINATOR() {
        return this.eth_call(FEE_DENOMINATOR, {})
    }

    NO_TOKEN_BURN_ADDRESS() {
        return this.eth_call(NO_TOKEN_BURN_ADDRESS, {})
    }

    admins(_0: AdminsParams["_0"]) {
        return this.eth_call(admins, {_0})
    }

    balanceOf(_owner: BalanceOfParams["_owner"], _id: BalanceOfParams["_id"]) {
        return this.eth_call(balanceOf, {_owner, _id})
    }

    balanceOfBatch(_owners: BalanceOfBatchParams["_owners"], _ids: BalanceOfBatchParams["_ids"]) {
        return this.eth_call(balanceOfBatch, {_owners, _ids})
    }

    col() {
        return this.eth_call(col, {})
    }

    ctf() {
        return this.eth_call(ctf, {})
    }

    getConditionId(_questionId: GetConditionIdParams["_questionId"]) {
        return this.eth_call(getConditionId, {_questionId})
    }

    getDetermined(_marketId: GetDeterminedParams["_marketId"]) {
        return this.eth_call(getDetermined, {_marketId})
    }

    getFeeBips(_marketId: GetFeeBipsParams["_marketId"]) {
        return this.eth_call(getFeeBips, {_marketId})
    }

    getMarketData(_marketId: GetMarketDataParams["_marketId"]) {
        return this.eth_call(getMarketData, {_marketId})
    }

    getOracle(_marketId: GetOracleParams["_marketId"]) {
        return this.eth_call(getOracle, {_marketId})
    }

    getPositionId(_questionId: GetPositionIdParams["_questionId"], _outcome: GetPositionIdParams["_outcome"]) {
        return this.eth_call(getPositionId, {_questionId, _outcome})
    }

    getQuestionCount(_marketId: GetQuestionCountParams["_marketId"]) {
        return this.eth_call(getQuestionCount, {_marketId})
    }

    getResult(_marketId: GetResultParams["_marketId"]) {
        return this.eth_call(getResult, {_marketId})
    }

    isAdmin(addr: IsAdminParams["addr"]) {
        return this.eth_call(isAdmin, {addr})
    }

    onERC1155BatchReceived(_0: OnERC1155BatchReceivedParams["_0"], _1: OnERC1155BatchReceivedParams["_1"], _2: OnERC1155BatchReceivedParams["_2"], _3: OnERC1155BatchReceivedParams["_3"], _4: OnERC1155BatchReceivedParams["_4"]) {
        return this.eth_call(onERC1155BatchReceived, {_0, _1, _2, _3, _4})
    }

    onERC1155Received(_0: OnERC1155ReceivedParams["_0"], _1: OnERC1155ReceivedParams["_1"], _2: OnERC1155ReceivedParams["_2"], _3: OnERC1155ReceivedParams["_3"], _4: OnERC1155ReceivedParams["_4"]) {
        return this.eth_call(onERC1155Received, {_0, _1, _2, _3, _4})
    }

    prepareMarket(_feeBips: PrepareMarketParams["_feeBips"], _metadata: PrepareMarketParams["_metadata"]) {
        return this.eth_call(prepareMarket, {_feeBips, _metadata})
    }

    prepareQuestion(_marketId: PrepareQuestionParams["_marketId"], _metadata: PrepareQuestionParams["_metadata"]) {
        return this.eth_call(prepareQuestion, {_marketId, _metadata})
    }

    vault() {
        return this.eth_call(vault, {})
    }

    wcol() {
        return this.eth_call(wcol, {})
    }
}
