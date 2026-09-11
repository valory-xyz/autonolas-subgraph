import { ContractBase } from '../abi.support.js'
import { CID_PREFIX, VERSION, baseURI, isAbleChangeHash, mapServiceHashes, serviceRegistry, tokenURI } from './functions.js'
import type { IsAbleChangeHashParams, MapServiceHashesParams, TokenURIParams } from './functions.js'

export class Contract extends ContractBase {
    CID_PREFIX() {
        return this.eth_call(CID_PREFIX, {})
    }

    VERSION() {
        return this.eth_call(VERSION, {})
    }

    baseURI() {
        return this.eth_call(baseURI, {})
    }

    isAbleChangeHash(account: IsAbleChangeHashParams["account"], serviceId: IsAbleChangeHashParams["serviceId"]) {
        return this.eth_call(isAbleChangeHash, {account, serviceId})
    }

    mapServiceHashes(_0: MapServiceHashesParams["_0"]) {
        return this.eth_call(mapServiceHashes, {_0})
    }

    serviceRegistry() {
        return this.eth_call(serviceRegistry, {})
    }

    tokenURI(serviceId: TokenURIParams["serviceId"]) {
        return this.eth_call(tokenURI, {serviceId})
    }
}
