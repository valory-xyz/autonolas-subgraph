import { ContractBase } from '../abi.support.js'
import { PAYMENT_TYPE, VERSION, deliverToMarketplace, entryPoint, exec, getOperator, getUndeliveredRequestIds, isOperator, isValidSignature, mapRequestIds, maxDeliveryRate, mechMarketplace, nonce, numTotalDeliveries, numTotalRequests, numUndeliveredRequests, onERC1155BatchReceived, onERC1155Received, onERC721Received, paymentType, serviceId, serviceRegistry, token, tokenId, validateUserOp } from './functions.js'
import type { DeliverToMarketplaceParams, ExecParams, GetUndeliveredRequestIdsParams, IsOperatorParams, IsValidSignatureParams, MapRequestIdsParams, OnERC1155BatchReceivedParams, OnERC1155ReceivedParams, OnERC721ReceivedParams, ValidateUserOpParams } from './functions.js'

export class Contract extends ContractBase {
    PAYMENT_TYPE() {
        return this.eth_call(PAYMENT_TYPE, {})
    }

    VERSION() {
        return this.eth_call(VERSION, {})
    }

    deliverToMarketplace(requestIds: DeliverToMarketplaceParams["requestIds"], datas: DeliverToMarketplaceParams["datas"]) {
        return this.eth_call(deliverToMarketplace, {requestIds, datas})
    }

    entryPoint() {
        return this.eth_call(entryPoint, {})
    }

    exec(to: ExecParams["to"], value: ExecParams["value"], data: ExecParams["data"], operation: ExecParams["operation"], txGas: ExecParams["txGas"]) {
        return this.eth_call(exec, {to, value, data, operation, txGas})
    }

    getOperator() {
        return this.eth_call(getOperator, {})
    }

    getUndeliveredRequestIds(size: GetUndeliveredRequestIdsParams["size"], offset: GetUndeliveredRequestIdsParams["offset"]) {
        return this.eth_call(getUndeliveredRequestIds, {size, offset})
    }

    isOperator(multisig: IsOperatorParams["multisig"]) {
        return this.eth_call(isOperator, {multisig})
    }

    isValidSignature(hash: IsValidSignatureParams["hash"], signature: IsValidSignatureParams["signature"]) {
        return this.eth_call(isValidSignature, {hash, signature})
    }

    mapRequestIds(_0: MapRequestIdsParams["_0"], _1: MapRequestIdsParams["_1"]) {
        return this.eth_call(mapRequestIds, {_0, _1})
    }

    maxDeliveryRate() {
        return this.eth_call(maxDeliveryRate, {})
    }

    mechMarketplace() {
        return this.eth_call(mechMarketplace, {})
    }

    nonce() {
        return this.eth_call(nonce, {})
    }

    numTotalDeliveries() {
        return this.eth_call(numTotalDeliveries, {})
    }

    numTotalRequests() {
        return this.eth_call(numTotalRequests, {})
    }

    numUndeliveredRequests() {
        return this.eth_call(numUndeliveredRequests, {})
    }

    onERC1155BatchReceived(_0: OnERC1155BatchReceivedParams["_0"], _1: OnERC1155BatchReceivedParams["_1"], _2: OnERC1155BatchReceivedParams["_2"], _3: OnERC1155BatchReceivedParams["_3"], _4: OnERC1155BatchReceivedParams["_4"]) {
        return this.eth_call(onERC1155BatchReceived, {_0, _1, _2, _3, _4})
    }

    onERC1155Received(_0: OnERC1155ReceivedParams["_0"], _1: OnERC1155ReceivedParams["_1"], _2: OnERC1155ReceivedParams["_2"], _3: OnERC1155ReceivedParams["_3"], _4: OnERC1155ReceivedParams["_4"]) {
        return this.eth_call(onERC1155Received, {_0, _1, _2, _3, _4})
    }

    onERC721Received(_0: OnERC721ReceivedParams["_0"], _1: OnERC721ReceivedParams["_1"], _2: OnERC721ReceivedParams["_2"], _3: OnERC721ReceivedParams["_3"]) {
        return this.eth_call(onERC721Received, {_0, _1, _2, _3})
    }

    paymentType() {
        return this.eth_call(paymentType, {})
    }

    serviceId() {
        return this.eth_call(serviceId, {})
    }

    serviceRegistry() {
        return this.eth_call(serviceRegistry, {})
    }

    token() {
        return this.eth_call(token, {})
    }

    tokenId() {
        return this.eth_call(tokenId, {})
    }

    validateUserOp(userOp: ValidateUserOpParams["userOp"], userOpHash: ValidateUserOpParams["userOpHash"], missingAccountFunds: ValidateUserOpParams["missingAccountFunds"]) {
        return this.eth_call(validateUserOp, {userOp, userOpHash, missingAccountFunds})
    }
}
