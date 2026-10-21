import { address, array, bool, bytes, bytes1, bytes32, bytes4, string, struct, uint248, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** COLLATERAL_TOKEN() */
export const COLLATERAL_TOKEN = func('0xf5f1f1a7', {}, address)
export type COLLATERAL_TOKENParams = FunctionArguments<typeof COLLATERAL_TOKEN>
export type COLLATERAL_TOKENReturn = FunctionReturn<typeof COLLATERAL_TOKEN>

/** COMBINATORIAL_MODULE() */
export const COMBINATORIAL_MODULE = func('0x5d85fba8', {}, address)
export type COMBINATORIAL_MODULEParams = FunctionArguments<typeof COMBINATORIAL_MODULE>
export type COMBINATORIAL_MODULEReturn = FunctionReturn<typeof COMBINATORIAL_MODULE>

/** FEE_RECEIVER() */
export const FEE_RECEIVER = func('0xd3e78e4d', {}, address)
export type FEE_RECEIVERParams = FunctionArguments<typeof FEE_RECEIVER>
export type FEE_RECEIVERReturn = FunctionReturn<typeof FEE_RECEIVER>

/** MAX_FEE_RATE() */
export const MAX_FEE_RATE = func('0x92f6576e', {}, uint256)
export type MAX_FEE_RATEParams = FunctionArguments<typeof MAX_FEE_RATE>
export type MAX_FEE_RATEReturn = FunctionReturn<typeof MAX_FEE_RATE>

/** POSITION_MANAGER() */
export const POSITION_MANAGER = func('0x1bea83fe', {}, address)
export type POSITION_MANAGERParams = FunctionArguments<typeof POSITION_MANAGER>
export type POSITION_MANAGERReturn = FunctionReturn<typeof POSITION_MANAGER>

/** addAdmin(address) */
export const addAdmin = func('0x70480275', {
    _admin: address,
})
export type AddAdminParams = FunctionArguments<typeof addAdmin>
export type AddAdminReturn = FunctionReturn<typeof addAdmin>

/** addOperator(address) */
export const addOperator = func('0x9870d7fe', {
    _operator: address,
})
export type AddOperatorParams = FunctionArguments<typeof addOperator>
export type AddOperatorReturn = FunctionReturn<typeof addOperator>

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

/** domainSeparator() */
export const domainSeparator = func('0xf698da25', {}, bytes32)
export type DomainSeparatorParams = FunctionArguments<typeof domainSeparator>
export type DomainSeparatorReturn = FunctionReturn<typeof domainSeparator>

/** eip712Domain() */
export const eip712Domain = func('0x84b0196e', {}, struct({
    fields: bytes1,
    name: string,
    version: string,
    chainId: uint256,
    verifyingContract: address,
    salt: bytes32,
    extensions: array(uint256),
}))
export type Eip712DomainParams = FunctionArguments<typeof eip712Domain>
export type Eip712DomainReturn = FunctionReturn<typeof eip712Domain>

/** getOrderStatus(bytes32) */
export const getOrderStatus = func('0x46423aa7', {
    orderHash: bytes32,
}, struct({
    filled: bool,
    remaining: uint248,
}))
export type GetOrderStatusParams = FunctionArguments<typeof getOrderStatus>
export type GetOrderStatusReturn = FunctionReturn<typeof getOrderStatus>

/** getProxyWalletAddress(address) */
export const getProxyWalletAddress = func('0x58d8b6bb', {
    _signer: address,
}, address)
export type GetProxyWalletAddressParams = FunctionArguments<typeof getProxyWalletAddress>
export type GetProxyWalletAddressReturn = FunctionReturn<typeof getProxyWalletAddress>

/** getSafeWalletAddress(address) */
export const getSafeWalletAddress = func('0x70bf48e5', {
    _signer: address,
}, address)
export type GetSafeWalletAddressParams = FunctionArguments<typeof getSafeWalletAddress>
export type GetSafeWalletAddressReturn = FunctionReturn<typeof getSafeWalletAddress>

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

/** hashOrder((uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes)) */
export const hashOrder = func('0x3d861a4d', {
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        side: uint8,
        signatureType: uint8,
        timestamp: uint256,
        metadata: bytes32,
        builder: bytes32,
        signature: bytes,
    }),
}, bytes32)
export type HashOrderParams = FunctionArguments<typeof hashOrder>
export type HashOrderReturn = FunctionReturn<typeof hashOrder>

