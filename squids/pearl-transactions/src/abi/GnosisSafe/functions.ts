import { address, array, bool, bytes, bytes32, string, struct, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** addOwnerWithThreshold(address,uint256) */
export const addOwnerWithThreshold = func('0x0d582f13', {
    owner: address,
    _threshold: uint256,
})
export type AddOwnerWithThresholdParams = FunctionArguments<typeof addOwnerWithThreshold>
export type AddOwnerWithThresholdReturn = FunctionReturn<typeof addOwnerWithThreshold>

/** approveHash(bytes32) */
export const approveHash = func('0xd4d9bdcd', {
    hashToApprove: bytes32,
})
export type ApproveHashParams = FunctionArguments<typeof approveHash>
export type ApproveHashReturn = FunctionReturn<typeof approveHash>

/** approvedHashes(address,bytes32) */
export const approvedHashes = func('0x7d832974', {
    _0: address,
    _1: bytes32,
}, uint256)
export type ApprovedHashesParams = FunctionArguments<typeof approvedHashes>
export type ApprovedHashesReturn = FunctionReturn<typeof approvedHashes>

/** changeThreshold(uint256) */
export const changeThreshold = func('0x694e80c3', {
    _threshold: uint256,
})
export type ChangeThresholdParams = FunctionArguments<typeof changeThreshold>
export type ChangeThresholdReturn = FunctionReturn<typeof changeThreshold>

/** checkNSignatures(bytes32,bytes,bytes,uint256) */
export const checkNSignatures = func('0x12fb68e0', {
    dataHash: bytes32,
    data: bytes,
    signatures: bytes,
    requiredSignatures: uint256,
})
export type CheckNSignaturesParams = FunctionArguments<typeof checkNSignatures>
export type CheckNSignaturesReturn = FunctionReturn<typeof checkNSignatures>

/** checkSignatures(bytes32,bytes,bytes) */
export const checkSignatures = func('0x934f3a11', {
    dataHash: bytes32,
    data: bytes,
    signatures: bytes,
})
export type CheckSignaturesParams = FunctionArguments<typeof checkSignatures>
export type CheckSignaturesReturn = FunctionReturn<typeof checkSignatures>

/** disableModule(address,address) */
export const disableModule = func('0xe009cfde', {
    prevModule: address,
    module: address,
})
export type DisableModuleParams = FunctionArguments<typeof disableModule>
export type DisableModuleReturn = FunctionReturn<typeof disableModule>

/** domainSeparator() */
export const domainSeparator = func('0xf698da25', {}, bytes32)
export type DomainSeparatorParams = FunctionArguments<typeof domainSeparator>
export type DomainSeparatorReturn = FunctionReturn<typeof domainSeparator>

/** enableModule(address) */
export const enableModule = func('0x610b5925', {
    module: address,
})
export type EnableModuleParams = FunctionArguments<typeof enableModule>
export type EnableModuleReturn = FunctionReturn<typeof enableModule>

/** encodeTransactionData(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) */
export const encodeTransactionData = func('0xe86637db', {
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
    safeTxGas: uint256,
    baseGas: uint256,
    gasPrice: uint256,
    gasToken: address,
    refundReceiver: address,
    _nonce: uint256,
}, bytes)
export type EncodeTransactionDataParams = FunctionArguments<typeof encodeTransactionData>
export type EncodeTransactionDataReturn = FunctionReturn<typeof encodeTransactionData>

/** execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) */
export const execTransaction = func('0x6a761202', {
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
    safeTxGas: uint256,
    baseGas: uint256,
    gasPrice: uint256,
    gasToken: address,
    refundReceiver: address,
    signatures: bytes,
}, bool)
export type ExecTransactionParams = FunctionArguments<typeof execTransaction>
export type ExecTransactionReturn = FunctionReturn<typeof execTransaction>

/** execTransactionFromModule(address,uint256,bytes,uint8) */
export const execTransactionFromModule = func('0x468721a7', {
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
}, bool)
export type ExecTransactionFromModuleParams = FunctionArguments<typeof execTransactionFromModule>
export type ExecTransactionFromModuleReturn = FunctionReturn<typeof execTransactionFromModule>

/** execTransactionFromModuleReturnData(address,uint256,bytes,uint8) */
export const execTransactionFromModuleReturnData = func('0x5229073f', {
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
}, struct({
    success: bool,
    returnData: bytes,
}))
export type ExecTransactionFromModuleReturnDataParams = FunctionArguments<typeof execTransactionFromModuleReturnData>
export type ExecTransactionFromModuleReturnDataReturn = FunctionReturn<typeof execTransactionFromModuleReturnData>

/** getChainId() */
export const getChainId = func('0x3408e470', {}, uint256)
export type GetChainIdParams = FunctionArguments<typeof getChainId>
export type GetChainIdReturn = FunctionReturn<typeof getChainId>

/** getMessageHash(bytes) */
export const getMessageHash = func('0x0a1028c4', {
    message: bytes,
}, bytes32)
export type GetMessageHashParams = FunctionArguments<typeof getMessageHash>
export type GetMessageHashReturn = FunctionReturn<typeof getMessageHash>

/** getModulesPaginated(address,uint256) */
export const getModulesPaginated = func('0xcc2f8452', {
    start: address,
    pageSize: uint256,
}, struct({
    array: array(address),
    next: address,
}))
export type GetModulesPaginatedParams = FunctionArguments<typeof getModulesPaginated>
export type GetModulesPaginatedReturn = FunctionReturn<typeof getModulesPaginated>

/** getOwners() */
export const getOwners = func('0xa0e67e2b', {}, array(address))
export type GetOwnersParams = FunctionArguments<typeof getOwners>
export type GetOwnersReturn = FunctionReturn<typeof getOwners>

/** getStorageAt(uint256,uint256) */
export const getStorageAt = func('0x5624b25b', {
    offset: uint256,
    length: uint256,
}, bytes)
export type GetStorageAtParams = FunctionArguments<typeof getStorageAt>
export type GetStorageAtReturn = FunctionReturn<typeof getStorageAt>

/** getThreshold() */
export const getThreshold = func('0xe75235b8', {}, uint256)
export type GetThresholdParams = FunctionArguments<typeof getThreshold>
export type GetThresholdReturn = FunctionReturn<typeof getThreshold>

/** getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) */
export const getTransactionHash = func('0xd8d11f78', {
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
    safeTxGas: uint256,
    baseGas: uint256,
    gasPrice: uint256,
    gasToken: address,
    refundReceiver: address,
    _nonce: uint256,
}, bytes32)
export type GetTransactionHashParams = FunctionArguments<typeof getTransactionHash>
export type GetTransactionHashReturn = FunctionReturn<typeof getTransactionHash>

/** isModuleEnabled(address) */
export const isModuleEnabled = func('0x2d9ad53d', {
    module: address,
}, bool)
export type IsModuleEnabledParams = FunctionArguments<typeof isModuleEnabled>
export type IsModuleEnabledReturn = FunctionReturn<typeof isModuleEnabled>

/** isOwner(address) */
export const isOwner = func('0x2f54bf6e', {
    owner: address,
}, bool)
export type IsOwnerParams = FunctionArguments<typeof isOwner>
export type IsOwnerReturn = FunctionReturn<typeof isOwner>

/** nonce() */
export const nonce = func('0xaffed0e0', {}, uint256)
export type NonceParams = FunctionArguments<typeof nonce>
export type NonceReturn = FunctionReturn<typeof nonce>

/** removeOwner(address,address,uint256) */
export const removeOwner = func('0xf8dc5dd9', {
    prevOwner: address,
    owner: address,
    _threshold: uint256,
})
export type RemoveOwnerParams = FunctionArguments<typeof removeOwner>
export type RemoveOwnerReturn = FunctionReturn<typeof removeOwner>

/** requiredTxGas(address,uint256,bytes,uint8) */
export const requiredTxGas = func('0xc4ca3a9c', {
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
}, uint256)
export type RequiredTxGasParams = FunctionArguments<typeof requiredTxGas>
export type RequiredTxGasReturn = FunctionReturn<typeof requiredTxGas>

/** setFallbackHandler(address) */
export const setFallbackHandler = func('0xf08a0323', {
    handler: address,
})
export type SetFallbackHandlerParams = FunctionArguments<typeof setFallbackHandler>
export type SetFallbackHandlerReturn = FunctionReturn<typeof setFallbackHandler>

/** setGuard(address) */
export const setGuard = func('0xe19a9dd9', {
    guard: address,
})
export type SetGuardParams = FunctionArguments<typeof setGuard>
export type SetGuardReturn = FunctionReturn<typeof setGuard>

/** setup(address[],uint256,address,bytes,address,address,uint256,address) */
export const setup = func('0xb63e800d', {
    _owners: array(address),
    _threshold: uint256,
    to: address,
    data: bytes,
    fallbackHandler: address,
    paymentToken: address,
    payment: uint256,
    paymentReceiver: address,
})
export type SetupParams = FunctionArguments<typeof setup>
export type SetupReturn = FunctionReturn<typeof setup>

/** signMessage(bytes) */
export const signMessage = func('0x85a5affe', {
    _data: bytes,
})
export type SignMessageParams = FunctionArguments<typeof signMessage>
export type SignMessageReturn = FunctionReturn<typeof signMessage>

/** signedMessages(bytes32) */
export const signedMessages = func('0x5ae6bd37', {
    _0: bytes32,
}, uint256)
export type SignedMessagesParams = FunctionArguments<typeof signedMessages>
export type SignedMessagesReturn = FunctionReturn<typeof signedMessages>

/** simulateAndRevert(address,bytes) */
export const simulateAndRevert = func('0xb4faba09', {
    targetContract: address,
    calldataPayload: bytes,
})
export type SimulateAndRevertParams = FunctionArguments<typeof simulateAndRevert>
export type SimulateAndRevertReturn = FunctionReturn<typeof simulateAndRevert>

/** swapOwner(address,address,address) */
export const swapOwner = func('0xe318b52b', {
    prevOwner: address,
    oldOwner: address,
    newOwner: address,
})
export type SwapOwnerParams = FunctionArguments<typeof swapOwner>
export type SwapOwnerReturn = FunctionReturn<typeof swapOwner>
