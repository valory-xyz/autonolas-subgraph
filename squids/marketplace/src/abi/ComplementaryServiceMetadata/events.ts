import { bytes32, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** ComplementaryMetadataUpdated(uint256,bytes32) */
export const ComplementaryMetadataUpdated = event('0x87f9ed4fb4b8e6e4fae8db70df4b9445f5afb00ed253374f9d87cad37813068d', {
    serviceId: indexed(uint256),
    hash: indexed(bytes32),
})
export type ComplementaryMetadataUpdatedEventArgs = EParams<typeof ComplementaryMetadataUpdated>
