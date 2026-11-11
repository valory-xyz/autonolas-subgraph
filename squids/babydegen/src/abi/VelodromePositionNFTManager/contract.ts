import { ContractBase } from '../abi.support.js'
import { positions } from './functions.js'
import type { PositionsParams } from './functions.js'

export class Contract extends ContractBase {
    positions(tokenId: PositionsParams["tokenId"]) {
        return this.eth_call(positions, {tokenId})
    }
}
