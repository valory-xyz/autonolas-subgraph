import { address, bool, bytes32, string, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** CID_PREFIX() */
export const CID_PREFIX = func('0x7c5e63e0', {}, string)
export type CID_PREFIXParams = FunctionArguments<typeof CID_PREFIX>
export type CID_PREFIXReturn = FunctionReturn<typeof CID_PREFIX>

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** baseURI() */
export const baseURI = func('0x6c0360eb', {}, string)
export type BaseURIParams = FunctionArguments<typeof baseURI>
export type BaseURIReturn = FunctionReturn<typeof baseURI>

/** changeHash(uint256,bytes32) */
export const changeHash = func('0x44a885ff', {
    serviceId: uint256,
    hash: bytes32,
})
export type ChangeHashParams = FunctionArguments<typeof changeHash>
export type ChangeHashReturn = FunctionReturn<typeof changeHash>

/** isAbleChangeHash(address,uint256) */
export const isAbleChangeHash = func('0xb764348a', {
    account: address,
    serviceId: uint256,
}, bool)
export type IsAbleChangeHashParams = FunctionArguments<typeof isAbleChangeHash>
export type IsAbleChangeHashReturn = FunctionReturn<typeof isAbleChangeHash>

/** mapServiceHashes(uint256) */
export const mapServiceHashes = func('0x4a086201', {
    _0: uint256,
}, bytes32)
export type MapServiceHashesParams = FunctionArguments<typeof mapServiceHashes>
export type MapServiceHashesReturn = FunctionReturn<typeof mapServiceHashes>

/** serviceRegistry() */
export const serviceRegistry = func('0xcbcf252a', {}, address)
export type ServiceRegistryParams = FunctionArguments<typeof serviceRegistry>
export type ServiceRegistryReturn = FunctionReturn<typeof serviceRegistry>

/** tokenURI(uint256) */
export const tokenURI = func('0xc87b56dd', {
    serviceId: uint256,
}, string)
export type TokenURIParams = FunctionArguments<typeof tokenURI>
export type TokenURIReturn = FunctionReturn<typeof tokenURI>
