import { address, array, bool, bytes, bytes32, bytes4, struct, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** addAdmin(address) */
export const addAdmin = func('0x70480275', {
    admin_: address,
})
export type AddAdminParams = FunctionArguments<typeof addAdmin>
export type AddAdminReturn = FunctionReturn<typeof addAdmin>

/** addOperator(address) */
export const addOperator = func('0x9870d7fe', {
    operator_: address,
})
export type AddOperatorParams = FunctionArguments<typeof addOperator>
export type AddOperatorReturn = FunctionReturn<typeof addOperator>

/** admins(address) */
export const admins = func('0x429b62e5', {
    _0: address,
}, uint256)
export type AdminsParams = FunctionArguments<typeof admins>
export type AdminsReturn = FunctionReturn<typeof admins>

/** cancelOrder((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)) */
export const cancelOrder = func('0xa6dfcf86', {
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    }),
})
export type CancelOrderParams = FunctionArguments<typeof cancelOrder>
export type CancelOrderReturn = FunctionReturn<typeof cancelOrder>

/** cancelOrders((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)[]) */
export const cancelOrders = func('0xfa950b48', {
    orders: array(struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    })),
})
export type CancelOrdersParams = FunctionArguments<typeof cancelOrders>
export type CancelOrdersReturn = FunctionReturn<typeof cancelOrders>

/** domainSeparator() */
export const domainSeparator = func('0xf698da25', {}, bytes32)
export type DomainSeparatorParams = FunctionArguments<typeof domainSeparator>
export type DomainSeparatorReturn = FunctionReturn<typeof domainSeparator>

/** fillOrder((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes),uint256) */
export const fillOrder = func('0xfe729aaf', {
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    }),
    fillAmount: uint256,
})
export type FillOrderParams = FunctionArguments<typeof fillOrder>
export type FillOrderReturn = FunctionReturn<typeof fillOrder>

/** fillOrders((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)[],uint256[]) */
export const fillOrders = func('0xd798eff6', {
    orders: array(struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    })),
    fillAmounts: array(uint256),
})
export type FillOrdersParams = FunctionArguments<typeof fillOrders>
export type FillOrdersReturn = FunctionReturn<typeof fillOrders>

/** getCollateral() */
export const getCollateral = func('0x5c1548fb', {}, address)
export type GetCollateralParams = FunctionArguments<typeof getCollateral>
export type GetCollateralReturn = FunctionReturn<typeof getCollateral>

/** getComplement(uint256) */
export const getComplement = func('0xa10f3dce', {
    token: uint256,
}, uint256)
export type GetComplementParams = FunctionArguments<typeof getComplement>
export type GetComplementReturn = FunctionReturn<typeof getComplement>

/** getConditionId(uint256) */
export const getConditionId = func('0xd7fb272f', {
    token: uint256,
}, bytes32)
export type GetConditionIdParams = FunctionArguments<typeof getConditionId>
export type GetConditionIdReturn = FunctionReturn<typeof getConditionId>

/** getCtf() */
export const getCtf = func('0x3b521d78', {}, address)
export type GetCtfParams = FunctionArguments<typeof getCtf>
export type GetCtfReturn = FunctionReturn<typeof getCtf>

/** getMaxFeeRate() */
export const getMaxFeeRate = func('0x4a2a11f5', {}, uint256)
export type GetMaxFeeRateParams = FunctionArguments<typeof getMaxFeeRate>
export type GetMaxFeeRateReturn = FunctionReturn<typeof getMaxFeeRate>

/** getOrderStatus(bytes32) */
export const getOrderStatus = func('0x46423aa7', {
    orderHash: bytes32,
}, struct({
    isFilledOrCancelled: bool,
    remaining: uint256,
}))
export type GetOrderStatusParams = FunctionArguments<typeof getOrderStatus>
export type GetOrderStatusReturn = FunctionReturn<typeof getOrderStatus>

/** getPolyProxyFactoryImplementation() */
export const getPolyProxyFactoryImplementation = func('0x06b9d691', {}, address)
export type GetPolyProxyFactoryImplementationParams = FunctionArguments<typeof getPolyProxyFactoryImplementation>
export type GetPolyProxyFactoryImplementationReturn = FunctionReturn<typeof getPolyProxyFactoryImplementation>

/** getPolyProxyWalletAddress(address) */
export const getPolyProxyWalletAddress = func('0xedef7d8e', {
    _addr: address,
}, address)
export type GetPolyProxyWalletAddressParams = FunctionArguments<typeof getPolyProxyWalletAddress>
export type GetPolyProxyWalletAddressReturn = FunctionReturn<typeof getPolyProxyWalletAddress>

