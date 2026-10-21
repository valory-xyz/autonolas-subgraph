import { ContractBase } from '../abi.support.js'
import { COLLATERAL_TOKEN, COMBINATORIAL_MODULE, FEE_RECEIVER, MAX_FEE_RATE, POSITION_MANAGER, domainSeparator, eip712Domain, getOrderStatus, getProxyWalletAddress, getSafeWalletAddress, hasAllRoles, hasAnyRole, hashOrder, isAdmin, isOperator, isUserPaused, onERC1155BatchReceived, onERC1155Received, orderStatus, owner, ownershipHandoverExpiresAt, paused, preapproved, proxiableUUID, rolesOf, supportsInterface, userPauseBlockInterval, userPausedBlockAt } from './functions.js'
import type { GetOrderStatusParams, GetProxyWalletAddressParams, GetSafeWalletAddressParams, HasAllRolesParams, HasAnyRoleParams, HashOrderParams, IsAdminParams, IsOperatorParams, IsUserPausedParams, OnERC1155BatchReceivedParams, OnERC1155ReceivedParams, OrderStatusParams, OwnershipHandoverExpiresAtParams, PreapprovedParams, RolesOfParams, SupportsInterfaceParams, UserPausedBlockAtParams } from './functions.js'

export class Contract extends ContractBase {
    COLLATERAL_TOKEN() {
        return this.eth_call(COLLATERAL_TOKEN, {})
    }

    COMBINATORIAL_MODULE() {
        return this.eth_call(COMBINATORIAL_MODULE, {})
    }

    FEE_RECEIVER() {
        return this.eth_call(FEE_RECEIVER, {})
    }

    MAX_FEE_RATE() {
        return this.eth_call(MAX_FEE_RATE, {})
    }

    POSITION_MANAGER() {
        return this.eth_call(POSITION_MANAGER, {})
    }

    domainSeparator() {
        return this.eth_call(domainSeparator, {})
    }

    eip712Domain() {
        return this.eth_call(eip712Domain, {})
    }

    getOrderStatus(orderHash: GetOrderStatusParams["orderHash"]) {
        return this.eth_call(getOrderStatus, {orderHash})
    }

    getProxyWalletAddress(_signer: GetProxyWalletAddressParams["_signer"]) {
        return this.eth_call(getProxyWalletAddress, {_signer})
    }

    getSafeWalletAddress(_signer: GetSafeWalletAddressParams["_signer"]) {
        return this.eth_call(getSafeWalletAddress, {_signer})
    }

    hasAllRoles(user: HasAllRolesParams["user"], roles: HasAllRolesParams["roles"]) {
        return this.eth_call(hasAllRoles, {user, roles})
    }

    hasAnyRole(user: HasAnyRoleParams["user"], roles: HasAnyRoleParams["roles"]) {
        return this.eth_call(hasAnyRole, {user, roles})
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

    isUserPaused(_user: IsUserPausedParams["_user"]) {
        return this.eth_call(isUserPaused, {_user})
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

    owner() {
        return this.eth_call(owner, {})
    }

    ownershipHandoverExpiresAt(pendingOwner: OwnershipHandoverExpiresAtParams["pendingOwner"]) {
        return this.eth_call(ownershipHandoverExpiresAt, {pendingOwner})
    }

    paused() {
        return this.eth_call(paused, {})
    }

    preapproved(_0: PreapprovedParams["_0"]) {
        return this.eth_call(preapproved, {_0})
    }

    proxiableUUID() {
        return this.eth_call(proxiableUUID, {})
    }

    rolesOf(user: RolesOfParams["user"]) {
        return this.eth_call(rolesOf, {user})
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
