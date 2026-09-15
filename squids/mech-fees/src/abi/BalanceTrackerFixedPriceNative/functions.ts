import { address, array, bool, bytes, struct, uint256 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** MAX_FEE_FACTOR() */
export const MAX_FEE_FACTOR = func('0xaf4937fc', {}, uint256)
export type MAX_FEE_FACTORParams = FunctionArguments<typeof MAX_FEE_FACTOR>
export type MAX_FEE_FACTORReturn = FunctionReturn<typeof MAX_FEE_FACTOR>

/** MIN_MECH_BALANCE() */
export const MIN_MECH_BALANCE = func('0x163ad715', {}, uint256)
export type MIN_MECH_BALANCEParams = FunctionArguments<typeof MIN_MECH_BALANCE>
export type MIN_MECH_BALANCEReturn = FunctionReturn<typeof MIN_MECH_BALANCE>

/** adjustMechRequesterBalances(address,address,uint256[],bytes) */
export const adjustMechRequesterBalances = func('0x6072dd2c', {
    mech: address,
    requester: address,
    mechDeliveryRates: array(uint256),
    paymentData: bytes,
})
export type AdjustMechRequesterBalancesParams = FunctionArguments<typeof adjustMechRequesterBalances>
export type AdjustMechRequesterBalancesReturn = FunctionReturn<typeof adjustMechRequesterBalances>

/** checkAndRecordDeliveryRates(address,uint256,uint256,bytes) */
export const checkAndRecordDeliveryRates = func('0x38603a39', {
    requester: address,
    numRequests: uint256,
    deliveryRate: uint256,
    paymentData: bytes,
})
export type CheckAndRecordDeliveryRatesParams = FunctionArguments<typeof checkAndRecordDeliveryRates>
export type CheckAndRecordDeliveryRatesReturn = FunctionReturn<typeof checkAndRecordDeliveryRates>

/** collectedFees() */
export const collectedFees = func('0x9003adfe', {}, uint256)
export type CollectedFeesParams = FunctionArguments<typeof collectedFees>
export type CollectedFeesReturn = FunctionReturn<typeof collectedFees>

/** depositFor(address) */
export const depositFor = func('0xaa67c919', {
    account: address,
})
export type DepositForParams = FunctionArguments<typeof depositFor>
export type DepositForReturn = FunctionReturn<typeof depositFor>

/** drain() */
export const drain = func('0x9890220b', {})
export type DrainParams = FunctionArguments<typeof drain>
export type DrainReturn = FunctionReturn<typeof drain>

/** drainer() */
export const drainer = func('0x57838e85', {}, address)
export type DrainerParams = FunctionArguments<typeof drainer>
export type DrainerReturn = FunctionReturn<typeof drainer>

/** finalizeDeliveryRates(address,address[],bool[],uint256[],uint256[]) */
export const finalizeDeliveryRates = func('0x79e4afe8', {
    mech: address,
    requesters: array(address),
    deliveredRequests: array(bool),
    mechDeliveryRates: array(uint256),
    requesterDeliveryRates: array(uint256),
})
export type FinalizeDeliveryRatesParams = FunctionArguments<typeof finalizeDeliveryRates>
export type FinalizeDeliveryRatesReturn = FunctionReturn<typeof finalizeDeliveryRates>

/** mapMechBalances(address) */
export const mapMechBalances = func('0xe6798035', {
    _0: address,
}, uint256)
export type MapMechBalancesParams = FunctionArguments<typeof mapMechBalances>
export type MapMechBalancesReturn = FunctionReturn<typeof mapMechBalances>

/** mapRequesterBalances(address) */
export const mapRequesterBalances = func('0x6aeeffa8', {
    _0: address,
}, uint256)
export type MapRequesterBalancesParams = FunctionArguments<typeof mapRequesterBalances>
export type MapRequesterBalancesReturn = FunctionReturn<typeof mapRequesterBalances>

/** mechMarketplace() */
export const mechMarketplace = func('0x9c5e9590', {}, address)
export type MechMarketplaceParams = FunctionArguments<typeof mechMarketplace>
export type MechMarketplaceReturn = FunctionReturn<typeof mechMarketplace>

/** processPayment() */
export const processPayment = func('0x22081c12', {}, struct({
    mechPayment: uint256,
    marketplaceFee: uint256,
}))
export type ProcessPaymentParams = FunctionArguments<typeof processPayment>
export type ProcessPaymentReturn = FunctionReturn<typeof processPayment>

/** processPaymentByMultisig(address) */
export const processPaymentByMultisig = func('0xf965a873', {
    mech: address,
}, struct({
    mechPayment: uint256,
    marketplaceFee: uint256,
}))
export type ProcessPaymentByMultisigParams = FunctionArguments<typeof processPaymentByMultisig>
export type ProcessPaymentByMultisigReturn = FunctionReturn<typeof processPaymentByMultisig>

/** wrappedNativeToken() */
export const wrappedNativeToken = func('0x17fcb39b', {}, address)
export type WrappedNativeTokenParams = FunctionArguments<typeof wrappedNativeToken>
export type WrappedNativeTokenReturn = FunctionReturn<typeof wrappedNativeToken>