/** getProxyFactory() */
export const getProxyFactory = func('0xb28c51c0', {}, address)
export type GetProxyFactoryParams = FunctionArguments<typeof getProxyFactory>
export type GetProxyFactoryReturn = FunctionReturn<typeof getProxyFactory>

/** getSafeAddress(address) */
export const getSafeAddress = func('0xa287bdf1', {
    _addr: address,
}, address)
export type GetSafeAddressParams = FunctionArguments<typeof getSafeAddress>
export type GetSafeAddressReturn = FunctionReturn<typeof getSafeAddress>

/** getSafeFactory() */
export const getSafeFactory = func('0x75d7370a', {}, address)
export type GetSafeFactoryParams = FunctionArguments<typeof getSafeFactory>
export type GetSafeFactoryReturn = FunctionReturn<typeof getSafeFactory>

/** getSafeFactoryImplementation() */
export const getSafeFactoryImplementation = func('0xe03ac3d0', {}, address)
export type GetSafeFactoryImplementationParams = FunctionArguments<typeof getSafeFactoryImplementation>
export type GetSafeFactoryImplementationReturn = FunctionReturn<typeof getSafeFactoryImplementation>

/** hashOrder((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)) */
export const hashOrder = func('0xe50e4f97', {
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    }),
}, bytes32)
export type HashOrderParams = FunctionArguments<typeof hashOrder>
export type HashOrderReturn = FunctionReturn<typeof hashOrder>

/** incrementNonce() */
export const incrementNonce = func('0x627cdcb9', {})
export type IncrementNonceParams = FunctionArguments<typeof incrementNonce>
export type IncrementNonceReturn = FunctionReturn<typeof incrementNonce>

/** isAdmin(address) */
export const isAdmin = func('0x24d7806c', {
    usr: address,
}, bool)
export type IsAdminParams = FunctionArguments<typeof isAdmin>
export type IsAdminReturn = FunctionReturn<typeof isAdmin>

/** isOperator(address) */
export const isOperator = func('0x6d70f7ae', {
    usr: address,
}, bool)
export type IsOperatorParams = FunctionArguments<typeof isOperator>
export type IsOperatorReturn = FunctionReturn<typeof isOperator>

/** isValidNonce(address,uint256) */
export const isValidNonce = func('0x0647ee20', {
    usr: address,
    nonce: uint256,
}, bool)
export type IsValidNonceParams = FunctionArguments<typeof isValidNonce>
export type IsValidNonceReturn = FunctionReturn<typeof isValidNonce>

/** matchOrders((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes),(uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)[],uint256,uint256[]) */
export const matchOrders = func('0xe60f0c05', {
    takerOrder: struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    }),
    makerOrders: array(struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    })),
    takerFillAmount: uint256,
    makerFillAmounts: array(uint256),
})
export type MatchOrdersParams = FunctionArguments<typeof matchOrders>
export type MatchOrdersReturn = FunctionReturn<typeof matchOrders>

/** nonces(address) */
export const nonces = func('0x7ecebe00', {
    _0: address,
}, uint256)
export type NoncesParams = FunctionArguments<typeof nonces>
export type NoncesReturn = FunctionReturn<typeof nonces>

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

/** operators(address) */
export const operators = func('0x13e7c9d8', {
    _0: address,
}, uint256)
export type OperatorsParams = FunctionArguments<typeof operators>
export type OperatorsReturn = FunctionReturn<typeof operators>

/** orderStatus(bytes32) */
export const orderStatus = func('0x2dff692d', {
    _0: bytes32,
}, struct({
    isFilledOrCancelled: bool,
    remaining: uint256,
}))
export type OrderStatusParams = FunctionArguments<typeof orderStatus>
export type OrderStatusReturn = FunctionReturn<typeof orderStatus>

/** parentCollectionId() */
export const parentCollectionId = func('0x44bea37e', {}, bytes32)
export type ParentCollectionIdParams = FunctionArguments<typeof parentCollectionId>
export type ParentCollectionIdReturn = FunctionReturn<typeof parentCollectionId>

/** pauseTrading() */
export const pauseTrading = func('0x1031e36e', {})
export type PauseTradingParams = FunctionArguments<typeof pauseTrading>
export type PauseTradingReturn = FunctionReturn<typeof pauseTrading>

