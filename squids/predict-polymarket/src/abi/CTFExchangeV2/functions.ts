import { address, array, bool, bytes, bytes1, bytes32, bytes4, string, struct, uint248, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** PARENT_COLLECTION_ID() */
export const PARENT_COLLECTION_ID = func('0x7afda8b8', {}, bytes32)
export type PARENT_COLLECTION_IDParams = FunctionArguments<typeof PARENT_COLLECTION_ID>
export type PARENT_COLLECTION_IDReturn = FunctionReturn<typeof PARENT_COLLECTION_ID>

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

/** getCollateral() */
export const getCollateral = func('0x5c1548fb', {}, address)
export type GetCollateralParams = FunctionArguments<typeof getCollateral>
export type GetCollateralReturn = FunctionReturn<typeof getCollateral>

/** getCtf() */
export const getCtf = func('0x3b521d78', {}, address)
export type GetCtfParams = FunctionArguments<typeof getCtf>
export type GetCtfReturn = FunctionReturn<typeof getCtf>

/** getCtfCollateral() */
export const getCtfCollateral = func('0x03cee3df', {}, address)
export type GetCtfCollateralParams = FunctionArguments<typeof getCtfCollateral>
export type GetCtfCollateralReturn = FunctionReturn<typeof getCtfCollateral>

/** getFeeReceiver() */
export const getFeeReceiver = func('0xe8a35392', {}, address)
export type GetFeeReceiverParams = FunctionArguments<typeof getFeeReceiver>
export type GetFeeReceiverReturn = FunctionReturn<typeof getFeeReceiver>

/** getMaxFeeRate() */
export const getMaxFeeRate = func('0x4a2a11f5', {}, uint256)
export type GetMaxFeeRateParams = FunctionArguments<typeof getMaxFeeRate>
export type GetMaxFeeRateReturn = FunctionReturn<typeof getMaxFeeRate>

/** getOrderStatus(bytes32) */
export const getOrderStatus = func('0x46423aa7', {
    orderHash: bytes32,
}, struct({
    filled: bool,
    remaining: uint248,
}))
export type GetOrderStatusParams = FunctionArguments<typeof getOrderStatus>
export type GetOrderStatusReturn = FunctionReturn<typeof getOrderStatus>

/** getOutcomeTokenFactory() */
export const getOutcomeTokenFactory = func('0x29cf67f2', {}, address)
export type GetOutcomeTokenFactoryParams = FunctionArguments<typeof getOutcomeTokenFactory>
export type GetOutcomeTokenFactoryReturn = FunctionReturn<typeof getOutcomeTokenFactory>

/** getProxyFactory() */
export const getProxyFactory = func('0xb28c51c0', {}, address)
export type GetProxyFactoryParams = FunctionArguments<typeof getProxyFactory>
export type GetProxyFactoryReturn = FunctionReturn<typeof getProxyFactory>

/** getProxyImplementation() */
export const getProxyImplementation = func('0x90e4b720', {}, address)
export type GetProxyImplementationParams = FunctionArguments<typeof getProxyImplementation>
export type GetProxyImplementationReturn = FunctionReturn<typeof getProxyImplementation>

/** getProxyWalletAddress(address) */
export const getProxyWalletAddress = func('0x58d8b6bb', {
    _addr: address,
}, address)
export type GetProxyWalletAddressParams = FunctionArguments<typeof getProxyWalletAddress>
export type GetProxyWalletAddressReturn = FunctionReturn<typeof getProxyWalletAddress>

/** getSafeFactory() */
export const getSafeFactory = func('0x75d7370a', {}, address)
export type GetSafeFactoryParams = FunctionArguments<typeof getSafeFactory>
export type GetSafeFactoryReturn = FunctionReturn<typeof getSafeFactory>

/** getSafeImplementation() */
export const getSafeImplementation = func('0xe3b59000', {}, address)
export type GetSafeImplementationParams = FunctionArguments<typeof getSafeImplementation>
export type GetSafeImplementationReturn = FunctionReturn<typeof getSafeImplementation>

/** getSafeWalletAddress(address) */
export const getSafeWalletAddress = func('0x70bf48e5', {
    _addr: address,
}, address)
export type GetSafeWalletAddressParams = FunctionArguments<typeof getSafeWalletAddress>
export type GetSafeWalletAddressReturn = FunctionReturn<typeof getSafeWalletAddress>

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
    user: address,
}, bool)
export type IsUserPausedParams = FunctionArguments<typeof isUserPaused>
export type IsUserPausedReturn = FunctionReturn<typeof isUserPaused>

/** matchOrders(bytes32,(uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes),(uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes)[],uint256,uint256[],uint256,uint256[]) */
export const matchOrders = func('0x3c2b4399', {
    conditionId: bytes32,
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
    takerFillAmount: uint256,
    makerFillAmounts: array(uint256),
    takerFeeAmount: uint256,
    makerFeeAmounts: array(uint256),
})
export type MatchOrdersParams = FunctionArguments<typeof matchOrders>
export type MatchOrdersReturn = FunctionReturn<typeof matchOrders>

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

/** setFeeReceiver(address) */
export const setFeeReceiver = func('0xefdcd974', {
    receiver: address,
})
export type SetFeeReceiverParams = FunctionArguments<typeof setFeeReceiver>
export type SetFeeReceiverReturn = FunctionReturn<typeof setFeeReceiver>

/** setMaxFeeRate(uint256) */
export const setMaxFeeRate = func('0x8cda96de', {
    rate: uint256,
})
export type SetMaxFeeRateParams = FunctionArguments<typeof setMaxFeeRate>
export type SetMaxFeeRateReturn = FunctionReturn<typeof setMaxFeeRate>

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

/** unpauseTrading() */
export const unpauseTrading = func('0x456068d2', {})
export type UnpauseTradingParams = FunctionArguments<typeof unpauseTrading>
export type UnpauseTradingReturn = FunctionReturn<typeof unpauseTrading>

/** unpauseUser() */
export const unpauseUser = func('0x4cce30c9', {})
export type UnpauseUserParams = FunctionArguments<typeof unpauseUser>
export type UnpauseUserReturn = FunctionReturn<typeof unpauseUser>

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

/** validateOrderSignature(bytes32,(uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,bytes32,bytes32,bytes)) */
export const validateOrderSignature = func('0xf5db3e4b', {
    orderHash: bytes32,
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
export type ValidateOrderSignatureParams = FunctionArguments<typeof validateOrderSignature>
export type ValidateOrderSignatureReturn = FunctionReturn<typeof validateOrderSignature>
