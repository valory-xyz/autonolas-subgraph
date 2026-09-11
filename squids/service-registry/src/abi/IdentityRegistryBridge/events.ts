import { address, bool, bytes, string, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** AgentMultisigUpdated(uint256,uint256,address,address) */
export const AgentMultisigUpdated = event('0x2c7dd77bcd60a4bc27c783b05de7bf78f9d8494bb5a0a028e75a8a02bf1f3f04', {
    serviceId: indexed(uint256),
    agentId: indexed(uint256),
    oldMultisig: address,
    newMultisig: indexed(address),
})
export type AgentMultisigUpdatedEventArgs = EParams<typeof AgentMultisigUpdated>

/** AgentWalletSet(uint256,uint256,address) */
export const AgentWalletSet = event('0x8af2ba18448cbdcfbc2e491e535d3060559e86dd981d6a3a6fc9b85440ef7b3a', {
    serviceId: indexed(uint256),
    agentId: indexed(uint256),
    multisig: indexed(address),
})
export type AgentWalletSetEventArgs = EParams<typeof AgentWalletSet>

/** BaseURIUpdated(string) */
export const BaseURIUpdated = event('0x6741b2fc379fad678116fe3d4d4b9a1a184ab53ba36b86ad0fa66340b1ab41ad', {
    baseURI: string,
})
export type BaseURIUpdatedEventArgs = EParams<typeof BaseURIUpdated>

/** ImplementationUpdated(address) */
export const ImplementationUpdated = event('0x310ba5f1d2ed074b51e2eccd052a47ae9ab7c6b800d1fca3db3999d6a592ca03', {
    implementation: indexed(address),
})
export type ImplementationUpdatedEventArgs = EParams<typeof ImplementationUpdated>

/** MetadataSet(uint256,uint256,string,bytes) */
export const MetadataSet = event('0xb1af9746c3644ad631ed60dc0efa60666df56656b7e243183e95c67c48f60532', {
    serviceId: indexed(uint256),
    agentId: indexed(uint256),
    metadataKey: string,
    metadataValue: bytes,
})
export type MetadataSetEventArgs = EParams<typeof MetadataSet>

/** OwnerUpdated(address) */
export const OwnerUpdated = event('0x4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b', {
    owner: indexed(address),
})
export type OwnerUpdatedEventArgs = EParams<typeof OwnerUpdated>

/** ServiceAgentLinked(uint256,uint256) */
export const ServiceAgentLinked = event('0xed3b0677b72f7c613d36efedb855a37500f282c148335826c86ee2525c151391', {
    serviceId: indexed(uint256),
    agentId: indexed(uint256),
})
export type ServiceAgentLinkedEventArgs = EParams<typeof ServiceAgentLinked>

/** StartLinkServiceIdUpdated(uint256,bool) */
export const StartLinkServiceIdUpdated = event('0xce05a7cf44fe9f781fa96adaba57b74bf4b82162efa121c08e77f051a23dae90', {
    serviceId: indexed(uint256),
    linkedAll: bool,
})
export type StartLinkServiceIdUpdatedEventArgs = EParams<typeof StartLinkServiceIdUpdated>
