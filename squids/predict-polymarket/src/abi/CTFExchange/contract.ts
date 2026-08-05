import { ContractBase } from '../abi.support.js'
import { admins, domainSeparator, getCollateral, getComplement, getConditionId, getCtf, getMaxFeeRate, getOrderStatus, getPolyProxyFactoryImplementation, getPolyProxyWalletAddress, getProxyFactory, getSafeAddress, getSafeFactory, getSafeFactoryImplementation, hashOrder, isAdmin, isOperator, isValidNonce, nonces, onERC1155BatchReceived, onERC1155Received, operators, orderStatus, parentCollectionId, paused, proxyFactory, registry, safeFactory, supportsInterface } from './functions.js'
import type { AdminsParams, GetComplementParams, GetConditionIdParams, GetOrderStatusParams, GetPolyProxyWalletAddressParams, GetSafeAddressParams, HashOrderParams, IsAdminParams, IsOperatorParams, IsValidNonceParams, NoncesParams, OnERC1155BatchReceivedParams, OnERC1155ReceivedParams, OperatorsParams, OrderStatusParams, RegistryParams, SupportsInterfaceParams } from './functions.js'

export class Contract extends ContractBase {
    admins(_0: AdminsParams["_0"]) {
        return this.eth_call(admins, {_0})
    }

    domainSeparator() {
        return this.eth_call(domainSeparator, {})
    }

    getCollateral() {
        return this.eth_call(getCollateral, {})
    }

    getComplement(token: GetComplementParams["token"]) {
        return this.eth_call(getComplement, {token})
    }

    getConditionId(token: GetConditionIdParams["token"]) {
        return this.eth_call(getConditionId, {token})
    }

    getCtf() {
        return this.eth_call(getCtf, {})
    }

    getMaxFeeRate() {
        return this.eth_call(getMaxFeeRate, {})
    }

    getOrderStatus(orderHash: GetOrderStatusParams["orderHash"]) {
        return this.eth_call(getOrderStatus, {orderHash})
    }

    getPolyProxyFactoryImplementation() {
        return this.eth_call(getPolyProxyFactoryImplementation, {})
    }

    getPolyProxyWalletAddress(_addr: GetPolyProxyWalletAddressParams["_addr"]) {
        return this.eth_call(getPolyProxyWalletAddress, {_addr})
    }

    getProxyFactory() {
        return this.eth_call(getProxyFactory, {})
    }

    getSafeAddress(_addr: GetSafeAddressParams["_addr"]) {
        return this.eth_call(getSafeAddress, {_addr})
    }

    getSafeFactory() {
        return this.eth_call(getSafeFactory, {})
    }

    getSafeFactoryImplementation() {
        return this.eth_call(getSafeFactoryImplementation, {})
    }

    hashOrder(order: HashOrderParams["order"]) {
        return this.eth_call(hashOrder, {order})
    }

    isAdmin(usr: IsAdminParams["usr"]) {
        return this.eth_call(isAdmin, {usr})
    }

    isOperator(usr: IsOperatorParams["usr"]) {
        return this.eth_call(isOperator, {usr})
    }

    isValidNonce(usr: IsValidNonceParams["usr"], nonce: IsValidNonceParams["nonce"]) {
        return this.eth_call(isValidNonce, {usr, nonce})
    }

    nonces(_0: NoncesParams["_0"]) {
        return this.eth_call(nonces, {_0})
    }

    onERC1155BatchReceived(_0: OnERC1155BatchReceivedParams["_0"], _1: OnERC1155BatchReceivedParams["_1"], _2: OnERC1155BatchReceivedParams["_2"], _3: OnERC1155BatchReceivedParams["_3"], _4: OnERC1155BatchReceivedParams["_4"]) {
        return this.eth_call(onERC1155BatchReceived, {_0, _1, _2, _3, _4})
    }

    onERC1155Received(_0: OnERC1155ReceivedParams["_0"], _1: OnERC1155ReceivedParams["_1"], _2: OnERC1155ReceivedParams["_2"], _3: OnERC1155ReceivedParams["_3"], _4: OnERC1155ReceivedParams["_4"]) {
        return this.eth_call(onERC1155Received, {_0, _1, _2, _3, _4})
    }

    operators(_0: OperatorsParams["_0"]) {
        return this.eth_call(operators, {_0})
    }

    orderStatus(_0: OrderStatusParams["_0"]) {
        return this.eth_call(orderStatus, {_0})
    }

    parentCollectionId() {
        return this.eth_call(parentCollectionId, {})
    }

    paused() {
        return this.eth_call(paused, {})
    }

    proxyFactory() {
        return this.eth_call(proxyFactory, {})
    }

    registry(_0: RegistryParams["_0"]) {
        return this.eth_call(registry, {_0})
    }

    safeFactory() {
        return this.eth_call(safeFactory, {})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(supportsInterface, {interfaceId})
    }
}
