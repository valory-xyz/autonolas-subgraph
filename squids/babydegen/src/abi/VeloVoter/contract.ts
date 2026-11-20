import { ContractBase } from '../abi.support.js'
import { gauges } from './functions.js'
import type { GaugesParams } from './functions.js'

export class Contract extends ContractBase {
    gauges(pool: GaugesParams["pool"]) {
        return this.eth_call(gauges, {pool})
    }
}
