import { address, bytes32, string, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** LiFiGenericSwapCompleted(bytes32,string,string,address,address,address,uint256,uint256) */
export const LiFiGenericSwapCompleted = event('0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537', {
    transactionId: indexed(bytes32),
    integrator: string,
    referrer: string,
    receiver: address,
    fromAssetId: address,
    toAssetId: address,
    fromAmount: uint256,
    toAmount: uint256,
})
export type LiFiGenericSwapCompletedEventArgs = EParams<typeof LiFiGenericSwapCompleted>