/** paused() */
export const paused = func('0x5c975abb', {}, bool)
export type PausedParams = FunctionArguments<typeof paused>
export type PausedReturn = FunctionReturn<typeof paused>

/** proxyFactory() */
export const proxyFactory = func('0xc10f1a75', {}, address)
export type ProxyFactoryParams = FunctionArguments<typeof proxyFactory>
export type ProxyFactoryReturn = FunctionReturn<typeof proxyFactory>

/** registerToken(uint256,uint256,bytes32) */
export const registerToken = func('0x68c7450f', {
    token: uint256,
    complement: uint256,
    conditionId: bytes32,
})
export type RegisterTokenParams = FunctionArguments<typeof registerToken>
export type RegisterTokenReturn = FunctionReturn<typeof registerToken>

/** registry(uint256) */
export const registry = func('0x5893253c', {
    _0: uint256,
}, struct({
    complement: uint256,
    conditionId: bytes32,
}))
export type RegistryParams = FunctionArguments<typeof registry>
export type RegistryReturn = FunctionReturn<typeof registry>

/** removeAdmin(address) */
export const removeAdmin = func('0x1785f53c', {
    admin: address,
})
export type RemoveAdminParams = FunctionArguments<typeof removeAdmin>
export type RemoveAdminReturn = FunctionReturn<typeof removeAdmin>

/** removeOperator(address) */
export const removeOperator = func('0xac8a584a', {
    operator: address,
})
export type RemoveOperatorParams = FunctionArguments<typeof removeOperator>
export type RemoveOperatorReturn = FunctionReturn<typeof removeOperator>

/** renounceAdminRole() */
export const renounceAdminRole = func('0x83b8a5ae', {})
export type RenounceAdminRoleParams = FunctionArguments<typeof renounceAdminRole>
export type RenounceAdminRoleReturn = FunctionReturn<typeof renounceAdminRole>

/** renounceOperatorRole() */
export const renounceOperatorRole = func('0x3d6d3598', {})
export type RenounceOperatorRoleParams = FunctionArguments<typeof renounceOperatorRole>
export type RenounceOperatorRoleReturn = FunctionReturn<typeof renounceOperatorRole>

/** safeFactory() */
export const safeFactory = func('0x131e7e1c', {}, address)
export type SafeFactoryParams = FunctionArguments<typeof safeFactory>
export type SafeFactoryReturn = FunctionReturn<typeof safeFactory>

/** setProxyFactory(address) */
export const setProxyFactory = func('0xfbddd751', {
    _newProxyFactory: address,
})
export type SetProxyFactoryParams = FunctionArguments<typeof setProxyFactory>
export type SetProxyFactoryReturn = FunctionReturn<typeof setProxyFactory>

/** setSafeFactory(address) */
export const setSafeFactory = func('0x4544f055', {
    _newSafeFactory: address,
})
export type SetSafeFactoryParams = FunctionArguments<typeof setSafeFactory>
export type SetSafeFactoryReturn = FunctionReturn<typeof setSafeFactory>

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

/** validateComplement(uint256,uint256) */
export const validateComplement = func('0xd82da838', {
    token: uint256,
    complement: uint256,
})
export type ValidateComplementParams = FunctionArguments<typeof validateComplement>
export type ValidateComplementReturn = FunctionReturn<typeof validateComplement>

/** validateOrder((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)) */
export const validateOrder = func('0x654f0ce4', {
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    }),
})
export type ValidateOrderParams = FunctionArguments<typeof validateOrder>
export type ValidateOrderReturn = FunctionReturn<typeof validateOrder>

/** validateOrderSignature(bytes32,(uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)) */
export const validateOrderSignature = func('0xe2eec405', {
    orderHash: bytes32,
    order: struct({
        salt: uint256,
        maker: address,
        signer: address,
        taker: address,
        tokenId: uint256,
        makerAmount: uint256,
        takerAmount: uint256,
        expiration: uint256,
        nonce: uint256,
        feeRateBps: uint256,
        side: uint8,
        signatureType: uint8,
        signature: bytes,
    }),
})
export type ValidateOrderSignatureParams = FunctionArguments<typeof validateOrderSignature>
export type ValidateOrderSignatureReturn = FunctionReturn<typeof validateOrderSignature>

/** validateTokenId(uint256) */
export const validateTokenId = func('0x34600901', {
    tokenId: uint256,
})
export type ValidateTokenIdParams = FunctionArguments<typeof validateTokenId>
export type ValidateTokenIdReturn = FunctionReturn<typeof validateTokenId>
