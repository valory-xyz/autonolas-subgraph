import { ContractBase } from '../abi.support.js'
import { balanceOf, balanceOfBatch, getCollectionId, getConditionId, getOutcomeSlotCount, getPositionId, isApprovedForAll, payoutDenominator, payoutNumerators, supportsInterface } from './functions.js'
import type { BalanceOfBatchParams, BalanceOfParams, GetCollectionIdParams, GetConditionIdParams, GetOutcomeSlotCountParams, GetPositionIdParams, IsApprovedForAllParams, PayoutDenominatorParams, PayoutNumeratorsParams, SupportsInterfaceParams } from './functions.js'

export class Contract extends ContractBase {
    balanceOf(owner: BalanceOfParams["owner"], id: BalanceOfParams["id"]) {
        return this.eth_call(balanceOf, {owner, id})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(supportsInterface, {interfaceId})
    }

    payoutNumerators(_0: PayoutNumeratorsParams["_0"], _1: PayoutNumeratorsParams["_1"]) {
        return this.eth_call(payoutNumerators, {_0, _1})
    }

    getPositionId(collateralToken: GetPositionIdParams["collateralToken"], collectionId: GetPositionIdParams["collectionId"]) {
        return this.eth_call(getPositionId, {collateralToken, collectionId})
    }

    balanceOfBatch(owners: BalanceOfBatchParams["owners"], ids: BalanceOfBatchParams["ids"]) {
        return this.eth_call(balanceOfBatch, {owners, ids})
    }

    getConditionId(oracle: GetConditionIdParams["oracle"], questionId: GetConditionIdParams["questionId"], outcomeSlotCount: GetConditionIdParams["outcomeSlotCount"]) {
        return this.eth_call(getConditionId, {oracle, questionId, outcomeSlotCount})
    }

    getCollectionId(parentCollectionId: GetCollectionIdParams["parentCollectionId"], conditionId: GetCollectionIdParams["conditionId"], indexSet: GetCollectionIdParams["indexSet"]) {
        return this.eth_call(getCollectionId, {parentCollectionId, conditionId, indexSet})
    }

    getOutcomeSlotCount(conditionId: GetOutcomeSlotCountParams["conditionId"]) {
        return this.eth_call(getOutcomeSlotCount, {conditionId})
    }

    payoutDenominator(_0: PayoutDenominatorParams["_0"]) {
        return this.eth_call(payoutDenominator, {_0})
    }

    isApprovedForAll(owner: IsApprovedForAllParams["owner"], operator: IsApprovedForAllParams["operator"]) {
        return this.eth_call(isApprovedForAll, {owner, operator})
    }
}
