import { address, array, bool, bytes, bytes32, bytes4, string, struct, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** PAYMENT_TYPE() */
export const PAYMENT_TYPE = func('0xecf050e3', {}, bytes32)
export type PAYMENT_TYPEParams = FunctionArguments<typeof PAYMENT_TYPE>
export type PAYMENT_TYPEReturn = FunctionReturn<typeof PAYMENT_TYPE>

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** changeMaxDeliveryRate(uint256) */
export const changeMaxDeliveryRate = func('0x00f20c71', {
    newMaxDeliveryRate: uint256,
})
export type ChangeMaxDeliveryRateParams = FunctionArguments<typeof changeMaxDeliveryRate>
export type ChangeMaxDeliveryRateReturn = FunctionReturn<typeof changeMaxDeliveryRate>

/** deliverMarketplaceWithSignatures(address,(bytes,bytes,bytes)[],uint256[],bytes) */
export const deliverMarketplaceWithSignatures = func('0x4e894dd1', {
    requester: address,
    deliverWithSignatures: array(struct({
        requestData: bytes,
        signature: bytes,
        deliveryData: bytes,
    })),
    deliveryRates: array(uint256),
    paymentData: bytes,
})
export type DeliverMarketplaceWithSignaturesParams = FunctionArguments<typeof deliverMarketplaceWithSignatures>
export type DeliverMarketplaceWithSignaturesReturn = FunctionReturn<typeof deliverMarketplaceWithSignatures>

/** deliverToMarketplace(bytes32[],bytes[]) */
export const deliverToMarketplace = func('0x6f6885bb', {
    requestIds: array(bytes32),
    datas: array(bytes),
}, array(bool))
export type DeliverToMarketplaceParams = FunctionArguments<typeof deliverToMarketplace>
export type DeliverToMarketplaceReturn = FunctionReturn<typeof deliverToMarketplace>

/** entryPoint() */
export const entryPoint = func('0xb0d691fe', {}, address)
export type EntryPointParams = FunctionArguments<typeof entryPoint>
export type EntryPointReturn = FunctionReturn<typeof entryPoint>

/** exec(address,uint256,bytes,uint8,uint256) */
export const exec = func('0xc7dec3fc', {
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
    txGas: uint256,
}, bytes)
export type ExecParams = FunctionArguments<typeof exec>
export type ExecReturn = FunctionReturn<typeof exec>

/** getOperator() */
export const getOperator = func('0xe7f43c68', {}, address)
export type GetOperatorParams = FunctionArguments<typeof getOperator>
export type GetOperatorReturn = FunctionReturn<typeof getOperator>

/** getUndeliveredRequestIds(uint256,uint256) */
export const getUndeliveredRequestIds = func('0x58ce0909', {
    size: uint256,
    offset: uint256,
}, array(bytes32))
export type GetUndeliveredRequestIdsParams = FunctionArguments<typeof getUndeliveredRequestIds>
export type GetUndeliveredRequestIdsReturn = FunctionReturn<typeof getUndeliveredRequestIds>

/** isOperator(address) */
export const isOperator = func('0x6d70f7ae', {
    multisig: address,
}, bool)
export type IsOperatorParams = FunctionArguments<typeof isOperator>
export type IsOperatorReturn = FunctionReturn<typeof isOperator>

/** isValidSignature(bytes32,bytes) */
export const isValidSignature = func('0x1626ba7e', {
    hash: bytes32,
    signature: bytes,
}, bytes4)
export type IsValidSignatureParams = FunctionArguments<typeof isValidSignature>
export type IsValidSignatureReturn = FunctionReturn<typeof isValidSignature>

/** mapRequestIds(bytes32,uint256) */
export const mapRequestIds = func('0xc2825d92', {
    _0: bytes32,
    _1: uint256,
}, bytes32)
export type MapRequestIdsParams = FunctionArguments<typeof mapRequestIds>
export type MapRequestIdsReturn = FunctionReturn<typeof mapRequestIds>

/** maxDeliveryRate() */
export const maxDeliveryRate = func('0x2cc0fcb2', {}, uint256)
export type MaxDeliveryRateParams = FunctionArguments<typeof maxDeliveryRate>
export type MaxDeliveryRateReturn = FunctionReturn<typeof maxDeliveryRate>

/** mechMarketplace() */
export const mechMarketplace = func('0x9c5e9590', {}, address)
export type MechMarketplaceParams = FunctionArguments<typeof mechMarketplace>
export type MechMarketplaceReturn = FunctionReturn<typeof mechMarketplace>

/** nonce() */
export const nonce = func('0xaffed0e0', {}, uint256)
export type NonceParams = FunctionArguments<typeof nonce>
export type NonceReturn = FunctionReturn<typeof nonce>

/** numTotalDeliveries() */
export const numTotalDeliveries = func('0xa669aaf9', {}, uint256)
export type NumTotalDeliveriesParams = FunctionArguments<typeof numTotalDeliveries>
export type NumTotalDeliveriesReturn = FunctionReturn<typeof numTotalDeliveries>

/** numTotalRequests() */
export const numTotalRequests = func('0x4ada3e61', {}, uint256)
export type NumTotalRequestsParams = FunctionArguments<typeof numTotalRequests>
export type NumTotalRequestsReturn = FunctionReturn<typeof numTotalRequests>

/** numUndeliveredRequests() */
export const numUndeliveredRequests = func('0xbdf86317', {}, uint256)
export type NumUndeliveredRequestsParams = FunctionArguments<typeof numUndeliveredRequests>
export type NumUndeliveredRequestsReturn = FunctionReturn<typeof numUndeliveredRequests>

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

/** onERC721Received(address,address,uint256,bytes) */
export const onERC721Received = func('0x150b7a02', {
    _0: address,
    _1: address,
    _2: uint256,
    _3: bytes,
}, bytes4)
export type OnERC721ReceivedParams = FunctionArguments<typeof onERC721Received>
export type OnERC721ReceivedReturn = FunctionReturn<typeof onERC721Received>

/** paymentType() */
export const paymentType = func('0x2763b8da', {}, bytes32)
export type PaymentTypeParams = FunctionArguments<typeof paymentType>
export type PaymentTypeReturn = FunctionReturn<typeof paymentType>

/** requestFromMarketplace(bytes32[],bytes[]) */
export const requestFromMarketplace = func('0xbe2641de', {
    requestIds: array(bytes32),
    datas: array(bytes),
})
export type RequestFromMarketplaceParams = FunctionArguments<typeof requestFromMarketplace>
export type RequestFromMarketplaceReturn = FunctionReturn<typeof requestFromMarketplace>

/** serviceId() */
export const serviceId = func('0xda20ec6a', {}, uint256)
export type ServiceIdParams = FunctionArguments<typeof serviceId>
export type ServiceIdReturn = FunctionReturn<typeof serviceId>

/** serviceRegistry() */
export const serviceRegistry = func('0xcbcf252a', {}, address)
export type ServiceRegistryParams = FunctionArguments<typeof serviceRegistry>
export type ServiceRegistryReturn = FunctionReturn<typeof serviceRegistry>

/** setUp(bytes) */
export const setUp = func('0xa4f9edbf', {
    _0: bytes,
})
export type SetUpParams = FunctionArguments<typeof setUp>
export type SetUpReturn = FunctionReturn<typeof setUp>

/** token() */
export const token = func('0xfc0c546a', {}, address)
export type TokenParams = FunctionArguments<typeof token>
export type TokenReturn = FunctionReturn<typeof token>

/** tokenId() */
export const tokenId = func('0x17d70f7c', {}, uint256)
export type TokenIdParams = FunctionArguments<typeof tokenId>
export type TokenIdReturn = FunctionReturn<typeof tokenId>

/** tokensReceived(address,address,address,uint256,bytes,bytes) */
export const tokensReceived = func('0x0023de29', {
    _0: address,
    _1: address,
    _2: address,
    _3: uint256,
    _4: bytes,
    _5: bytes,
})
export type TokensReceivedParams = FunctionArguments<typeof tokensReceived>
export type TokensReceivedReturn = FunctionReturn<typeof tokensReceived>

/** updateNumRequests(uint256) */
export const updateNumRequests = func('0x9680b603', {
    numRequests: uint256,
})
export type UpdateNumRequestsParams = FunctionArguments<typeof updateNumRequests>
export type UpdateNumRequestsReturn = FunctionReturn<typeof updateNumRequests>

/** validateUserOp((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes),bytes32,uint256) */
export const validateUserOp = func('0x3a871cdd', {
    userOp: struct({
        sender: address,
        nonce: uint256,
        initCode: bytes,
        callData: bytes,
        callGasLimit: uint256,
        verificationGasLimit: uint256,
        preVerificationGas: uint256,
        maxFeePerGas: uint256,
        maxPriorityFeePerGas: uint256,
        paymasterAndData: bytes,
        signature: bytes,
    }),
    userOpHash: bytes32,
    missingAccountFunds: uint256,
}, uint256)
export type ValidateUserOpParams = FunctionArguments<typeof validateUserOp>
export type ValidateUserOpReturn = FunctionReturn<typeof validateUserOp>
