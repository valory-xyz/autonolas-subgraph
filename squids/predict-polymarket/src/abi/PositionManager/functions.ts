import { address, array, bool, bytes, bytes31, bytes32, bytes4, string, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** COLLATERAL_TOKEN() */
export const COLLATERAL_TOKEN = func('0xf5f1f1a7', {}, address)
export type COLLATERAL_TOKENParams = FunctionArguments<typeof COLLATERAL_TOKEN>
export type COLLATERAL_TOKENReturn = FunctionReturn<typeof COLLATERAL_TOKEN>

/** addAdmin(address) */
export const addAdmin = func('0x70480275', {
    _admin: address,
})
export type AddAdminParams = FunctionArguments<typeof addAdmin>
export type AddAdminReturn = FunctionReturn<typeof addAdmin>

/** addCreator(address) */
export const addCreator = func('0x3b9dce05', {
    _creator: address,
})
export type AddCreatorParams = FunctionArguments<typeof addCreator>
export type AddCreatorReturn = FunctionReturn<typeof addCreator>

/** addModule(address) */
export const addModule = func('0x1ed86f19', {
    _module: address,
})
export type AddModuleParams = FunctionArguments<typeof addModule>
export type AddModuleReturn = FunctionReturn<typeof addModule>

/** addOperator(address) */
export const addOperator = func('0x9870d7fe', {
    _operator: address,
})
export type AddOperatorParams = FunctionArguments<typeof addOperator>
export type AddOperatorReturn = FunctionReturn<typeof addOperator>

/** balanceOf(address,uint256) */
export const balanceOf = func('0x00fdd58e', {
    owner: address,
    id: uint256,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** balanceOf(address,bytes31,uint256) */
export const balanceOf_1 = func('0x445ff629', {
    _owner: address,
    _conditionId: bytes31,
    _outcomeIndex: uint256,
}, uint256)
export type BalanceOfParams_1 = FunctionArguments<typeof balanceOf_1>
export type BalanceOfReturn_1 = FunctionReturn<typeof balanceOf_1>

/** balanceOfBatch(address[],uint256[]) */
export const balanceOfBatch = func('0x4e1273f4', {
    owners: array(address),
    ids: array(uint256),
}, array(uint256))
export type BalanceOfBatchParams = FunctionArguments<typeof balanceOfBatch>
export type BalanceOfBatchReturn = FunctionReturn<typeof balanceOfBatch>

/** batchBurn(uint256[],uint256[]) */
export const batchBurn = func('0x20ec271b', {
    _positionIds: array(uint256),
    _amounts: array(uint256),
})
export type BatchBurnParams = FunctionArguments<typeof batchBurn>
export type BatchBurnReturn = FunctionReturn<typeof batchBurn>

/** batchMint(address,uint256[],uint256[]) */
export const batchMint = func('0x0ca83480', {
    _to: address,
    _positionIds: array(uint256),
    _amounts: array(uint256),
})
export type BatchMintParams = FunctionArguments<typeof batchMint>
export type BatchMintReturn = FunctionReturn<typeof batchMint>

/** burn(uint256,uint256) */
export const burn = func('0xb390c0ab', {
    _positionId: uint256,
    _amount: uint256,
})
export type BurnParams = FunctionArguments<typeof burn>
export type BurnReturn = FunctionReturn<typeof burn>

/** cancelOwnershipHandover() */
export const cancelOwnershipHandover = func('0x54d1f13d', {})
export type CancelOwnershipHandoverParams = FunctionArguments<typeof cancelOwnershipHandover>
export type CancelOwnershipHandoverReturn = FunctionReturn<typeof cancelOwnershipHandover>

/** completeOwnershipHandover(address) */
export const completeOwnershipHandover = func('0xf04e283e', {
    pendingOwner: address,
})
export type CompleteOwnershipHandoverParams = FunctionArguments<typeof completeOwnershipHandover>
export type CompleteOwnershipHandoverReturn = FunctionReturn<typeof completeOwnershipHandover>

/** crossModuleAuth(address) */
export const crossModuleAuth = func('0x1fbc5897', {
    _0: address,
}, bool)
export type CrossModuleAuthParams = FunctionArguments<typeof crossModuleAuth>
export type CrossModuleAuthReturn = FunctionReturn<typeof crossModuleAuth>

/** getPayout(uint256,uint256) */
export const getPayout = func('0x4c619e4c', {
    _positionId: uint256,
    _amount: uint256,
}, uint256)
export type GetPayoutParams = FunctionArguments<typeof getPayout>
export type GetPayoutReturn = FunctionReturn<typeof getPayout>

/** grantRoles(address,uint256) */
export const grantRoles = func('0x1c10893f', {
    user: address,
    roles: uint256,
})
export type GrantRolesParams = FunctionArguments<typeof grantRoles>
export type GrantRolesReturn = FunctionReturn<typeof grantRoles>

/** hasAllRoles(address,uint256) */
export const hasAllRoles = func('0x1cd64df4', {
    user: address,
    roles: uint256,
}, bool)
export type HasAllRolesParams = FunctionArguments<typeof hasAllRoles>
export type HasAllRolesReturn = FunctionReturn<typeof hasAllRoles>

/** hasAnyRole(address,uint256) */
export const hasAnyRole = func('0x514e62fc', {
    user: address,
    roles: uint256,
}, bool)
export type HasAnyRoleParams = FunctionArguments<typeof hasAnyRole>
export type HasAnyRoleReturn = FunctionReturn<typeof hasAnyRole>

/** initialize(address,address) */
export const initialize = func('0x485cc955', {
    _owner: address,
    _admin: address,
})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** isApprovedForAll(address,address) */
export const isApprovedForAll = func('0xe985e9c5', {
    owner: address,
    operator: address,
}, bool)
export type IsApprovedForAllParams = FunctionArguments<typeof isApprovedForAll>
export type IsApprovedForAllReturn = FunctionReturn<typeof isApprovedForAll>

/** mint(address,uint256,uint256) */
export const mint = func('0x156e29f6', {
    _to: address,
    _positionId: uint256,
    _amount: uint256,
})
export type MintParams = FunctionArguments<typeof mint>
export type MintReturn = FunctionReturn<typeof mint>

/** moduleById(uint256) */
export const moduleById = func('0x4d51cdf1', {
    _0: uint256,
}, address)
export type ModuleByIdParams = FunctionArguments<typeof moduleById>
export type ModuleByIdReturn = FunctionReturn<typeof moduleById>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** ownershipHandoverExpiresAt(address) */
export const ownershipHandoverExpiresAt = func('0xfee81cf4', {
    pendingOwner: address,
}, uint256)
export type OwnershipHandoverExpiresAtParams = FunctionArguments<typeof ownershipHandoverExpiresAt>
export type OwnershipHandoverExpiresAtReturn = FunctionReturn<typeof ownershipHandoverExpiresAt>

/** proxiableUUID() */
export const proxiableUUID = func('0x52d1902d', {}, bytes32)
export type ProxiableUUIDParams = FunctionArguments<typeof proxiableUUID>
export type ProxiableUUIDReturn = FunctionReturn<typeof proxiableUUID>

/** removeAdmin(address) */
export const removeAdmin = func('0x1785f53c', {
    _admin: address,
})
export type RemoveAdminParams = FunctionArguments<typeof removeAdmin>
export type RemoveAdminReturn = FunctionReturn<typeof removeAdmin>

/** removeCreator(address) */
export const removeCreator = func('0xbd6018bb', {
    _creator: address,
})
export type RemoveCreatorParams = FunctionArguments<typeof removeCreator>
export type RemoveCreatorReturn = FunctionReturn<typeof removeCreator>

/** removeModule(uint256) */
export const removeModule = func('0xd8e55e14', {
    _moduleId: uint256,
})
export type RemoveModuleParams = FunctionArguments<typeof removeModule>
export type RemoveModuleReturn = FunctionReturn<typeof removeModule>

/** removeOperator(address) */
export const removeOperator = func('0xac8a584a', {
    _operator: address,
})
export type RemoveOperatorParams = FunctionArguments<typeof removeOperator>
export type RemoveOperatorReturn = FunctionReturn<typeof removeOperator>

/** renounceOwnership() */
export const renounceOwnership = func('0x715018a6', {})
export type RenounceOwnershipParams = FunctionArguments<typeof renounceOwnership>
export type RenounceOwnershipReturn = FunctionReturn<typeof renounceOwnership>

/** renounceRoles(uint256) */
export const renounceRoles = func('0x183a4f6e', {
    roles: uint256,
})
export type RenounceRolesParams = FunctionArguments<typeof renounceRoles>
export type RenounceRolesReturn = FunctionReturn<typeof renounceRoles>

/** requestOwnershipHandover() */
export const requestOwnershipHandover = func('0x25692962', {})
export type RequestOwnershipHandoverParams = FunctionArguments<typeof requestOwnershipHandover>
export type RequestOwnershipHandoverReturn = FunctionReturn<typeof requestOwnershipHandover>

/** revokeRoles(address,uint256) */
export const revokeRoles = func('0x4a4ee7b1', {
    user: address,
    roles: uint256,
})
export type RevokeRolesParams = FunctionArguments<typeof revokeRoles>
export type RevokeRolesReturn = FunctionReturn<typeof revokeRoles>

/** rolesOf(address) */
export const rolesOf = func('0x2de94807', {
    user: address,
}, uint256)
export type RolesOfParams = FunctionArguments<typeof rolesOf>
export type RolesOfReturn = FunctionReturn<typeof rolesOf>

/** safeBatchTransferFrom(address,address,uint256[],uint256[],bytes) */
export const safeBatchTransferFrom = func('0x2eb2c2d6', {
    from: address,
    to: address,
    ids: array(uint256),
    amounts: array(uint256),
    data: bytes,
})
export type SafeBatchTransferFromParams = FunctionArguments<typeof safeBatchTransferFrom>
export type SafeBatchTransferFromReturn = FunctionReturn<typeof safeBatchTransferFrom>

/** safeTransferFrom(address,address,uint256,uint256,bytes) */
export const safeTransferFrom = func('0xf242432a', {
    from: address,
    to: address,
    id: uint256,
    amount: uint256,
    data: bytes,
})
export type SafeTransferFromParams = FunctionArguments<typeof safeTransferFrom>
export type SafeTransferFromReturn = FunctionReturn<typeof safeTransferFrom>

/** setApprovalForAll(address,bool) */
export const setApprovalForAll = func('0xa22cb465', {
    operator: address,
    isApproved: bool,
})
export type SetApprovalForAllParams = FunctionArguments<typeof setApprovalForAll>
export type SetApprovalForAllReturn = FunctionReturn<typeof setApprovalForAll>

/** setCrossModuleAuth(address,bool) */
export const setCrossModuleAuth = func('0x56c35ef3', {
    _module: address,
    _authorized: bool,
})
export type SetCrossModuleAuthParams = FunctionArguments<typeof setCrossModuleAuth>
export type SetCrossModuleAuthReturn = FunctionReturn<typeof setCrossModuleAuth>

/** supportsInterface(bytes4) */
export const supportsInterface = func('0x01ffc9a7', {
    interfaceId: bytes4,
}, bool)
export type SupportsInterfaceParams = FunctionArguments<typeof supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof supportsInterface>

/** transferOwnership(address) */
export const transferOwnership = func('0xf2fde38b', {
    newOwner: address,
})
export type TransferOwnershipParams = FunctionArguments<typeof transferOwnership>
export type TransferOwnershipReturn = FunctionReturn<typeof transferOwnership>

/** unsafeBatchTransferFrom(address,address,uint256[],uint256[]) */
export const unsafeBatchTransferFrom = func('0x4028e8ea', {
    from: address,
    to: address,
    ids: array(uint256),
    amounts: array(uint256),
})
export type UnsafeBatchTransferFromParams = FunctionArguments<typeof unsafeBatchTransferFrom>
export type UnsafeBatchTransferFromReturn = FunctionReturn<typeof unsafeBatchTransferFrom>

/** unsafeTransferFrom(address,address,uint256,uint256) */
export const unsafeTransferFrom = func('0xfbc37ca9', {
    from: address,
    to: address,
    id: uint256,
    amount: uint256,
})
export type UnsafeTransferFromParams = FunctionArguments<typeof unsafeTransferFrom>
export type UnsafeTransferFromReturn = FunctionReturn<typeof unsafeTransferFrom>

/** upgradeToAndCall(address,bytes) */
export const upgradeToAndCall = func('0x4f1ef286', {
    newImplementation: address,
    data: bytes,
})
export type UpgradeToAndCallParams = FunctionArguments<typeof upgradeToAndCall>
export type UpgradeToAndCallReturn = FunctionReturn<typeof upgradeToAndCall>

/** uri(uint256) */
export const uri = func('0x0e89341c', {
    _positionId: uint256,
}, string)
export type UriParams = FunctionArguments<typeof uri>
export type UriReturn = FunctionReturn<typeof uri>
