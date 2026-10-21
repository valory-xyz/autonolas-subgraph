import { ContractBase } from '../abi.support.js'
import { COLLATERAL_TOKEN, balanceOf, balanceOfBatch, balanceOf_1, crossModuleAuth, getPayout, hasAllRoles, hasAnyRole, isApprovedForAll, moduleById, owner, ownershipHandoverExpiresAt, proxiableUUID, rolesOf, supportsInterface, uri } from './functions.js'
import type { BalanceOfBatchParams, BalanceOfParams, BalanceOfParams_1, CrossModuleAuthParams, GetPayoutParams, HasAllRolesParams, HasAnyRoleParams, IsApprovedForAllParams, ModuleByIdParams, OwnershipHandoverExpiresAtParams, RolesOfParams, SupportsInterfaceParams, UriParams } from './functions.js'

export class Contract extends ContractBase {
    COLLATERAL_TOKEN() {
        return this.eth_call(COLLATERAL_TOKEN, {})
    }

    balanceOf(owner: BalanceOfParams["owner"], id: BalanceOfParams["id"]) {
        return this.eth_call(balanceOf, {owner, id})
    }

    balanceOf_1(_owner: BalanceOfParams_1["_owner"], _conditionId: BalanceOfParams_1["_conditionId"], _outcomeIndex: BalanceOfParams_1["_outcomeIndex"]) {
        return this.eth_call(balanceOf_1, {_owner, _conditionId, _outcomeIndex})
    }

    balanceOfBatch(owners: BalanceOfBatchParams["owners"], ids: BalanceOfBatchParams["ids"]) {
        return this.eth_call(balanceOfBatch, {owners, ids})
    }

    crossModuleAuth(_0: CrossModuleAuthParams["_0"]) {
        return this.eth_call(crossModuleAuth, {_0})
    }

    getPayout(_positionId: GetPayoutParams["_positionId"], _amount: GetPayoutParams["_amount"]) {
        return this.eth_call(getPayout, {_positionId, _amount})
    }

    hasAllRoles(user: HasAllRolesParams["user"], roles: HasAllRolesParams["roles"]) {
        return this.eth_call(hasAllRoles, {user, roles})
    }

    hasAnyRole(user: HasAnyRoleParams["user"], roles: HasAnyRoleParams["roles"]) {
        return this.eth_call(hasAnyRole, {user, roles})
    }

    isApprovedForAll(owner: IsApprovedForAllParams["owner"], operator: IsApprovedForAllParams["operator"]) {
        return this.eth_call(isApprovedForAll, {owner, operator})
    }

    moduleById(_0: ModuleByIdParams["_0"]) {
        return this.eth_call(moduleById, {_0})
    }

    owner() {
        return this.eth_call(owner, {})
    }

    ownershipHandoverExpiresAt(pendingOwner: OwnershipHandoverExpiresAtParams["pendingOwner"]) {
        return this.eth_call(ownershipHandoverExpiresAt, {pendingOwner})
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

    uri(_positionId: UriParams["_positionId"]) {
        return this.eth_call(uri, {_positionId})
    }
}
