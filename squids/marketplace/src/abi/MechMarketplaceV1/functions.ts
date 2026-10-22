import { address, array, bool, bytes, bytes32, string, struct, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** DOMAIN_SEPARATOR_TYPE_HASH() */
export const DOMAIN_SEPARATOR_TYPE_HASH = func('0xf5dcb7bb', {}, bytes32)
export type DOMAIN_SEPARATOR_TYPE_HASHParams = FunctionArguments<typeof DOMAIN_SEPARATOR_TYPE_HASH>
export type DOMAIN_SEPARATOR_TYPE_HASHReturn = FunctionReturn<typeof DOMAIN_SEPARATOR_TYPE_HASH>

/** MAX_FEE_FACTOR() */
export const MAX_FEE_FACTOR = func('0xaf4937fc', {}, uint256)
export type MAX_FEE_FACTORParams = FunctionArguments<typeof MAX_FEE_FACTOR>
export type MAX_FEE_FACTORReturn = FunctionReturn<typeof MAX_FEE_FACTOR>

/** MECH_MARKETPLACE_PROXY() */
export const MECH_MARKETPLACE_PROXY = func('0xe8eca22d', {}, bytes32)
export type MECH_MARKETPLACE_PROXYParams = FunctionArguments<typeof MECH_MARKETPLACE_PROXY>
export type MECH_MARKETPLACE_PROXYReturn = FunctionReturn<typeof MECH_MARKETPLACE_PROXY>

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** chainId() */
export const chainId = func('0x9a8a0592', {}, uint256)
export type ChainIdParams = FunctionArguments<typeof chainId>
export type ChainIdReturn = FunctionReturn<typeof chainId>

/** changeImplementation(address) */
export const changeImplementation = func('0x17a68dd8', {
    newImplementation: address,
})
export type ChangeImplementationParams = FunctionArguments<typeof changeImplementation>
export type ChangeImplementationReturn = FunctionReturn<typeof changeImplementation>

/** changeMarketplaceParams(uint256,uint256,uint256) */
export const changeMarketplaceParams = func('0x57c0762d', {
    newFee: uint256,
    newMinResponseTimeout: uint256,
    newMaxResponseTimeout: uint256,
})
export type ChangeMarketplaceParamsParams = FunctionArguments<typeof changeMarketplaceParams>
export type ChangeMarketplaceParamsReturn = FunctionReturn<typeof changeMarketplaceParams>

/** changeOwner(address) */
export const changeOwner = func('0xa6f9dae1', {
    newOwner: address,
})
export type ChangeOwnerParams = FunctionArguments<typeof changeOwner>
export type ChangeOwnerReturn = FunctionReturn<typeof changeOwner>

/** checkMech(address) */
export const checkMech = func('0x2685937b', {
    mech: address,
}, address)
export type CheckMechParams = FunctionArguments<typeof checkMech>
export type CheckMechReturn = FunctionReturn<typeof checkMech>

/** create(uint256,address,bytes) */
export const create = func('0x46fbcbb2', {
    serviceId: uint256,
    mechFactory: address,
    payload: bytes,
}, address)
export type CreateParams = FunctionArguments<typeof create>
export type CreateReturn = FunctionReturn<typeof create>

/** deliverMarketplace(bytes32[],uint256[]) */
export const deliverMarketplace = func('0x9e592bb9', {
    requestIds: array(bytes32),
    deliveryRates: array(uint256),
}, array(bool))
export type DeliverMarketplaceParams = FunctionArguments<typeof deliverMarketplace>
export type DeliverMarketplaceReturn = FunctionReturn<typeof deliverMarketplace>

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

/** domainSeparator() */
export const domainSeparator = func('0xf698da25', {}, bytes32)
export type DomainSeparatorParams = FunctionArguments<typeof domainSeparator>
export type DomainSeparatorReturn = FunctionReturn<typeof domainSeparator>

/** fee() */
export const fee = func('0xddca3f43', {}, uint256)
export type FeeParams = FunctionArguments<typeof fee>
export type FeeReturn = FunctionReturn<typeof fee>

/** getDomainSeparator() */
export const getDomainSeparator = func('0xed24911d', {}, bytes32)
export type GetDomainSeparatorParams = FunctionArguments<typeof getDomainSeparator>
export type GetDomainSeparatorReturn = FunctionReturn<typeof getDomainSeparator>

/** getRequestId(address,address,bytes,uint256,bytes32,uint256) */
export const getRequestId = func('0x7ecb65f6', {
    mech: address,
    requester: address,
    data: bytes,
    deliveryRate: uint256,
    paymentType: bytes32,
    nonce: uint256,
}, bytes32)
export type GetRequestIdParams = FunctionArguments<typeof getRequestId>
export type GetRequestIdReturn = FunctionReturn<typeof getRequestId>

/** getRequestStatus(bytes32) */
export const getRequestStatus = func('0x45d07664', {
    requestId: bytes32,
}, uint8)
export type GetRequestStatusParams = FunctionArguments<typeof getRequestStatus>
export type GetRequestStatusReturn = FunctionReturn<typeof getRequestStatus>

/** initialize(uint256,uint256,uint256) */
export const initialize = func('0x80d85911', {
    _fee: uint256,
    _minResponseTimeout: uint256,
    _maxResponseTimeout: uint256,
})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** karma() */
export const karma = func('0x74a8569b', {}, address)
export type KarmaParams = FunctionArguments<typeof karma>
export type KarmaReturn = FunctionReturn<typeof karma>

/** mapAgentMechFactories(address) */
export const mapAgentMechFactories = func('0xc69f6f9f', {
    _0: address,
}, address)
export type MapAgentMechFactoriesParams = FunctionArguments<typeof mapAgentMechFactories>
export type MapAgentMechFactoriesReturn = FunctionReturn<typeof mapAgentMechFactories>

/** mapDeliveryCounts(address) */
export const mapDeliveryCounts = func('0x00427c54', {
    _0: address,
}, uint256)
export type MapDeliveryCountsParams = FunctionArguments<typeof mapDeliveryCounts>
export type MapDeliveryCountsReturn = FunctionReturn<typeof mapDeliveryCounts>

/** mapMechDeliveryCounts(address) */
export const mapMechDeliveryCounts = func('0x176b8b01', {
    _0: address,
}, uint256)
export type MapMechDeliveryCountsParams = FunctionArguments<typeof mapMechDeliveryCounts>
export type MapMechDeliveryCountsReturn = FunctionReturn<typeof mapMechDeliveryCounts>

/** mapMechFactories(address) */
export const mapMechFactories = func('0x13999914', {
    _0: address,
}, bool)
export type MapMechFactoriesParams = FunctionArguments<typeof mapMechFactories>
export type MapMechFactoriesReturn = FunctionReturn<typeof mapMechFactories>

/** mapMechServiceDeliveryCounts(address) */
export const mapMechServiceDeliveryCounts = func('0x43be9643', {
    _0: address,
}, uint256)
export type MapMechServiceDeliveryCountsParams = FunctionArguments<typeof mapMechServiceDeliveryCounts>
export type MapMechServiceDeliveryCountsReturn = FunctionReturn<typeof mapMechServiceDeliveryCounts>

/** mapNonces(address) */
export const mapNonces = func('0xcbd6407a', {
    _0: address,
}, uint256)
export type MapNoncesParams = FunctionArguments<typeof mapNonces>
export type MapNoncesReturn = FunctionReturn<typeof mapNonces>

/** mapPaymentTypeBalanceTrackers(bytes32) */
export const mapPaymentTypeBalanceTrackers = func('0x4eb07dd3', {
    _0: bytes32,
}, address)
export type MapPaymentTypeBalanceTrackersParams = FunctionArguments<typeof mapPaymentTypeBalanceTrackers>
export type MapPaymentTypeBalanceTrackersReturn = FunctionReturn<typeof mapPaymentTypeBalanceTrackers>

/** mapRequestCounts(address) */
export const mapRequestCounts = func('0x1bbbeeb8', {
    _0: address,
}, uint256)
export type MapRequestCountsParams = FunctionArguments<typeof mapRequestCounts>
export type MapRequestCountsReturn = FunctionReturn<typeof mapRequestCounts>

/** mapRequestIdInfos(bytes32) */
export const mapRequestIdInfos = func('0x8342d20e', {
    _0: bytes32,
}, struct({
    priorityMech: address,
    deliveryMech: address,
    requester: address,
    responseTimeout: uint256,
    deliveryRate: uint256,
    paymentType: bytes32,
}))
export type MapRequestIdInfosParams = FunctionArguments<typeof mapRequestIdInfos>
export type MapRequestIdInfosReturn = FunctionReturn<typeof mapRequestIdInfos>

/** maxResponseTimeout() */
export const maxResponseTimeout = func('0xded81286', {}, uint256)
export type MaxResponseTimeoutParams = FunctionArguments<typeof maxResponseTimeout>
export type MaxResponseTimeoutReturn = FunctionReturn<typeof maxResponseTimeout>

/** minResponseTimeout() */
export const minResponseTimeout = func('0x0f41196a', {}, uint256)
export type MinResponseTimeoutParams = FunctionArguments<typeof minResponseTimeout>
export type MinResponseTimeoutReturn = FunctionReturn<typeof minResponseTimeout>

/** numMechs() */
export const numMechs = func('0xe0cb19e8', {}, uint256)
export type NumMechsParams = FunctionArguments<typeof numMechs>
export type NumMechsReturn = FunctionReturn<typeof numMechs>

/** numTotalRequests() */
export const numTotalRequests = func('0x4ada3e61', {}, uint256)
export type NumTotalRequestsParams = FunctionArguments<typeof numTotalRequests>
export type NumTotalRequestsReturn = FunctionReturn<typeof numTotalRequests>

/** numUndeliveredRequests() */
export const numUndeliveredRequests = func('0xbdf86317', {}, uint256)
export type NumUndeliveredRequestsParams = FunctionArguments<typeof numUndeliveredRequests>
export type NumUndeliveredRequestsReturn = FunctionReturn<typeof numUndeliveredRequests>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** request(bytes,uint256,bytes32,address,uint256,bytes) */
export const request = func('0xf6938b09', {
    requestData: bytes,
    maxDeliveryRate: uint256,
    paymentType: bytes32,
    priorityMech: address,
    responseTimeout: uint256,
    paymentData: bytes,
}, bytes32)
export type RequestParams = FunctionArguments<typeof request>
export type RequestReturn = FunctionReturn<typeof request>

/** requestBatch(bytes[],uint256,bytes32,address,uint256,bytes) */
export const requestBatch = func('0xc7b6a9f0', {
    requestDatas: array(bytes),
    maxDeliveryRate: uint256,
    paymentType: bytes32,
    priorityMech: address,
    responseTimeout: uint256,
    paymentData: bytes,
}, array(bytes32))
export type RequestBatchParams = FunctionArguments<typeof requestBatch>
export type RequestBatchReturn = FunctionReturn<typeof requestBatch>

/** serviceRegistry() */
export const serviceRegistry = func('0xcbcf252a', {}, address)
export type ServiceRegistryParams = FunctionArguments<typeof serviceRegistry>
export type ServiceRegistryReturn = FunctionReturn<typeof serviceRegistry>

/** setMechFactoryStatuses(address[],bool[]) */
export const setMechFactoryStatuses = func('0x087f08d4', {
    mechFactories: array(address),
    statuses: array(bool),
})
export type SetMechFactoryStatusesParams = FunctionArguments<typeof setMechFactoryStatuses>
export type SetMechFactoryStatusesReturn = FunctionReturn<typeof setMechFactoryStatuses>

/** setPaymentTypeBalanceTrackers(bytes32[],address[]) */
export const setPaymentTypeBalanceTrackers = func('0xd64bf8b0', {
    paymentTypes: array(bytes32),
    balanceTrackers: array(address),
})
export type SetPaymentTypeBalanceTrackersParams = FunctionArguments<typeof setPaymentTypeBalanceTrackers>
export type SetPaymentTypeBalanceTrackersReturn = FunctionReturn<typeof setPaymentTypeBalanceTrackers>
