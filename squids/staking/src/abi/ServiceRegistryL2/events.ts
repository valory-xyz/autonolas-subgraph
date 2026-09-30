import { address, bool, bytes32, string, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** ActivateRegistration(uint256) */
export const ActivateRegistration = event('0xa48b531f972c0e4aca57afcc5c099c52a7bd21bc5e2a1b733eec3be9e88da97a', {
    serviceId: indexed(uint256),
})
export type ActivateRegistrationEventArgs = EParams<typeof ActivateRegistration>

/** Approval(address,address,uint256) */
export const Approval = event('0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', {
    owner: indexed(address),
    spender: indexed(address),
    id: indexed(uint256),
})
export type ApprovalEventArgs = EParams<typeof Approval>

/** ApprovalForAll(address,address,bool) */
export const ApprovalForAll = event('0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31', {
    owner: indexed(address),
    operator: indexed(address),
    approved: bool,
})
export type ApprovalForAllEventArgs = EParams<typeof ApprovalForAll>

/** BaseURIChanged(string) */
export const BaseURIChanged = event('0x5411e8ebf1636d9e83d5fc4900bf80cbac82e8790da2a4c94db4895e889eedf6', {
    baseURI: string,
})
export type BaseURIChangedEventArgs = EParams<typeof BaseURIChanged>

/** CreateMultisigWithAgents(uint256,address) */
export const CreateMultisigWithAgents = event('0x2d53f895cd5faf3cddba94a25c2ced2105885b5b37450ff430ffa3cbdf332c74', {
    serviceId: indexed(uint256),
    multisig: indexed(address),
})
export type CreateMultisigWithAgentsEventArgs = EParams<typeof CreateMultisigWithAgents>

/** CreateService(uint256,bytes32) */
export const CreateService = event('0xb34c1e02384201736eb4693b9b173306cb41bff12f15894dea5773088e9a3b1c', {
    serviceId: indexed(uint256),
    configHash: bytes32,
})
export type CreateServiceEventArgs = EParams<typeof CreateService>

/** DeployService(uint256) */
export const DeployService = event('0xa133ed72c03a7d008deaae618a61613c4fd41c67bba1cad1a6bc0a1c5a9c156e', {
    serviceId: indexed(uint256),
})
export type DeployServiceEventArgs = EParams<typeof DeployService>

/** Deposit(address,uint256) */
export const Deposit = event('0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c', {
    sender: indexed(address),
    amount: uint256,
})
export type DepositEventArgs = EParams<typeof Deposit>

/** Drain(address,uint256) */
export const Drain = event('0xf36f4d6622e16a536bbb049064af779cdd483a0b388d347d3752a65f1058bf5b', {
    drainer: indexed(address),
    amount: uint256,
})
export type DrainEventArgs = EParams<typeof Drain>

/** DrainerUpdated(address) */
export const DrainerUpdated = event('0x8d1e8547016120917daad7f81c42b48f7fee379badc48f1889f0f43bb6194725', {
    drainer: indexed(address),
})
export type DrainerUpdatedEventArgs = EParams<typeof DrainerUpdated>

/** ManagerUpdated(address) */
export const ManagerUpdated = event('0x2c1c11af44aa5608f1dca38c00275c30ea091e02417d36e70e9a1538689c433d', {
    manager: indexed(address),
})
export type ManagerUpdatedEventArgs = EParams<typeof ManagerUpdated>

/** OperatorSlashed(uint256,address,uint256) */
export const OperatorSlashed = event('0xa2e524bd0f71903485fbb3d6d50cb305f61005ceea2047c3ac92aa7e0d104306', {
    amount: uint256,
    operator: indexed(address),
    serviceId: indexed(uint256),
})
export type OperatorSlashedEventArgs = EParams<typeof OperatorSlashed>

/** OperatorUnbond(address,uint256) */
export const OperatorUnbond = event('0x5ebf7fe30be09f0f03b9195632508d95c8b67bf010c93abda67f70d5d9599d1e', {
    operator: indexed(address),
    serviceId: indexed(uint256),
})
export type OperatorUnbondEventArgs = EParams<typeof OperatorUnbond>

/** OwnerUpdated(address) */
export const OwnerUpdated = event('0x4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b', {
    owner: indexed(address),
})
export type OwnerUpdatedEventArgs = EParams<typeof OwnerUpdated>

/** Refund(address,uint256) */
export const Refund = event('0xbb28353e4598c3b9199101a66e0989549b659a59a54d2c27fbb183f1932c8e6d', {
    receiver: indexed(address),
    amount: uint256,
})
export type RefundEventArgs = EParams<typeof Refund>

/** RegisterInstance(address,uint256,address,uint256) */
export const RegisterInstance = event('0x6835389a6da5341647f18cbe0a89c56f473f4c17bfaee6e6d07d61f1928e0b7c', {
    operator: indexed(address),
    serviceId: indexed(uint256),
    agentInstance: indexed(address),
    agentId: uint256,
})
export type RegisterInstanceEventArgs = EParams<typeof RegisterInstance>

/** TerminateService(uint256) */
export const TerminateService = event('0xe45f5b9540df4f71b7e044809fa318806328c1ea2388a70c7373d97ccf8a0faa', {
    serviceId: indexed(uint256),
})
export type TerminateServiceEventArgs = EParams<typeof TerminateService>

/** Transfer(address,address,uint256) */
export const Transfer = event('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', {
    from: indexed(address),
    to: indexed(address),
    id: indexed(uint256),
})
export type TransferEventArgs = EParams<typeof Transfer>

/** UpdateService(uint256,bytes32) */
export const UpdateService = event('0xff312ce131c4d73ac90ece91266be7090486c5e15f78b7ea2b108c36dfd47529', {
    serviceId: indexed(uint256),
    configHash: bytes32,
})
export type UpdateServiceEventArgs = EParams<typeof UpdateService>
