import { ContractBase } from '../abi.support.js'
import { SELECTOR_DATA_LENGTH, createStakingInstance, getProxyAddress, getProxyAddressWithNonce, mapInstanceParams, nonce, owner, verifier, verifyInstance, verifyInstanceAndGetEmissionsAmount } from './functions.js'
import type { CreateStakingInstanceParams, GetProxyAddressParams, GetProxyAddressWithNonceParams, MapInstanceParamsParams, VerifyInstanceAndGetEmissionsAmountParams, VerifyInstanceParams } from './functions.js'

export class Contract extends ContractBase {
    SELECTOR_DATA_LENGTH() {
        return this.eth_call(SELECTOR_DATA_LENGTH, {})
    }

    createStakingInstance(implementation: CreateStakingInstanceParams["implementation"], initPayload: CreateStakingInstanceParams["initPayload"]) {
        return this.eth_call(createStakingInstance, {implementation, initPayload})
    }

    getProxyAddress(implementation: GetProxyAddressParams["implementation"]) {
        return this.eth_call(getProxyAddress, {implementation})
    }

    getProxyAddressWithNonce(implementation: GetProxyAddressWithNonceParams["implementation"], localNonce: GetProxyAddressWithNonceParams["localNonce"]) {
        return this.eth_call(getProxyAddressWithNonce, {implementation, localNonce})
    }

    mapInstanceParams(_0: MapInstanceParamsParams["_0"]) {
        return this.eth_call(mapInstanceParams, {_0})
    }

    nonce() {
        return this.eth_call(nonce, {})
    }

    owner() {
        return this.eth_call(owner, {})
    }

    verifier() {
        return this.eth_call(verifier, {})
    }

    verifyInstance(instance: VerifyInstanceParams["instance"]) {
        return this.eth_call(verifyInstance, {instance})
    }

    verifyInstanceAndGetEmissionsAmount(instance: VerifyInstanceAndGetEmissionsAmountParams["instance"]) {
        return this.eth_call(verifyInstanceAndGetEmissionsAmount, {instance})
    }
}
