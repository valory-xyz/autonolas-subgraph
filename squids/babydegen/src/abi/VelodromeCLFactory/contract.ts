import { ContractBase } from '../abi.support.js'
import { getPool } from './functions.js'
import type { GetPoolParams } from './functions.js'

export class Contract extends ContractBase {
    getPool(_0: GetPoolParams["_0"], _1: GetPoolParams["_1"], _2: GetPoolParams["_2"]) {
        return this.eth_call(getPool, {_0, _1, _2})
    }
}
