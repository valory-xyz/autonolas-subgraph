import { address, array, bytes, bytes32, bytes4, string, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** ECOSYSTEM_METADATA_KEY() */
export const ECOSYSTEM_METADATA_KEY = func('0x1a8d9066', {}, string)
export type ECOSYSTEM_METADATA_KEYParams = FunctionArguments<typeof ECOSYSTEM_METADATA_KEY>
export type ECOSYSTEM_METADATA_KEYReturn = FunctionReturn<typeof ECOSYSTEM_METADATA_KEY>

/** ECOSYSTEM_METADATA_VALUE() */
export const ECOSYSTEM_METADATA_VALUE = func('0x656762cd', {}, bytes)
export type ECOSYSTEM_METADATA_VALUEParams = FunctionArguments<typeof ECOSYSTEM_METADATA_VALUE>
export type ECOSYSTEM_METADATA_VALUEReturn = FunctionReturn<typeof ECOSYSTEM_METADATA_VALUE>

/** PROXY_IDENTITY_REGISTRY_BRIDGER() */
export const PROXY_IDENTITY_REGISTRY_BRIDGER = func('0xd4de7260', {}, bytes32)
export type PROXY_IDENTITY_REGISTRY_BRIDGERParams = FunctionArguments<typeof PROXY_IDENTITY_REGISTRY_BRIDGER>
export type PROXY_IDENTITY_REGISTRY_BRIDGERReturn = FunctionReturn<typeof PROXY_IDENTITY_REGISTRY_BRIDGER>

/** SERVICE_ID_METADATA_KEY() */
export const SERVICE_ID_METADATA_KEY = func('0xecb5c669', {}, string)
export type SERVICE_ID_METADATA_KEYParams = FunctionArguments<typeof SERVICE_ID_METADATA_KEY>
export type SERVICE_ID_METADATA_KEYReturn = FunctionReturn<typeof SERVICE_ID_METADATA_KEY>

/** SERVICE_REGISTRY_METADATA_KEY() */
export const SERVICE_REGISTRY_METADATA_KEY = func('0xe688e808', {}, string)
export type SERVICE_REGISTRY_METADATA_KEYParams = FunctionArguments<typeof SERVICE_REGISTRY_METADATA_KEY>
export type SERVICE_REGISTRY_METADATA_KEYReturn = FunctionReturn<typeof SERVICE_REGISTRY_METADATA_KEY>

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** baseURI() */
export const baseURI = func('0x6c0360eb', {}, string)
export type BaseURIParams = FunctionArguments<typeof baseURI>
export type BaseURIReturn = FunctionReturn<typeof baseURI>

/** changeBaseURI(string) */
export const changeBaseURI = func('0x39a0c6f9', {
    newBaseURI: string,
})
export type ChangeBaseURIParams = FunctionArguments<typeof changeBaseURI>
export type ChangeBaseURIReturn = FunctionReturn<typeof changeBaseURI>

/** changeImplementation(address) */
export const changeImplementation = func('0x17a68dd8', {
    implementation: address,
})
export type ChangeImplementationParams = FunctionArguments<typeof changeImplementation>
export type ChangeImplementationReturn = FunctionReturn<typeof changeImplementation>

/** changeOwner(address) */
export const changeOwner = func('0xa6f9dae1', {
    newOwner: address,
})
export type ChangeOwnerParams = FunctionArguments<typeof changeOwner>
export type ChangeOwnerReturn = FunctionReturn<typeof changeOwner>

/** getAgentURI(uint256) */
export const getAgentURI = func('0xce91aede', {
    serviceId: uint256,
}, string)
export type GetAgentURIParams = FunctionArguments<typeof getAgentURI>
export type GetAgentURIReturn = FunctionReturn<typeof getAgentURI>

/** identityRegistry() */
export const identityRegistry = func('0x134e18f4', {}, address)
export type IdentityRegistryParams = FunctionArguments<typeof identityRegistry>
export type IdentityRegistryReturn = FunctionReturn<typeof identityRegistry>

/** initialize(string) */
export const initialize = func('0xf62d1888', {
    _baseURI: string,
})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** linkServiceIdAgentIds(uint256) */
export const linkServiceIdAgentIds = func('0x218fda54', {
    numServices: uint256,
}, array(uint256))
export type LinkServiceIdAgentIdsParams = FunctionArguments<typeof linkServiceIdAgentIds>
export type LinkServiceIdAgentIdsReturn = FunctionReturn<typeof linkServiceIdAgentIds>

/** mapMultisigAgentIds(address) */
export const mapMultisigAgentIds = func('0x1c5436c1', {
    _0: address,
}, uint256)
export type MapMultisigAgentIdsParams = FunctionArguments<typeof mapMultisigAgentIds>
export type MapMultisigAgentIdsReturn = FunctionReturn<typeof mapMultisigAgentIds>

/** mapServiceIdAgentIds(uint256) */
export const mapServiceIdAgentIds = func('0xe0e3e127', {
    _0: uint256,
}, uint256)
export type MapServiceIdAgentIdsParams = FunctionArguments<typeof mapServiceIdAgentIds>
export type MapServiceIdAgentIdsReturn = FunctionReturn<typeof mapServiceIdAgentIds>

/** onERC721Received(address,address,uint256,bytes) */
export const onERC721Received = func('0x150b7a02', {
    _0: address,
    _1: address,
    _2: uint256,
    _3: bytes,
}, bytes4)
export type OnERC721ReceivedParams = FunctionArguments<typeof onERC721Received>
export type OnERC721ReceivedReturn = FunctionReturn<typeof onERC721Received>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** register(uint256) */
export const register = func('0xf207564e', {
    serviceId: uint256,
}, uint256)
export type RegisterParams = FunctionArguments<typeof register>
export type RegisterReturn = FunctionReturn<typeof register>

/** serviceManager() */
export const serviceManager = func('0x3998fdd3', {}, address)
export type ServiceManagerParams = FunctionArguments<typeof serviceManager>
export type ServiceManagerReturn = FunctionReturn<typeof serviceManager>

/** serviceRegistry() */
export const serviceRegistry = func('0xcbcf252a', {}, address)
export type ServiceRegistryParams = FunctionArguments<typeof serviceRegistry>
export type ServiceRegistryReturn = FunctionReturn<typeof serviceRegistry>

/** setAgentWallet(uint256,bytes) */
export const setAgentWallet = func('0x78b88f57', {
    deadline: uint256,
    signature: bytes,
})
export type SetAgentWalletParams = FunctionArguments<typeof setAgentWallet>
export type SetAgentWalletReturn = FunctionReturn<typeof setAgentWallet>

/** setMetadata(string,bytes) */
export const setMetadata = func('0x38e58999', {
    metadataKey: string,
    metadataValue: bytes,
})
export type SetMetadataParams = FunctionArguments<typeof setMetadata>
export type SetMetadataReturn = FunctionReturn<typeof setMetadata>

/** startLinkServiceId() */
export const startLinkServiceId = func('0x09a76b52', {}, uint256)
export type StartLinkServiceIdParams = FunctionArguments<typeof startLinkServiceId>
export type StartLinkServiceIdReturn = FunctionReturn<typeof startLinkServiceId>

/** unsetAgentWallet() */
export const unsetAgentWallet = func('0x7fe627bb', {})
export type UnsetAgentWalletParams = FunctionArguments<typeof unsetAgentWallet>
export type UnsetAgentWalletReturn = FunctionReturn<typeof unsetAgentWallet>

/** updateAgentWallet(uint256,address,address) */
export const updateAgentWallet = func('0xe636441c', {
    serviceId: uint256,
    oldMultisig: address,
    newMultisig: address,
})
export type UpdateAgentWalletParams = FunctionArguments<typeof updateAgentWallet>
export type UpdateAgentWalletReturn = FunctionReturn<typeof updateAgentWallet>
