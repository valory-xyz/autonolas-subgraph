import { ContractBase } from '../abi.support.js'
import { ECOSYSTEM_METADATA_KEY, ECOSYSTEM_METADATA_VALUE, PROXY_IDENTITY_REGISTRY_BRIDGER, SERVICE_ID_METADATA_KEY, SERVICE_REGISTRY_METADATA_KEY, VERSION, baseURI, getAgentURI, identityRegistry, linkServiceIdAgentIds, mapMultisigAgentIds, mapServiceIdAgentIds, onERC721Received, owner, register, serviceManager, serviceRegistry, startLinkServiceId } from './functions.js'
import type { GetAgentURIParams, LinkServiceIdAgentIdsParams, MapMultisigAgentIdsParams, MapServiceIdAgentIdsParams, OnERC721ReceivedParams, RegisterParams } from './functions.js'

export class Contract extends ContractBase {
    ECOSYSTEM_METADATA_KEY() {
        return this.eth_call(ECOSYSTEM_METADATA_KEY, {})
    }

    ECOSYSTEM_METADATA_VALUE() {
        return this.eth_call(ECOSYSTEM_METADATA_VALUE, {})
    }

    PROXY_IDENTITY_REGISTRY_BRIDGER() {
        return this.eth_call(PROXY_IDENTITY_REGISTRY_BRIDGER, {})
    }

    SERVICE_ID_METADATA_KEY() {
        return this.eth_call(SERVICE_ID_METADATA_KEY, {})
    }

    SERVICE_REGISTRY_METADATA_KEY() {
        return this.eth_call(SERVICE_REGISTRY_METADATA_KEY, {})
    }

    VERSION() {
        return this.eth_call(VERSION, {})
    }

    baseURI() {
        return this.eth_call(baseURI, {})
    }

    getAgentURI(serviceId: GetAgentURIParams["serviceId"]) {
        return this.eth_call(getAgentURI, {serviceId})
    }

    identityRegistry() {
        return this.eth_call(identityRegistry, {})
    }

    linkServiceIdAgentIds(numServices: LinkServiceIdAgentIdsParams["numServices"]) {
        return this.eth_call(linkServiceIdAgentIds, {numServices})
    }

    mapMultisigAgentIds(_0: MapMultisigAgentIdsParams["_0"]) {
        return this.eth_call(mapMultisigAgentIds, {_0})
    }

    mapServiceIdAgentIds(_0: MapServiceIdAgentIdsParams["_0"]) {
        return this.eth_call(mapServiceIdAgentIds, {_0})
    }

    onERC721Received(_0: OnERC721ReceivedParams["_0"], _1: OnERC721ReceivedParams["_1"], _2: OnERC721ReceivedParams["_2"], _3: OnERC721ReceivedParams["_3"]) {
        return this.eth_call(onERC721Received, {_0, _1, _2, _3})
    }

    owner() {
        return this.eth_call(owner, {})
    }

    register(serviceId: RegisterParams["serviceId"]) {
        return this.eth_call(register, {serviceId})
    }

    serviceManager() {
        return this.eth_call(serviceManager, {})
    }

    serviceRegistry() {
        return this.eth_call(serviceRegistry, {})
    }

    startLinkServiceId() {
        return this.eth_call(startLinkServiceId, {})
    }
}
