import { address, bool, bytes, struct, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** SELECTOR_DATA_LENGTH() */
export const SELECTOR_DATA_LENGTH = func('0x3ce3778c', {}, uint256)
export type SELECTOR_DATA_LENGTHParams = FunctionArguments<typeof SELECTOR_DATA_LENGTH>
export type SELECTOR_DATA_LENGTHReturn = FunctionReturn<typeof SELECTOR_DATA_LENGTH>

/** changeOwner(address) */
export const changeOwner = func('0xa6f9dae1', {
    newOwner: address,
})
export type ChangeOwnerParams = FunctionArguments<typeof changeOwner>
export type ChangeOwnerReturn = FunctionReturn<typeof changeOwner>

/** changeVerifier(address) */
export const changeVerifier = func('0xcf04fb94', {
    newVerifier: address,
})
export type ChangeVerifierParams = FunctionArguments<typeof changeVerifier>
export type ChangeVerifierReturn = FunctionReturn<typeof changeVerifier>

/** createStakingInstance(address,bytes) */
export const createStakingInstance = func('0xec2ee1f6', {
    implementation: address,
    initPayload: bytes,
}, address)
export type CreateStakingInstanceParams = FunctionArguments<typeof createStakingInstance>
export type CreateStakingInstanceReturn = FunctionReturn<typeof createStakingInstance>

/** getProxyAddress(address) */
export const getProxyAddress = func('0xfa2a5b01', {
    implementation: address,
}, address)
export type GetProxyAddressParams = FunctionArguments<typeof getProxyAddress>
export type GetProxyAddressReturn = FunctionReturn<typeof getProxyAddress>

/** getProxyAddressWithNonce(address,uint256) */
export const getProxyAddressWithNonce = func('0x555b8adb', {
    implementation: address,
    localNonce: uint256,
}, address)
export type GetProxyAddressWithNonceParams = FunctionArguments<typeof getProxyAddressWithNonce>
export type GetProxyAddressWithNonceReturn = FunctionReturn<typeof getProxyAddressWithNonce>

/** mapInstanceParams(address) */
export const mapInstanceParams = func('0xe8dc705a', {
    _0: address,
}, struct({
    implementation: address,
    deployer: address,
    isEnabled: bool,
}))
export type MapInstanceParamsParams = FunctionArguments<typeof mapInstanceParams>
export type MapInstanceParamsReturn = FunctionReturn<typeof mapInstanceParams>

/** nonce() */
export const nonce = func('0xaffed0e0', {}, uint256)
export type NonceParams = FunctionArguments<typeof nonce>
export type NonceReturn = FunctionReturn<typeof nonce>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** removeInstance(address) */
export const removeInstance = func('0x830a322a', {
    instance: address,
})
export type RemoveInstanceParams = FunctionArguments<typeof removeInstance>
export type RemoveInstanceReturn = FunctionReturn<typeof removeInstance>

/** setInstanceStatus(address,bool) */
export const setInstanceStatus = func('0x118e24bd', {
    instance: address,
    isEnabled: bool,
})
export type SetInstanceStatusParams = FunctionArguments<typeof setInstanceStatus>
export type SetInstanceStatusReturn = FunctionReturn<typeof setInstanceStatus>

/** verifier() */
export const verifier = func('0x2b7ac3f3', {}, address)
export type VerifierParams = FunctionArguments<typeof verifier>
export type VerifierReturn = FunctionReturn<typeof verifier>

/** verifyInstance(address) */
export const verifyInstance = func('0x479e372e', {
    instance: address,
}, bool)
export type VerifyInstanceParams = FunctionArguments<typeof verifyInstance>
export type VerifyInstanceReturn = FunctionReturn<typeof verifyInstance>

/** verifyInstanceAndGetEmissionsAmount(address) */
export const verifyInstanceAndGetEmissionsAmount = func('0x1eda94d7', {
    instance: address,
}, uint256)
export type VerifyInstanceAndGetEmissionsAmountParams = FunctionArguments<typeof verifyInstanceAndGetEmissionsAmount>
export type VerifyInstanceAndGetEmissionsAmountReturn = FunctionReturn<typeof verifyInstanceAndGetEmissionsAmount>
