import { ContractBase } from '../abi.support.js'
import { activateRegistrationTokenDeposit, drain, drainer, getAgentBond, getOperatorBalance, isTokenSecuredService, manager, mapOperatorAndServiceIdOperatorBalances, mapServiceAndAgentIdAgentBond, mapServiceIdTokenDeposit, mapSlashedFunds, owner, registerAgentsTokenDeposit, serviceRegistry, slash, terminateTokenRefund, unbondTokenRefund } from './functions.js'
import type { ActivateRegistrationTokenDepositParams, DrainParams, GetAgentBondParams, GetOperatorBalanceParams, IsTokenSecuredServiceParams, MapOperatorAndServiceIdOperatorBalancesParams, MapServiceAndAgentIdAgentBondParams, MapServiceIdTokenDepositParams, MapSlashedFundsParams, RegisterAgentsTokenDepositParams, SlashParams, TerminateTokenRefundParams, UnbondTokenRefundParams } from './functions.js'

export class Contract extends ContractBase {
    activateRegistrationTokenDeposit(serviceId: ActivateRegistrationTokenDepositParams["serviceId"]) {
        return this.eth_call(activateRegistrationTokenDeposit, {serviceId})
    }

    drain(token: DrainParams["token"]) {
        return this.eth_call(drain, {token})
    }

    drainer() {
        return this.eth_call(drainer, {})
    }

    getAgentBond(serviceId: GetAgentBondParams["serviceId"], agentId: GetAgentBondParams["agentId"]) {
        return this.eth_call(getAgentBond, {serviceId, agentId})
    }

    getOperatorBalance(operator: GetOperatorBalanceParams["operator"], serviceId: GetOperatorBalanceParams["serviceId"]) {
        return this.eth_call(getOperatorBalance, {operator, serviceId})
    }

    isTokenSecuredService(serviceId: IsTokenSecuredServiceParams["serviceId"]) {
        return this.eth_call(isTokenSecuredService, {serviceId})
    }

    manager() {
        return this.eth_call(manager, {})
    }

    mapOperatorAndServiceIdOperatorBalances(_0: MapOperatorAndServiceIdOperatorBalancesParams["_0"]) {
        return this.eth_call(mapOperatorAndServiceIdOperatorBalances, {_0})
    }

    mapServiceAndAgentIdAgentBond(_0: MapServiceAndAgentIdAgentBondParams["_0"]) {
        return this.eth_call(mapServiceAndAgentIdAgentBond, {_0})
    }

    mapServiceIdTokenDeposit(_0: MapServiceIdTokenDepositParams["_0"]) {
        return this.eth_call(mapServiceIdTokenDeposit, {_0})
    }

    mapSlashedFunds(_0: MapSlashedFundsParams["_0"]) {
        return this.eth_call(mapSlashedFunds, {_0})
    }

    owner() {
        return this.eth_call(owner, {})
    }

    registerAgentsTokenDeposit(operator: RegisterAgentsTokenDepositParams["operator"], serviceId: RegisterAgentsTokenDepositParams["serviceId"], agentIds: RegisterAgentsTokenDepositParams["agentIds"]) {
        return this.eth_call(registerAgentsTokenDeposit, {operator, serviceId, agentIds})
    }

    serviceRegistry() {
        return this.eth_call(serviceRegistry, {})
    }

    slash(agentInstances: SlashParams["agentInstances"], amounts: SlashParams["amounts"], serviceId: SlashParams["serviceId"]) {
        return this.eth_call(slash, {agentInstances, amounts, serviceId})
    }

    terminateTokenRefund(serviceId: TerminateTokenRefundParams["serviceId"]) {
        return this.eth_call(terminateTokenRefund, {serviceId})
    }

    unbondTokenRefund(operator: UnbondTokenRefundParams["operator"], serviceId: UnbondTokenRefundParams["serviceId"]) {
        return this.eth_call(unbondTokenRefund, {operator, serviceId})
    }
}
