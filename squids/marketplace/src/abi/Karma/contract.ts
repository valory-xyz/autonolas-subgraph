import { ContractBase } from '../abi.support.js'
import { KARMA_PROXY, VERSION, mapMechKarma, mapMechMarketplaces, mapRequesterMechKarma, owner } from './functions.js'
import type { MapMechKarmaParams, MapMechMarketplacesParams, MapRequesterMechKarmaParams } from './functions.js'

export class Contract extends ContractBase {
    KARMA_PROXY() {
        return this.eth_call(KARMA_PROXY, {})
    }

    VERSION() {
        return this.eth_call(VERSION, {})
    }

    mapMechKarma(_0: MapMechKarmaParams["_0"]) {
        return this.eth_call(mapMechKarma, {_0})
    }

    mapMechMarketplaces(_0: MapMechMarketplacesParams["_0"]) {
        return this.eth_call(mapMechMarketplaces, {_0})
    }

    mapRequesterMechKarma(_0: MapRequesterMechKarmaParams["_0"], _1: MapRequesterMechKarmaParams["_1"]) {
        return this.eth_call(mapRequesterMechKarma, {_0, _1})
    }

    owner() {
        return this.eth_call(owner, {})
    }
}
