import { ContractBase } from '../abi.support.js'
import { gauge } from './functions.js'

export class Contract extends ContractBase {
    gauge() {
        return this.eth_call(gauge, {})
    }
}