/** initialize(address,address) */
export const initialize = func('0x485cc955', {
    _owner: address,
    _admin: address,
})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** invalidatePreapprovedOrder(bytes32) */
export const invalidatePreapprovedOrder = func('0x437f1994', {
    orderHash: bytes32,
})
export type InvalidatePreapprovedOrderParams = FunctionArguments<typeof invalidatePreapprovedOrder>
export type InvalidatePreapprovedOrderReturn = FunctionReturn<typeof invalidatePreapprovedOrder>

/** isAdmin(address) */
export const isAdmin = func('0x24d7806c', {
    _usr: address,
}, bool)
export type IsAdminParams = FunctionArguments<typeof isAdmin>
export type IsAdminReturn = FunctionReturn<typeof isAdmin>

/** isOperator(address) */
export const isOperator = func('0x6d70f7ae', {
    _usr: address,
}, bool)
export type IsOperatorParams = FunctionArguments<typeof isOperator>
export type IsOperatorReturn = FunctionReturn<typeof isOperator>

/** isUserPaused(address) */
export const isUserPaused = func('0x28872101', {
    _user: address,
}, bool)
export type IsUserPausedParams = FunctionArguments<typeof isUserPaused>
export type IsUserPausedReturn = FunctionReturn<typeof isUserPaused>

/** matchOrders((uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes),(uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes)[],uint256[],uint256[],(uint256,uint256,uint256)) */
export const matchOrders = func('0x0fb25ba4', {
    takerOrder: struct({
        salt: uint256,
        maker: address,
        signer: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        side: uint8,
        signatureType: uint8,
        timestamp: uint256,
        metadata: bytes32,
        builder: bytes32,
        signature: bytes,
    }),
    makerOrders: array(struct({
        salt: uint256,
        maker: address,
        signer: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        side: uint8,
        signatureType: uint8,
        timestamp: uint256,
        metadata: bytes32,
        builder: bytes32,
        signature: bytes,
    })),
    makerFillAmounts: array(uint256),
    makerFeeAmounts: array(uint256),
    takerAmounts: struct({
        takerFillAmount: uint256,
        takerReceiveAmount: uint256,
        takerFeeAmount: uint256,
    }),
})
export type MatchOrdersParams = FunctionArguments<typeof matchOrders>
export type MatchOrdersReturn = FunctionReturn<typeof matchOrders>

/** matchOrdersAndPrepareCombinatorial((uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes),(uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes)[],uint256[],uint256[],(uint256,uint256,uint256),uint256[]) */
export const matchOrdersAndPrepareCombinatorial = func('0xe75cf6e5', {
    takerOrder: struct({
        salt: uint256,
        maker: address,
        signer: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        side: uint8,
        signatureType: uint8,
        timestamp: uint256,
        metadata: bytes32,
        builder: bytes32,
        signature: bytes,
    }),
    makerOrders: array(struct({
        salt: uint256,
        maker: address,
        signer: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        side: uint8,
        signatureType: uint8,
        timestamp: uint256,
        metadata: bytes32,
        builder: bytes32,
        signature: bytes,
    })),
    makerFillAmounts: array(uint256),
    makerFeeAmounts: array(uint256),
    takerAmounts: struct({
        takerFillAmount: uint256,
        takerReceiveAmount: uint256,
        takerFeeAmount: uint256,
    }),
    combinatorialLegs: array(uint256),
})
export type MatchOrdersAndPrepareCombinatorialParams = FunctionArguments<typeof matchOrdersAndPrepareCombinatorial>
export type MatchOrdersAndPrepareCombinatorialReturn = FunctionReturn<typeof matchOrdersAndPrepareCombinatorial>

/** onERC1155BatchReceived(address,address,uint256[],uint256[],bytes) */
export const onERC1155BatchReceived = func('0xbc197c81', {
    _0: address,
    _1: address,
    _2: array(uint256),
    _3: array(uint256),
    _4: bytes,
}, bytes4)
export type OnERC1155BatchReceivedParams = FunctionArguments<typeof onERC1155BatchReceived>
export type OnERC1155BatchReceivedReturn = FunctionReturn<typeof onERC1155BatchReceived>

/** onERC1155Received(address,address,uint256,uint256,bytes) */
export const onERC1155Received = func('0xf23a6e61', {
    _0: address,
    _1: address,
    _2: uint256,
    _3: uint256,
    _4: bytes,
}, bytes4)
export type OnERC1155ReceivedParams = FunctionArguments<typeof onERC1155Received>
export type OnERC1155ReceivedReturn = FunctionReturn<typeof onERC1155Received>

/** orderStatus(bytes32) */
export const orderStatus = func('0x2dff692d', {
    _0: bytes32,
}, struct({
    filled: bool,
    remaining: uint248,
}))
export type OrderStatusParams = FunctionArguments<typeof orderStatus>
export type OrderStatusReturn = FunctionReturn<typeof orderStatus>

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

