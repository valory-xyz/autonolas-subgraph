import { address, array, bytes, bytes32, uint256, uint8 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** AddedOwner(address) */
export const AddedOwner = event('0x9465fa0c962cc76958e6373a993326400c1c94f8be2fe3a952adfa7f60b2ea26', {
    owner: address,
})
export type AddedOwnerEventArgs = EParams<typeof AddedOwner>

/** ApproveHash(bytes32,address) */
export const ApproveHash = event('0xf2a0eb156472d1440255b0d7c1e19cc07115d1051fe605b0dce69acfec884d9c', {
    approvedHash: indexed(bytes32),
    owner: indexed(address),
})
export type ApproveHashEventArgs = EParams<typeof ApproveHash>

/** ChangedFallbackHandler(address) */
export const ChangedFallbackHandler = event('0x5ac6c46c93c8d0e53714ba3b53db3e7c046da994313d7ed0d192028bc7c228b0', {
    handler: address,
})
export type ChangedFallbackHandlerEventArgs = EParams<typeof ChangedFallbackHandler>

/** ChangedGuard(address) */
export const ChangedGuard = event('0x1151116914515bc0891ff9047a6cb32cf902546f83066499bcf8ba33d2353fa2', {
    guard: address,
})
export type ChangedGuardEventArgs = EParams<typeof ChangedGuard>

/** ChangedThreshold(uint256) */
export const ChangedThreshold = event('0x610f7ff2b304ae8903c3de74c60c6ab1f7d6226b3f52c5161905bb5ad4039c93', {
    threshold: uint256,
})
export type ChangedThresholdEventArgs = EParams<typeof ChangedThreshold>

/** DisabledModule(address) */
export const DisabledModule = event('0xaab4fa2b463f581b2b32cb3b7e3b704b9ce37cc209b5fb4d77e593ace4054276', {
    module: address,
})
export type DisabledModuleEventArgs = EParams<typeof DisabledModule>

/** EnabledModule(address) */
export const EnabledModule = event('0xecdf3a3effea5783a3c4c2140e677577666428d44ed9d474a0b3a4c9943f8440', {
    module: address,
})
export type EnabledModuleEventArgs = EParams<typeof EnabledModule>

/** ExecutionFailure(bytes32,uint256) */
export const ExecutionFailure = event('0x23428b18acfb3ea64b08dc0c1d296ea9c09702c09083ca5272e64d115b687d23', {
    txHash: bytes32,
    payment: uint256,
})
export type ExecutionFailureEventArgs = EParams<typeof ExecutionFailure>

/** ExecutionFromModuleFailure(address) */
export const ExecutionFromModuleFailure = event('0xacd2c8702804128fdb0db2bb49f6d127dd0181c13fd45dbfe16de0930e2bd375', {
    module: indexed(address),
})
export type ExecutionFromModuleFailureEventArgs = EParams<typeof ExecutionFromModuleFailure>

/** ExecutionFromModuleSuccess(address) */
export const ExecutionFromModuleSuccess = event('0x6895c13664aa4f67288b25d7a21d7aaa34916e355fb9b6fae0a139a9085becb8', {
    module: indexed(address),
})
export type ExecutionFromModuleSuccessEventArgs = EParams<typeof ExecutionFromModuleSuccess>

/** ExecutionSuccess(bytes32,uint256) */
export const ExecutionSuccess = event('0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e', {
    txHash: bytes32,
    payment: uint256,
})
export type ExecutionSuccessEventArgs = EParams<typeof ExecutionSuccess>

/** RemovedOwner(address) */
export const RemovedOwner = event('0xf8d49fc529812e9a7c5c50e69c20f0dccc0db8fa95c98bc58cc9a4f1c1299eaf', {
    owner: address,
})
export type RemovedOwnerEventArgs = EParams<typeof RemovedOwner>

/** SafeModuleTransaction(address,address,uint256,bytes,uint8) */
export const SafeModuleTransaction = event('0xb648d3644f584ed1c2232d53c46d87e693586486ad0d1175f8656013110b714e', {
    module: address,
    to: address,
    value: uint256,
    data: bytes,
    operation: uint8,
})
export type SafeModuleTransactionEventArgs = EParams<typeof SafeModuleTransaction>

/** SafeMultiSigTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,bytes) */
export const SafeMultiSigTransaction = event('0x66753cd2356569ee081232e3be8909b950e0a76c1f8460c3a5e3c2be32b11bed', {
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
    additionalInfo: bytes,
})
export type SafeMultiSigTransactionEventArgs = EParams<typeof SafeMultiSigTransaction>

/** SafeReceived(address,uint256) */
export const SafeReceived = event('0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d', {
    sender: indexed(address),
    value: uint256,
})
export type SafeReceivedEventArgs = EParams<typeof SafeReceived>

/** SafeSetup(address,address[],uint256,address,address) */
export const SafeSetup = event('0x141df868a6331af528e38c83b7aa03edc19be66e37ae67f9285bf4f8e3c6a1a8', {
    initiator: indexed(address),
    owners: array(address),
    threshold: uint256,
    initializer: address,
    fallbackHandler: address,
})
export type SafeSetupEventArgs = EParams<typeof SafeSetup>

/** SignMsg(bytes32) */
export const SignMsg = event('0xe7f4675038f4f6034dfcbbb24c4dc08e4ebf10eb9d257d3d02c0f38d122ac6e4', {
    msgHash: indexed(bytes32),
})
export type SignMsgEventArgs = EParams<typeof SignMsg>
