import { ContractBase } from '../abi.support.js'
import { DOMAIN_SEPARATOR_TYPE_HASH, MAX_FEE_FACTOR, MECH_MARKETPLACE_PROXY, VERSION, chainId, checkMech, create, deliverMarketplace, domainSeparator, fee, getDomainSeparator, getRequestId, getRequestStatus, karma, mapAgentMechFactories, mapDeliveryCounts, mapMechDeliveryCounts, mapMechFactories, mapMechServiceDeliveryCounts, mapNonces, mapPaymentTypeBalanceTrackers, mapRequestCounts, mapRequestIdInfos, maxResponseTimeout, minResponseTimeout, numMechs, numTotalRequests, numUndeliveredRequests, owner, request, requestBatch, serviceRegistry } from './functions.js'
import type { CheckMechParams, CreateParams, DeliverMarketplaceParams, GetRequestIdParams, GetRequestStatusParams, MapAgentMechFactoriesParams, MapDeliveryCountsParams, MapMechDeliveryCountsParams, MapMechFactoriesParams, MapMechServiceDeliveryCountsParams, MapNoncesParams, MapPaymentTypeBalanceTrackersParams, MapRequestCountsParams, MapRequestIdInfosParams, RequestBatchParams, RequestParams } from './functions.js'

export class Contract extends ContractBase {
    DOMAIN_SEPARATOR_TYPE_HASH() {
        return this.eth_call(DOMAIN_SEPARATOR_TYPE_HASH, {})
    }

    MAX_FEE_FACTOR() {
        return this.eth_call(MAX_FEE_FACTOR, {})
    }

    MECH_MARKETPLACE_PROXY() {
        return this.eth_call(MECH_MARKETPLACE_PROXY, {})
    }

    VERSION() {
        return this.eth_call(VERSION, {})
    }

    chainId() {
        return this.eth_call(chainId, {})
    }

    checkMech(mech: CheckMechParams["mech"]) {
        return this.eth_call(checkMech, {mech})
    }

    create(serviceId: CreateParams["serviceId"], mechFactory: CreateParams["mechFactory"], payload: CreateParams["payload"]) {
        return this.eth_call(create, {serviceId, mechFactory, payload})
    }

    deliverMarketplace(requestIds: DeliverMarketplaceParams["requestIds"], deliveryRates: DeliverMarketplaceParams["deliveryRates"]) {
        return this.eth_call(deliverMarketplace, {requestIds, deliveryRates})
    }

    domainSeparator() {
        return this.eth_call(domainSeparator, {})
    }

    fee() {
        return this.eth_call(fee, {})
    }

    getDomainSeparator() {
        return this.eth_call(getDomainSeparator, {})
    }

    getRequestId(mech: GetRequestIdParams["mech"], requester: GetRequestIdParams["requester"], data: GetRequestIdParams["data"], deliveryRate: GetRequestIdParams["deliveryRate"], paymentType: GetRequestIdParams["paymentType"], nonce: GetRequestIdParams["nonce"]) {
        return this.eth_call(getRequestId, {mech, requester, data, deliveryRate, paymentType, nonce})
    }

    getRequestStatus(requestId: GetRequestStatusParams["requestId"]) {
        return this.eth_call(getRequestStatus, {requestId})
    }

    karma() {
        return this.eth_call(karma, {})
    }

    mapAgentMechFactories(_0: MapAgentMechFactoriesParams["_0"]) {
        return this.eth_call(mapAgentMechFactories, {_0})
    }

    mapDeliveryCounts(_0: MapDeliveryCountsParams["_0"]) {
        return this.eth_call(mapDeliveryCounts, {_0})
    }

    mapMechDeliveryCounts(_0: MapMechDeliveryCountsParams["_0"]) {
        return this.eth_call(mapMechDeliveryCounts, {_0})
    }

    mapMechFactories(_0: MapMechFactoriesParams["_0"]) {
        return this.eth_call(mapMechFactories, {_0})
    }

    mapMechServiceDeliveryCounts(_0: MapMechServiceDeliveryCountsParams["_0"]) {
        return this.eth_call(mapMechServiceDeliveryCounts, {_0})
    }

    mapNonces(_0: MapNoncesParams["_0"]) {
        return this.eth_call(mapNonces, {_0})
    }

    mapPaymentTypeBalanceTrackers(_0: MapPaymentTypeBalanceTrackersParams["_0"]) {
        return this.eth_call(mapPaymentTypeBalanceTrackers, {_0})
    }

    mapRequestCounts(_0: MapRequestCountsParams["_0"]) {
        return this.eth_call(mapRequestCounts, {_0})
    }

    mapRequestIdInfos(_0: MapRequestIdInfosParams["_0"]) {
        return this.eth_call(mapRequestIdInfos, {_0})
    }

    maxResponseTimeout() {
        return this.eth_call(maxResponseTimeout, {})
    }

    minResponseTimeout() {
        return this.eth_call(minResponseTimeout, {})
    }

    numMechs() {
        return this.eth_call(numMechs, {})
    }

    numTotalRequests() {
        return this.eth_call(numTotalRequests, {})
    }

    numUndeliveredRequests() {
        return this.eth_call(numUndeliveredRequests, {})
    }

    owner() {
        return this.eth_call(owner, {})
    }

    request(requestData: RequestParams["requestData"], maxDeliveryRate: RequestParams["maxDeliveryRate"], paymentType: RequestParams["paymentType"], priorityMech: RequestParams["priorityMech"], responseTimeout: RequestParams["responseTimeout"], paymentData: RequestParams["paymentData"]) {
        return this.eth_call(request, {requestData, maxDeliveryRate, paymentType, priorityMech, responseTimeout, paymentData})
    }

    requestBatch(requestDatas: RequestBatchParams["requestDatas"], maxDeliveryRate: RequestBatchParams["maxDeliveryRate"], paymentType: RequestBatchParams["paymentType"], priorityMech: RequestBatchParams["priorityMech"], responseTimeout: RequestBatchParams["responseTimeout"], paymentData: RequestBatchParams["paymentData"]) {
        return this.eth_call(requestBatch, {requestDatas, maxDeliveryRate, paymentType, priorityMech, responseTimeout, paymentData})
    }

    serviceRegistry() {
        return this.eth_call(serviceRegistry, {})
    }
}