/** pauseTrading() */
export const pauseTrading = func('0x1031e36e', {})
export type PauseTradingParams = FunctionArguments<typeof pauseTrading>
export type PauseTradingReturn = FunctionReturn<typeof pauseTrading>

/** pauseUser() */
export const pauseUser = func('0xc0c3132c', {})
export type PauseUserParams = FunctionArguments<typeof pauseUser>
export type PauseUserReturn = FunctionReturn<typeof pauseUser>

/** paused() */
export const paused = func('0x5c975abb', {}, bool)
export type PausedParams = FunctionArguments<typeof paused>
export type PausedReturn = FunctionReturn<typeof paused>

/** preapproveOrder((uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes)) */
export const preapproveOrder = func('0xe3a5ced5', {
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        side: uint8,
        signatureType: uint8,
        timestamp: uint256,
        metadata: bytes32,
        builder: bytes32,
        signature: bytes,
    }),
})
export type PreapproveOrderParams = FunctionArguments<typeof preapproveOrder>
export type PreapproveOrderReturn = FunctionReturn<typeof preapproveOrder>

/** preapproved(bytes32) */
export const preapproved = func('0x7ae5fa19', {
    _0: bytes32,
}, bool)
export type PreapprovedParams = FunctionArguments<typeof preapproved>
export type PreapprovedReturn = FunctionReturn<typeof preapproved>

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

/** removeOperator(address) */
export const removeOperator = func('0xac8a584a', {
    _operator: address,
})
export type RemoveOperatorParams = FunctionArguments<typeof removeOperator>
export type RemoveOperatorReturn = FunctionReturn<typeof removeOperator>

/** renounceOperatorRole() */
export const renounceOperatorRole = func('0x3d6d3598', {})
export type RenounceOperatorRoleParams = FunctionArguments<typeof renounceOperatorRole>
export type RenounceOperatorRoleReturn = FunctionReturn<typeof renounceOperatorRole>

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

/** setUserPauseBlockInterval(uint256) */
export const setUserPauseBlockInterval = func('0xcd4d8cb4', {
    _interval: uint256,
})
export type SetUserPauseBlockIntervalParams = FunctionArguments<typeof setUserPauseBlockInterval>
export type SetUserPauseBlockIntervalReturn = FunctionReturn<typeof setUserPauseBlockInterval>

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

/** unpauseTrading() */
export const unpauseTrading = func('0x456068d2', {})
export type UnpauseTradingParams = FunctionArguments<typeof unpauseTrading>
export type UnpauseTradingReturn = FunctionReturn<typeof unpauseTrading>

/** unpauseUser() */
export const unpauseUser = func('0x4cce30c9', {})
export type UnpauseUserParams = FunctionArguments<typeof unpauseUser>
export type UnpauseUserReturn = FunctionReturn<typeof unpauseUser>

/** upgradeToAndCall(address,bytes) */
export const upgradeToAndCall = func('0x4f1ef286', {
    newImplementation: address,
    data: bytes,
})
export type UpgradeToAndCallParams = FunctionArguments<typeof upgradeToAndCall>
export type UpgradeToAndCallReturn = FunctionReturn<typeof upgradeToAndCall>

/** userPauseBlockInterval() */
export const userPauseBlockInterval = func('0xe3bf917a', {}, uint256)
export type UserPauseBlockIntervalParams = FunctionArguments<typeof userPauseBlockInterval>
export type UserPauseBlockIntervalReturn = FunctionReturn<typeof userPauseBlockInterval>

/** userPausedBlockAt(address) */
export const userPausedBlockAt = func('0x234d81b9', {
    _0: address,
}, uint256)
export type UserPausedBlockAtParams = FunctionArguments<typeof userPausedBlockAt>
export type UserPausedBlockAtReturn = FunctionReturn<typeof userPausedBlockAt>

/** validateFee(uint256,uint256) */
export const validateFee = func('0x0ffea65d', {
    fee: uint256,
    cashValue: uint256,
})
export type ValidateFeeParams = FunctionArguments<typeof validateFee>
export type ValidateFeeReturn = FunctionReturn<typeof validateFee>

/** validateOrder((uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes)) */
export const validateOrder = func('0x088170cb', {
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        side: uint8,
        signatureType: uint8,
        timestamp: uint256,
        metadata: bytes32,
        builder: bytes32,
        signature: bytes,
    }),
})
export type ValidateOrderParams = FunctionArguments<typeof validateOrder>
export type ValidateOrderReturn = FunctionReturn<typeof validateOrder>
