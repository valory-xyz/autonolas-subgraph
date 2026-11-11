import { ContractBase } from '../abi.support.js'
import { forSwaps } from './functions.js'
import type { ForSwapsParams } from './functions.js'

export class Contract extends ContractBase {
    forSwaps(_limit: ForSwapsParams["_limit"], _offset: ForSwapsParams["_offset"]) {
        return this.eth_call(forSwaps, {_limit, _offset})
    }
}
