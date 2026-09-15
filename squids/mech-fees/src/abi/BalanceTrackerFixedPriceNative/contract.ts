import { ContractBase } from '../abi.support.js'
import { MAX_FEE_FACTOR, MIN_MECH_BALANCE, collectedFees, drainer, mapMechBalances, mapRequesterBalances, mechMarketplace, processPayment, processPaymentByMultisig, wrappedNativeToken } from './functions.js'
import type { MapMechBalancesParams, MapRequesterBalancesParams, ProcessPaymentByMultisigParams } from './functions.js'

export class Contract extends ContractBase {
    MAX_FEE_FACTOR() {
        return this.eth_call(MAX_FEE_FACTOR, {})
    }

    MIN_MECH_BALANCE() {
        return this.eth_call(MIN_MECH_BALANCE, {})
    }

    collectedFees() {
        return this.eth_call(collectedFees, {})
    }

    drainer() {
        return this.eth_call(drainer, {})
    }

    mapMechBalances(_0: MapMechBalancesParams["_0"]) {
        return this.eth_call(mapMechBalances, {_0})
    }

    mapRequesterBalances(_0: MapRequesterBalancesParams["_0"]) {
        return this.eth_call(mapRequesterBalances, {_0})
    }

    mechMarketplace() {
        return this.eth_call(mechMarketplace, {})
    }

    processPayment() {
        return this.eth_call(processPayment, {})
    }

    processPaymentByMultisig(mech: ProcessPaymentByMultisigParams["mech"]) {
        return this.eth_call(processPaymentByMultisig, {mech})
    }

    wrappedNativeToken() {
        return this.eth_call(wrappedNativeToken, {})
    }
}
