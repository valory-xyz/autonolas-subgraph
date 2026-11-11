import { ContractBase } from '../abi.support.js'
import { allPoolsLength } from './functions.js'

export class Contract extends ContractBase {
    allPoolsLength() {
        return this.eth_call(allPoolsLength, {})
    }
}
