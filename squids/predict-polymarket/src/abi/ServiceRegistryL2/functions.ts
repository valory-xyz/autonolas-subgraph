import { address, array, bool, bytes, bytes32, bytes4, string, struct, uint256, uint32, uint8, uint96 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** CID_PREFIX() */
export const CID_PREFIX = func('0x7c5e63e0', {}, string)
export type CID_PREFIXParams = FunctionArguments<typeof CID_PREFIX>
export type CID_PREFIXReturn = FunctionReturn<typeof CID_PREFIX>

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** activateRegistration(address,uint256) */
export const activateRegistration = func('0xe23f6fb4', {
    serviceOwner: address,
    serviceId: uint256,
}, bool)
export type ActivateRegistrationParams = FunctionArguments<typeof activateRegistration>
export type ActivateRegistrationReturn = FunctionReturn<typeof activateRegistration>

/** approve(address,uint256) */
export const approve = func('0x095ea7b3', {
    spender: address,
    id: uint256,
})
export type ApproveParams = FunctionArguments<typeof approve>
export type ApproveReturn = FunctionReturn<typeof approve>

/** balanceOf(address) */
export const balanceOf = func('0x70a08231', {
    owner: address,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** baseURI() */
export const baseURI = func('0x6c0360eb', {}, string)
export type BaseURIParams = FunctionArguments<typeof baseURI>
export type BaseURIReturn = FunctionReturn<typeof baseURI>

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

/** changeMultisigPermission(address,bool) */
export const changeMultisigPermission = func('0x82694b1d', {
    multisig: address,
    permission: bool,
}, bool)
export type ChangeMultisigPermissionParams = FunctionArguments<typeof changeMultisigPermission>
export type ChangeMultisigPermissionReturn = FunctionReturn<typeof changeMultisigPermission>

/** changeOwner(address) */
export const changeOwner = func('0xa6f9dae1', {
    newOwner: address,
})
export type ChangeOwnerParams = FunctionArguments<typeof changeOwner>
export type ChangeOwnerReturn = FunctionReturn<typeof changeOwner>

/** create(address,bytes32,uint32[],(uint32,uint96)[],uint32) */
export const create = func('0xfbdeb3d7', {
    serviceOwner: address,
    configHash: bytes32,
    agentIds: array(uint32),
    agentParams: array(struct({
        slots: uint32,
        bond: uint96,
    })),
    threshold: uint32,
}, uint256)
export type CreateParams = FunctionArguments<typeof create>
export type CreateReturn = FunctionReturn<typeof create>

/** deploy(address,uint256,address,bytes) */
export const deploy = func('0xf908bc77', {
    serviceOwner: address,
    serviceId: uint256,
    multisigImplementation: address,
    data: bytes,
}, address)
export type DeployParams = FunctionArguments<typeof deploy>
export type DeployReturn = FunctionReturn<typeof deploy>

/** drain() */
export const drain = func('0x9890220b', {}, uint256)
export type DrainParams = FunctionArguments<typeof drain>
export type DrainReturn = FunctionReturn<typeof drain>

/** drainer() */
export const drainer = func('0x57838e85', {}, address)
export type DrainerParams = FunctionArguments<typeof drainer>
export type DrainerReturn = FunctionReturn<typeof drainer>

/** exists(uint256) */
export const exists = func('0x4f558e79', {
    unitId: uint256,
}, bool)
export type ExistsParams = FunctionArguments<typeof exists>
export type ExistsReturn = FunctionReturn<typeof exists>

/** getAgentInstances(uint256) */
export const getAgentInstances = func('0x4d486f85', {
    serviceId: uint256,
}, struct({
    numAgentInstances: uint256,
    agentInstances: array(address),
}))
export type GetAgentInstancesParams = FunctionArguments<typeof getAgentInstances>
export type GetAgentInstancesReturn = FunctionReturn<typeof getAgentInstances>

/** getAgentParams(uint256) */
export const getAgentParams = func('0x1de286ba', {
    serviceId: uint256,
}, struct({
    numAgentIds: uint256,
    agentParams: array(struct({
        slots: uint32,
        bond: uint96,
    })),
}))
export type GetAgentParamsParams = FunctionArguments<typeof getAgentParams>
export type GetAgentParamsReturn = FunctionReturn<typeof getAgentParams>

/** getApproved(uint256) */
export const getApproved = func('0x081812fc', {
    _0: uint256,
}, address)
export type GetApprovedParams = FunctionArguments<typeof getApproved>
export type GetApprovedReturn = FunctionReturn<typeof getApproved>

/** getInstancesForAgentId(uint256,uint256) */
export const getInstancesForAgentId = func('0x21e4f7bb', {
    serviceId: uint256,
    agentId: uint256,
}, struct({
    numAgentInstances: uint256,
    agentInstances: array(address),
}))
export type GetInstancesForAgentIdParams = FunctionArguments<typeof getInstancesForAgentId>
export type GetInstancesForAgentIdReturn = FunctionReturn<typeof getInstancesForAgentId>

/** getOperatorBalance(address,uint256) */
export const getOperatorBalance = func('0x8a2bd86f', {
    operator: address,
    serviceId: uint256,
}, uint256)
export type GetOperatorBalanceParams = FunctionArguments<typeof getOperatorBalance>
export type GetOperatorBalanceReturn = FunctionReturn<typeof getOperatorBalance>

/** getPreviousHashes(uint256) */
export const getPreviousHashes = func('0xa60e4c3c', {
    serviceId: uint256,
}, struct({
    numHashes: uint256,
    configHashes: array(bytes32),
}))
export type GetPreviousHashesParams = FunctionArguments<typeof getPreviousHashes>
export type GetPreviousHashesReturn = FunctionReturn<typeof getPreviousHashes>

/** getService(uint256) */
export const getService = func('0xef0e239b', {
    serviceId: uint256,
}, struct({
    securityDeposit: uint96,
    multisig: address,
    configHash: bytes32,
    threshold: uint32,
    maxNumAgentInstances: uint32,
    numAgentInstances: uint32,
    state: uint8,
    agentIds: array(uint32),
}))
export type GetServiceParams = FunctionArguments<typeof getService>
export type GetServiceReturn = FunctionReturn<typeof getService>

/** isApprovedForAll(address,address) */
export const isApprovedForAll = func('0xe985e9c5', {
    _0: address,
    _1: address,
}, bool)
export type IsApprovedForAllParams = FunctionArguments<typeof isApprovedForAll>
export type IsApprovedForAllReturn = FunctionReturn<typeof isApprovedForAll>

/** manager() */
export const manager = func('0x481c6a75', {}, address)
export type ManagerParams = FunctionArguments<typeof manager>
export type ManagerReturn = FunctionReturn<typeof manager>

/** mapAgentInstanceOperators(address) */
export const mapAgentInstanceOperators = func('0x4eb780da', {
    _0: address,
}, address)
export type MapAgentInstanceOperatorsParams = FunctionArguments<typeof mapAgentInstanceOperators>
export type MapAgentInstanceOperatorsReturn = FunctionReturn<typeof mapAgentInstanceOperators>

/** mapConfigHashes(uint256,uint256) */
export const mapConfigHashes = func('0x86a2bdd4', {
    _0: uint256,
    _1: uint256,
}, bytes32)
export type MapConfigHashesParams = FunctionArguments<typeof mapConfigHashes>
export type MapConfigHashesReturn = FunctionReturn<typeof mapConfigHashes>

/** mapMultisigs(address) */
export const mapMultisigs = func('0x17351f7e', {
    _0: address,
}, bool)
export type MapMultisigsParams = FunctionArguments<typeof mapMultisigs>
export type MapMultisigsReturn = FunctionReturn<typeof mapMultisigs>

/** mapOperatorAndServiceIdAgentInstances(uint256,uint256) */
export const mapOperatorAndServiceIdAgentInstances = func('0x718934d8', {
    _0: uint256,
    _1: uint256,
}, struct({
    instance: address,
    agentId: uint32,
}))
export type MapOperatorAndServiceIdAgentInstancesParams = FunctionArguments<typeof mapOperatorAndServiceIdAgentInstances>
export type MapOperatorAndServiceIdAgentInstancesReturn = FunctionReturn<typeof mapOperatorAndServiceIdAgentInstances>

/** mapOperatorAndServiceIdOperatorBalances(uint256) */
export const mapOperatorAndServiceIdOperatorBalances = func('0x42144854', {
    _0: uint256,
}, uint96)
export type MapOperatorAndServiceIdOperatorBalancesParams = FunctionArguments<typeof mapOperatorAndServiceIdOperatorBalances>
export type MapOperatorAndServiceIdOperatorBalancesReturn = FunctionReturn<typeof mapOperatorAndServiceIdOperatorBalances>

/** mapServiceAndAgentIdAgentInstances(uint256,uint256) */
export const mapServiceAndAgentIdAgentInstances = func('0x5e4507fa', {
    _0: uint256,
    _1: uint256,
}, address)
export type MapServiceAndAgentIdAgentInstancesParams = FunctionArguments<typeof mapServiceAndAgentIdAgentInstances>
export type MapServiceAndAgentIdAgentInstancesReturn = FunctionReturn<typeof mapServiceAndAgentIdAgentInstances>

/** mapServiceAndAgentIdAgentParams(uint256) */
export const mapServiceAndAgentIdAgentParams = func('0x63dd7615', {
    _0: uint256,
}, struct({
    slots: uint32,
    bond: uint96,
}))
export type MapServiceAndAgentIdAgentParamsParams = FunctionArguments<typeof mapServiceAndAgentIdAgentParams>
export type MapServiceAndAgentIdAgentParamsReturn = FunctionReturn<typeof mapServiceAndAgentIdAgentParams>

/** mapServices(uint256) */
export const mapServices = func('0x4236aff8', {
    _0: uint256,
}, struct({
    securityDeposit: uint96,
    multisig: address,
    configHash: bytes32,
    threshold: uint32,
    maxNumAgentInstances: uint32,
    numAgentInstances: uint32,
    state: uint8,
}))
export type MapServicesParams = FunctionArguments<typeof mapServices>
export type MapServicesReturn = FunctionReturn<typeof mapServices>

/** name() */
export const name = func('0x06fdde03', {}, string)
export type NameParams = FunctionArguments<typeof name>
export type NameReturn = FunctionReturn<typeof name>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** ownerOf(uint256) */
export const ownerOf = func('0x6352211e', {
    id: uint256,
}, address)
export type OwnerOfParams = FunctionArguments<typeof ownerOf>
export type OwnerOfReturn = FunctionReturn<typeof ownerOf>

/** registerAgents(address,uint256,address[],uint32[]) */
export const registerAgents = func('0xdff76724', {
    operator: address,
    serviceId: uint256,
    agentInstances: array(address),
    agentIds: array(uint32),
}, bool)
export type RegisterAgentsParams = FunctionArguments<typeof registerAgents>
export type RegisterAgentsReturn = FunctionReturn<typeof registerAgents>

/** safeTransferFrom(address,address,uint256) */
export const safeTransferFrom = func('0x42842e0e', {
    from: address,
    to: address,
    id: uint256,
})
export type SafeTransferFromParams = FunctionArguments<typeof safeTransferFrom>
export type SafeTransferFromReturn = FunctionReturn<typeof safeTransferFrom>

/** safeTransferFrom(address,address,uint256,bytes) */
export const safeTransferFrom_1 = func('0xb88d4fde', {
    from: address,
    to: address,
    id: uint256,
    data: bytes,
})
export type SafeTransferFromParams_1 = FunctionArguments<typeof safeTransferFrom_1>
export type SafeTransferFromReturn_1 = FunctionReturn<typeof safeTransferFrom_1>

/** setApprovalForAll(address,bool) */
export const setApprovalForAll = func('0xa22cb465', {
    operator: address,
    approved: bool,
})
export type SetApprovalForAllParams = FunctionArguments<typeof setApprovalForAll>
export type SetApprovalForAllReturn = FunctionReturn<typeof setApprovalForAll>

/** setBaseURI(string) */
export const setBaseURI = func('0x55f804b3', {
    bURI: string,
})
export type SetBaseURIParams = FunctionArguments<typeof setBaseURI>
export type SetBaseURIReturn = FunctionReturn<typeof setBaseURI>

/** slash(address[],uint96[],uint256) */
export const slash = func('0x73b8b6a2', {
    agentInstances: array(address),
    amounts: array(uint96),
    serviceId: uint256,
}, bool)
export type SlashParams = FunctionArguments<typeof slash>
export type SlashReturn = FunctionReturn<typeof slash>

/** slashedFunds() */
export const slashedFunds = func('0x6f99f15c', {}, uint96)
export type SlashedFundsParams = FunctionArguments<typeof slashedFunds>
export type SlashedFundsReturn = FunctionReturn<typeof slashedFunds>

/** supportsInterface(bytes4) */
export const supportsInterface = func('0x01ffc9a7', {
    interfaceId: bytes4,
}, bool)
export type SupportsInterfaceParams = FunctionArguments<typeof supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof supportsInterface>

/** symbol() */
export const symbol = func('0x95d89b41', {}, string)
export type SymbolParams = FunctionArguments<typeof symbol>
export type SymbolReturn = FunctionReturn<typeof symbol>

/** terminate(address,uint256) */
export const terminate = func('0xccc9305d', {
    serviceOwner: address,
    serviceId: uint256,
}, struct({
    success: bool,
    refund: uint256,
}))
export type TerminateParams = FunctionArguments<typeof terminate>
export type TerminateReturn = FunctionReturn<typeof terminate>

/** tokenByIndex(uint256) */
export const tokenByIndex = func('0x4f6ccce7', {
    id: uint256,
}, uint256)
export type TokenByIndexParams = FunctionArguments<typeof tokenByIndex>
export type TokenByIndexReturn = FunctionReturn<typeof tokenByIndex>

/** tokenURI(uint256) */
export const tokenURI = func('0xc87b56dd', {
    unitId: uint256,
}, string)
export type TokenURIParams = FunctionArguments<typeof tokenURI>
export type TokenURIReturn = FunctionReturn<typeof tokenURI>

/** totalSupply() */
export const totalSupply = func('0x18160ddd', {}, uint256)
export type TotalSupplyParams = FunctionArguments<typeof totalSupply>
export type TotalSupplyReturn = FunctionReturn<typeof totalSupply>

/** transferFrom(address,address,uint256) */
export const transferFrom = func('0x23b872dd', {
    from: address,
    to: address,
    id: uint256,
})
export type TransferFromParams = FunctionArguments<typeof transferFrom>
export type TransferFromReturn = FunctionReturn<typeof transferFrom>

/** unbond(address,uint256) */
export const unbond = func('0xa5d059ca', {
    operator: address,
    serviceId: uint256,
}, struct({
    success: bool,
    refund: uint256,
}))
export type UnbondParams = FunctionArguments<typeof unbond>
export type UnbondReturn = FunctionReturn<typeof unbond>

/** update(address,bytes32,uint32[],(uint32,uint96)[],uint32,uint256) */
export const update = func('0xcbf994f8', {
    serviceOwner: address,
    configHash: bytes32,
    agentIds: array(uint32),
    agentParams: array(struct({
        slots: uint32,
        bond: uint96,
    })),
    threshold: uint32,
    serviceId: uint256,
}, bool)
export type UpdateParams = FunctionArguments<typeof update>
export type UpdateReturn = FunctionReturn<typeof update>
