import { address, array, bool, struct, uint256, uint32, uint96 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** activateRegistrationTokenDeposit(uint256) */
export const activateRegistrationTokenDeposit = func('0x542db449', {
    serviceId: uint256,
}, bool)
export type ActivateRegistrationTokenDepositParams = FunctionArguments<typeof activateRegistrationTokenDeposit>
export type ActivateRegistrationTokenDepositReturn = FunctionReturn<typeof activateRegistrationTokenDeposit>

/** changeDrainer(address) */
export const changeDrainer = func('0x10c6aa19', {
    newDrainer: address,
})
export type ChangeDrainerParams = FunctionArguments<typeof changeDrainer>
export type ChangeDrainerReturn = FunctionReturn<typeof changeDrainer>

/** changeManager(address) */
export const changeManager = func('0xa3fbbaae', {
    newManager: address,
})
export type ChangeManagerParams = FunctionArguments<typeof changeManager>
export type ChangeManagerReturn = FunctionReturn<typeof changeManager>

/** changeOwner(address) */
export const changeOwner = func('0xa6f9dae1', {
    newOwner: address,
})
export type ChangeOwnerParams = FunctionArguments<typeof changeOwner>
export type ChangeOwnerReturn = FunctionReturn<typeof changeOwner>

/** createWithToken(uint256,address,uint32[],uint256[]) */
export const createWithToken = func('0xe3ce9a84', {
    serviceId: uint256,
    token: address,
    agentIds: array(uint32),
    bonds: array(uint256),
})
export type CreateWithTokenParams = FunctionArguments<typeof createWithToken>
export type CreateWithTokenReturn = FunctionReturn<typeof createWithToken>

/** drain(address) */
export const drain = func('0xece53132', {
    token: address,
}, uint256)
export type DrainParams = FunctionArguments<typeof drain>
export type DrainReturn = FunctionReturn<typeof drain>

/** drainer() */
export const drainer = func('0x57838e85', {}, address)
export type DrainerParams = FunctionArguments<typeof drainer>
export type DrainerReturn = FunctionReturn<typeof drainer>

/** getAgentBond(uint256,uint256) */
export const getAgentBond = func('0x75c1f934', {
    serviceId: uint256,
    agentId: uint256,
}, uint256)
export type GetAgentBondParams = FunctionArguments<typeof getAgentBond>
export type GetAgentBondReturn = FunctionReturn<typeof getAgentBond>

/** getOperatorBalance(address,uint256) */
export const getOperatorBalance = func('0x8a2bd86f', {
    operator: address,
    serviceId: uint256,
}, uint256)
export type GetOperatorBalanceParams = FunctionArguments<typeof getOperatorBalance>
export type GetOperatorBalanceReturn = FunctionReturn<typeof getOperatorBalance>

/** isTokenSecuredService(uint256) */
export const isTokenSecuredService = func('0x46d7836d', {
    serviceId: uint256,
}, bool)
export type IsTokenSecuredServiceParams = FunctionArguments<typeof isTokenSecuredService>
export type IsTokenSecuredServiceReturn = FunctionReturn<typeof isTokenSecuredService>

/** manager() */
export const manager = func('0x481c6a75', {}, address)
export type ManagerParams = FunctionArguments<typeof manager>
export type ManagerReturn = FunctionReturn<typeof manager>

/** mapOperatorAndServiceIdOperatorBalances(uint256) */
export const mapOperatorAndServiceIdOperatorBalances = func('0x42144854', {
    _0: uint256,
}, uint256)
export type MapOperatorAndServiceIdOperatorBalancesParams = FunctionArguments<typeof mapOperatorAndServiceIdOperatorBalances>
export type MapOperatorAndServiceIdOperatorBalancesReturn = FunctionReturn<typeof mapOperatorAndServiceIdOperatorBalances>

/** mapServiceAndAgentIdAgentBond(uint256) */
export const mapServiceAndAgentIdAgentBond = func('0x13f824d8', {
    _0: uint256,
}, uint256)
export type MapServiceAndAgentIdAgentBondParams = FunctionArguments<typeof mapServiceAndAgentIdAgentBond>
export type MapServiceAndAgentIdAgentBondReturn = FunctionReturn<typeof mapServiceAndAgentIdAgentBond>

/** mapServiceIdTokenDeposit(uint256) */
export const mapServiceIdTokenDeposit = func('0x3cebfa4f', {
    _0: uint256,
}, struct({
    token: address,
    securityDeposit: uint96,
}))
export type MapServiceIdTokenDepositParams = FunctionArguments<typeof mapServiceIdTokenDeposit>
export type MapServiceIdTokenDepositReturn = FunctionReturn<typeof mapServiceIdTokenDeposit>

/** mapSlashedFunds(address) */
export const mapSlashedFunds = func('0xcbd413a5', {
    _0: address,
}, uint256)
export type MapSlashedFundsParams = FunctionArguments<typeof mapSlashedFunds>
export type MapSlashedFundsReturn = FunctionReturn<typeof mapSlashedFunds>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** registerAgentsTokenDeposit(address,uint256,uint32[]) */
export const registerAgentsTokenDeposit = func('0xdc4f8bc5', {
    operator: address,
    serviceId: uint256,
    agentIds: array(uint32),
}, bool)
export type RegisterAgentsTokenDepositParams = FunctionArguments<typeof registerAgentsTokenDeposit>
export type RegisterAgentsTokenDepositReturn = FunctionReturn<typeof registerAgentsTokenDeposit>

/** resetServiceToken(uint256) */
export const resetServiceToken = func('0x5f366258', {
    serviceId: uint256,
})
export type ResetServiceTokenParams = FunctionArguments<typeof resetServiceToken>
export type ResetServiceTokenReturn = FunctionReturn<typeof resetServiceToken>

/** serviceRegistry() */
export const serviceRegistry = func('0xcbcf252a', {}, address)
export type ServiceRegistryParams = FunctionArguments<typeof serviceRegistry>
export type ServiceRegistryReturn = FunctionReturn<typeof serviceRegistry>

/** slash(address[],uint256[],uint256) */
export const slash = func('0x5419bb8c', {
    agentInstances: array(address),
    amounts: array(uint256),
    serviceId: uint256,
}, bool)
export type SlashParams = FunctionArguments<typeof slash>
export type SlashReturn = FunctionReturn<typeof slash>

/** terminateTokenRefund(uint256) */
export const terminateTokenRefund = func('0x25e1afc3', {
    serviceId: uint256,
}, uint256)
export type TerminateTokenRefundParams = FunctionArguments<typeof terminateTokenRefund>
export type TerminateTokenRefundReturn = FunctionReturn<typeof terminateTokenRefund>

/** unbondTokenRefund(address,uint256) */
export const unbondTokenRefund = func('0xb0f4c248', {
    operator: address,
    serviceId: uint256,
}, uint256)
export type UnbondTokenRefundParams = FunctionArguments<typeof unbondTokenRefund>
export type UnbondTokenRefundReturn = FunctionReturn<typeof unbondTokenRefund>
