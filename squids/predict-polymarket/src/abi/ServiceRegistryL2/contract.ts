import { ContractBase } from '../abi.support.js'
import { CID_PREFIX, VERSION, activateRegistration, balanceOf, baseURI, changeMultisigPermission, create, deploy, drain, drainer, exists, getAgentInstances, getAgentParams, getApproved, getInstancesForAgentId, getOperatorBalance, getPreviousHashes, getService, isApprovedForAll, manager, mapAgentInstanceOperators, mapConfigHashes, mapMultisigs, mapOperatorAndServiceIdAgentInstances, mapOperatorAndServiceIdOperatorBalances, mapServiceAndAgentIdAgentInstances, mapServiceAndAgentIdAgentParams, mapServices, name, owner, ownerOf, registerAgents, slash, slashedFunds, supportsInterface, symbol, terminate, tokenByIndex, tokenURI, totalSupply, unbond, update } from './functions.js'
import type { ActivateRegistrationParams, BalanceOfParams, ChangeMultisigPermissionParams, CreateParams, DeployParams, ExistsParams, GetAgentInstancesParams, GetAgentParamsParams, GetApprovedParams, GetInstancesForAgentIdParams, GetOperatorBalanceParams, GetPreviousHashesParams, GetServiceParams, IsApprovedForAllParams, MapAgentInstanceOperatorsParams, MapConfigHashesParams, MapMultisigsParams, MapOperatorAndServiceIdAgentInstancesParams, MapOperatorAndServiceIdOperatorBalancesParams, MapServiceAndAgentIdAgentInstancesParams, MapServiceAndAgentIdAgentParamsParams, MapServicesParams, OwnerOfParams, RegisterAgentsParams, SlashParams, SupportsInterfaceParams, TerminateParams, TokenByIndexParams, TokenURIParams, UnbondParams, UpdateParams } from './functions.js'

export class Contract extends ContractBase {
    CID_PREFIX() {
        return this.eth_call(CID_PREFIX, {})
    }

    VERSION() {
        return this.eth_call(VERSION, {})
    }

    activateRegistration(serviceOwner: ActivateRegistrationParams["serviceOwner"], serviceId: ActivateRegistrationParams["serviceId"]) {
        return this.eth_call(activateRegistration, {serviceOwner, serviceId})
    }

    balanceOf(owner: BalanceOfParams["owner"]) {
        return this.eth_call(balanceOf, {owner})
    }

    baseURI() {
        return this.eth_call(baseURI, {})
    }

    changeMultisigPermission(multisig: ChangeMultisigPermissionParams["multisig"], permission: ChangeMultisigPermissionParams["permission"]) {
        return this.eth_call(changeMultisigPermission, {multisig, permission})
    }

    create(serviceOwner: CreateParams["serviceOwner"], configHash: CreateParams["configHash"], agentIds: CreateParams["agentIds"], agentParams: CreateParams["agentParams"], threshold: CreateParams["threshold"]) {
        return this.eth_call(create, {serviceOwner, configHash, agentIds, agentParams, threshold})
    }

    deploy(serviceOwner: DeployParams["serviceOwner"], serviceId: DeployParams["serviceId"], multisigImplementation: DeployParams["multisigImplementation"], data: DeployParams["data"]) {
        return this.eth_call(deploy, {serviceOwner, serviceId, multisigImplementation, data})
    }

    drain() {
        return this.eth_call(drain, {})
    }

    drainer() {
        return this.eth_call(drainer, {})
    }

    exists(unitId: ExistsParams["unitId"]) {
        return this.eth_call(exists, {unitId})
    }

    getAgentInstances(serviceId: GetAgentInstancesParams["serviceId"]) {
        return this.eth_call(getAgentInstances, {serviceId})
    }

    getAgentParams(serviceId: GetAgentParamsParams["serviceId"]) {
        return this.eth_call(getAgentParams, {serviceId})
    }

    getApproved(_0: GetApprovedParams["_0"]) {
        return this.eth_call(getApproved, {_0})
    }

    getInstancesForAgentId(serviceId: GetInstancesForAgentIdParams["serviceId"], agentId: GetInstancesForAgentIdParams["agentId"]) {
        return this.eth_call(getInstancesForAgentId, {serviceId, agentId})
    }

    getOperatorBalance(operator: GetOperatorBalanceParams["operator"], serviceId: GetOperatorBalanceParams["serviceId"]) {
        return this.eth_call(getOperatorBalance, {operator, serviceId})
    }

