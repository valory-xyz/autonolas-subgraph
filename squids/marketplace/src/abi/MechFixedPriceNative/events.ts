import { address, bytes, bytes32, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Deliver(address,address,bytes32,uint256,bytes) */
export const Deliver = event('0xb0d013658abb05dd269ff3ab257175d5ae3fa4107d4e142abd96e947cd5cb06f', {
    mech: indexed(address),
    mechServiceMultisig: indexed(address),
    requestId: bytes32,
    deliveryRate: uint256,
    data: bytes,
})
export type DeliverEventArgs = EParams<typeof Deliver>

/** MaxDeliveryRateUpdated(uint256) */
export const MaxDeliveryRateUpdated = event('0xb912b1469d50f9612d4378acbbf5469b04e6da0f6fe174443169d704ad534258', {
    maxDeliveryRate: uint256,
})
export type MaxDeliveryRateUpdatedEventArgs = EParams<typeof MaxDeliveryRateUpdated>

/** NumRequestsIncrease(uint256) */
export const NumRequestsIncrease = event('0xa9650c1f534f48ac9fe2937c5af1eb577dd1c6ade5a0422a538a6253e5d9e529', {
    numRequests: uint256,
})
export type NumRequestsIncreaseEventArgs = EParams<typeof NumRequestsIncrease>

/** Request(address,bytes32,bytes) */
export const Request = event('0x1ebd17f97038d3a14148566de635eab9901371bf904262f5498331b0c62921ce', {
    mech: indexed(address),
    requestId: bytes32,
    data: bytes,
})
export type RequestEventArgs = EParams<typeof Request>

/** RevokeRequest(bytes32) */
export const RevokeRequest = event('0xb5863ad79417b48f982fe746b7d7e7c00369bec5f782d4b58537541ff65e841a', {
    requestId: bytes32,
})
export type RevokeRequestEventArgs = EParams<typeof RevokeRequest>
