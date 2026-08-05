import { ContractBase } from '../abi.support.js'
import { PARENT_COLLECTION_ID, eip712Domain, getCollateral, getCtf, getCtfCollateral, getFeeReceiver, getMaxFeeRate, getOrderStatus, getOutcomeTokenFactory, getProxyFactory, getProxyImplementation, getProxyWalletAddress, getSafeFactory, getSafeImplementation, getSafeWalletAddress, hashOrder, isAdmin, isOperator, isUserPaused, onERC1155BatchReceived, onERC1155Received, orderStatus, paused, supportsInterface, userPauseBlockInterval, userPausedBlockAt } from './functions.js'
import type { GetOrderStatusParams, GetProxyWalletAddressParams, GetSafeWalletAddressParams, HashOrderParams, IsAdminParams, IsOperatorParams, IsUserPausedParams, OnERC1155BatchReceivedParams, OnERC1155ReceivedParams, OrderStatusParams, SupportsInterfaceParams, UserPausedBlockAtParams } from './functions.js'

export class Contract extends ContractBase {
    PARENT_COLLECTION_ID() {
        return this.eth_call(PARENT_COLLECTION_ID, {})
    }

    eip712Domain() {
        return this.eth_call(eip712Domain, {})
    }

    getCollateral() {
        return this.eth_call(getCollateral, {})
    }

    getCtf() {
        return this.eth_call(getCtf, {})
    }

    getCtfCollateral() {
        return this.eth_call(getCtfCollateral, {})
    }

    getFeeReceiver() {
        return this.eth_call(getFeeReceiver, {})
    }

    getMaxFeeRate() {
        return this.eth_call(getMaxFeeRate, {})
    }

    getOrderStatus(orderHash: GetOrderStatusParams["orderHash"]) {
        return this.eth_call(getOrderStatus, {orderHash})
    }

    getOutcomeTokenFactory() {
        return this.eth_call(getOutcomeTokenFactory, {})
    }

    getProxyFactory() {
        return this.eth_call(getProxyFactory, {})
    }

    getProxyImplementation() {
        return this.eth_call(getProxyImplementation, {})
    }

    getProxyWalletAddress(_addr: GetProxyWalletAddressParams["_addr"]) {
        return this.eth_call(getProxyWalletAddress, {_addr})
    }

    getSafeFactory() {
        return this.eth_call(getSafeFactory, {})
    }

    getSafeImplementation() {
        return this.eth_call(getSafeImplementation, {})
    }

    getSafeWalletAddress(_addr: GetSafeWalletAddressParams["_addr"]) {
        return this.eth_call(getSafeWalletAddress, {_addr})
    }

    hashOrder(order: HashOrderParams["order"]) {
        return this.eth_call(hashOrder, {order})
    }

    isAdmin(_usr: IsAdminParams["_usr"]) {
        return this.eth_call(isAdmin, {_usr})
    }

    isOperator(_usr: IsOperatorParams["_usr"]) {
        return this.eth_call(isOperator, {_usr})
    }

    isUserPaused(user: IsUserPausedParams["user"]) {
        return this.eth_call(isUserPaused, {user})
    }

    onERC1155BatchReceived(_0: OnERC1155BatchReceivedParams["_0"], _1: OnERC1155BatchReceivedParams["_1"], _2: OnERC1155BatchReceivedParams["_2"], _3: OnERC1155BatchReceivedParams["_3"], _4: OnERC1155BatchReceivedParams["_4"]) {
        return this.eth_call(onERC1155BatchReceived, {_0, _1, _2, _3, _4})
    }

    onERC1155Received(_0: OnERC1155ReceivedParams["_0"], _1: OnERC1155ReceivedParams["_1"], _2: OnERC1155ReceivedParams["_2"], _3: OnERC1155ReceivedParams["_3"], _4: OnERC1155ReceivedParams["_4"]) {
        return this.eth_call(onERC1155Received, {_0, _1, _2, _3, _4})
    }

    orderStatus(_0: OrderStatusParams["_0"]) {
        return this.eth_call(orderStatus, {_0})
    }

    paused() {
        return this.eth_call(paused, {})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(supportsInterface, {interfaceId})
    }

    userPauseBlockInterval() {
        return this.eth_call(userPauseBlockInterval, {})
    }

    userPausedBlockAt(_0: UserPausedBlockAtParams["_0"]) {
        return this.eth_call(userPausedBlockAt, {_0})
    }
}