    getPreviousHashes(serviceId: GetPreviousHashesParams["serviceId"]) {
        return this.eth_call(getPreviousHashes, {serviceId})
    }

    getService(serviceId: GetServiceParams["serviceId"]) {
        return this.eth_call(getService, {serviceId})
    }

    isApprovedForAll(_0: IsApprovedForAllParams["_0"], _1: IsApprovedForAllParams["_1"]) {
        return this.eth_call(isApprovedForAll, {_0, _1})
    }

    manager() {
        return this.eth_call(manager, {})
    }

    mapAgentInstanceOperators(_0: MapAgentInstanceOperatorsParams["_0"]) {
        return this.eth_call(mapAgentInstanceOperators, {_0})
    }

    mapConfigHashes(_0: MapConfigHashesParams["_0"], _1: MapConfigHashesParams["_1"]) {
        return this.eth_call(mapConfigHashes, {_0, _1})
    }

    mapMultisigs(_0: MapMultisigsParams["_0"]) {
        return this.eth_call(mapMultisigs, {_0})
    }

    mapOperatorAndServiceIdAgentInstances(_0: MapOperatorAndServiceIdAgentInstancesParams["_0"], _1: MapOperatorAndServiceIdAgentInstancesParams["_1"]) {
        return this.eth_call(mapOperatorAndServiceIdAgentInstances, {_0, _1})
    }

    mapOperatorAndServiceIdOperatorBalances(_0: MapOperatorAndServiceIdOperatorBalancesParams["_0"]) {
        return this.eth_call(mapOperatorAndServiceIdOperatorBalances, {_0})
    }

    mapServiceAndAgentIdAgentInstances(_0: MapServiceAndAgentIdAgentInstancesParams["_0"], _1: MapServiceAndAgentIdAgentInstancesParams["_1"]) {
        return this.eth_call(mapServiceAndAgentIdAgentInstances, {_0, _1})
    }

    mapServiceAndAgentIdAgentParams(_0: MapServiceAndAgentIdAgentParamsParams["_0"]) {
        return this.eth_call(mapServiceAndAgentIdAgentParams, {_0})
    }

    mapServices(_0: MapServicesParams["_0"]) {
        return this.eth_call(mapServices, {_0})
    }

    name() {
        return this.eth_call(name, {})
    }

    owner() {
        return this.eth_call(owner, {})
    }

    ownerOf(id: OwnerOfParams["id"]) {
        return this.eth_call(ownerOf, {id})
    }

    registerAgents(operator: RegisterAgentsParams["operator"], serviceId: RegisterAgentsParams["serviceId"], agentInstances: RegisterAgentsParams["agentInstances"], agentIds: RegisterAgentsParams["agentIds"]) {
        return this.eth_call(registerAgents, {operator, serviceId, agentInstances, agentIds})
    }

    slash(agentInstances: SlashParams["agentInstances"], amounts: SlashParams["amounts"], serviceId: SlashParams["serviceId"]) {
        return this.eth_call(slash, {agentInstances, amounts, serviceId})
    }

    slashedFunds() {
        return this.eth_call(slashedFunds, {})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(supportsInterface, {interfaceId})
    }

    symbol() {
        return this.eth_call(symbol, {})
    }

    terminate(serviceOwner: TerminateParams["serviceOwner"], serviceId: TerminateParams["serviceId"]) {
        return this.eth_call(terminate, {serviceOwner, serviceId})
    }

    tokenByIndex(id: TokenByIndexParams["id"]) {
        return this.eth_call(tokenByIndex, {id})
    }

    tokenURI(unitId: TokenURIParams["unitId"]) {
        return this.eth_call(tokenURI, {unitId})
    }

    totalSupply() {
        return this.eth_call(totalSupply, {})
    }

    unbond(operator: UnbondParams["operator"], serviceId: UnbondParams["serviceId"]) {
        return this.eth_call(unbond, {operator, serviceId})
    }

    update(serviceOwner: UpdateParams["serviceOwner"], configHash: UpdateParams["configHash"], agentIds: UpdateParams["agentIds"], agentParams: UpdateParams["agentParams"], threshold: UpdateParams["threshold"], serviceId: UpdateParams["serviceId"]) {
        return this.eth_call(update, {serviceOwner, configHash, agentIds, agentParams, threshold, serviceId})
    }
}
