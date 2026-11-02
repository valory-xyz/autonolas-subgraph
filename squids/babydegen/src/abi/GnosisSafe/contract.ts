import { ContractBase } from '../abi.support.js'
import { VERSION, approvedHashes, domainSeparator, encodeTransactionData, execTransaction, execTransactionFromModule, execTransactionFromModuleReturnData, getChainId, getMessageHash, getModulesPaginated, getOwners, getStorageAt, getThreshold, getTransactionHash, isModuleEnabled, isOwner, nonce, requiredTxGas, signedMessages } from './functions.js'
import type { ApprovedHashesParams, EncodeTransactionDataParams, ExecTransactionFromModuleParams, ExecTransactionFromModuleReturnDataParams, ExecTransactionParams, GetMessageHashParams, GetModulesPaginatedParams, GetStorageAtParams, GetTransactionHashParams, IsModuleEnabledParams, IsOwnerParams, RequiredTxGasParams, SignedMessagesParams } from './functions.js'

export class Contract extends ContractBase {
    VERSION() {
        return this.eth_call(VERSION, {})
    }

    approvedHashes(_0: ApprovedHashesParams["_0"], _1: ApprovedHashesParams["_1"]) {
        return this.eth_call(approvedHashes, {_0, _1})
    }

    domainSeparator() {
        return this.eth_call(domainSeparator, {})
    }

    encodeTransactionData(to: EncodeTransactionDataParams["to"], value: EncodeTransactionDataParams["value"], data: EncodeTransactionDataParams["data"], operation: EncodeTransactionDataParams["operation"], safeTxGas: EncodeTransactionDataParams["safeTxGas"], baseGas: EncodeTransactionDataParams["baseGas"], gasPrice: EncodeTransactionDataParams["gasPrice"], gasToken: EncodeTransactionDataParams["gasToken"], refundReceiver: EncodeTransactionDataParams["refundReceiver"], _nonce: EncodeTransactionDataParams["_nonce"]) {
        return this.eth_call(encodeTransactionData, {to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, _nonce})
    }

    execTransaction(to: ExecTransactionParams["to"], value: ExecTransactionParams["value"], data: ExecTransactionParams["data"], operation: ExecTransactionParams["operation"], safeTxGas: ExecTransactionParams["safeTxGas"], baseGas: ExecTransactionParams["baseGas"], gasPrice: ExecTransactionParams["gasPrice"], gasToken: ExecTransactionParams["gasToken"], refundReceiver: ExecTransactionParams["refundReceiver"], signatures: ExecTransactionParams["signatures"]) {
        return this.eth_call(execTransaction, {to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures})
    }

    execTransactionFromModule(to: ExecTransactionFromModuleParams["to"], value: ExecTransactionFromModuleParams["value"], data: ExecTransactionFromModuleParams["data"], operation: ExecTransactionFromModuleParams["operation"]) {
        return this.eth_call(execTransactionFromModule, {to, value, data, operation})
    }

    execTransactionFromModuleReturnData(to: ExecTransactionFromModuleReturnDataParams["to"], value: ExecTransactionFromModuleReturnDataParams["value"], data: ExecTransactionFromModuleReturnDataParams["data"], operation: ExecTransactionFromModuleReturnDataParams["operation"]) {
        return this.eth_call(execTransactionFromModuleReturnData, {to, value, data, operation})
    }

    getChainId() {
        return this.eth_call(getChainId, {})
    }

    getMessageHash(message: GetMessageHashParams["message"]) {
        return this.eth_call(getMessageHash, {message})
    }

    getModulesPaginated(start: GetModulesPaginatedParams["start"], pageSize: GetModulesPaginatedParams["pageSize"]) {
        return this.eth_call(getModulesPaginated, {start, pageSize})
    }

    getOwners() {
        return this.eth_call(getOwners, {})
    }

    getStorageAt(offset: GetStorageAtParams["offset"], length: GetStorageAtParams["length"]) {
        return this.eth_call(getStorageAt, {offset, length})
    }

    getThreshold() {
        return this.eth_call(getThreshold, {})
    }

    getTransactionHash(to: GetTransactionHashParams["to"], value: GetTransactionHashParams["value"], data: GetTransactionHashParams["data"], operation: GetTransactionHashParams["operation"], safeTxGas: GetTransactionHashParams["safeTxGas"], baseGas: GetTransactionHashParams["baseGas"], gasPrice: GetTransactionHashParams["gasPrice"], gasToken: GetTransactionHashParams["gasToken"], refundReceiver: GetTransactionHashParams["refundReceiver"], _nonce: GetTransactionHashParams["_nonce"]) {
        return this.eth_call(getTransactionHash, {to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, _nonce})
    }

    isModuleEnabled(module: IsModuleEnabledParams["module"]) {
        return this.eth_call(isModuleEnabled, {module})
    }

    isOwner(owner: IsOwnerParams["owner"]) {
        return this.eth_call(isOwner, {owner})
    }

    nonce() {
        return this.eth_call(nonce, {})
    }

    requiredTxGas(to: RequiredTxGasParams["to"], value: RequiredTxGasParams["value"], data: RequiredTxGasParams["data"], operation: RequiredTxGasParams["operation"]) {
        return this.eth_call(requiredTxGas, {to, value, data, operation})
    }

    signedMessages(_0: SignedMessagesParams["_0"]) {
        return this.eth_call(signedMessages, {_0})
    }
}
