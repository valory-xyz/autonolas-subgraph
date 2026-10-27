import { ContractBase } from '../abi.support.js'
import { legacyConditionId } from './functions.js'
import type { LegacyConditionIdParams } from './functions.js'

export class Contract extends ContractBase {
    legacyConditionId(_0: LegacyConditionIdParams["_0"]) {
        return this.eth_call(legacyConditionId, {_0})
    }
}
