import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** CreateMechFixedPriceToken(address,uint256,uint256) */
export const CreateMechFixedPriceToken = event('0x089304453adecee846717b30cf48eed516b2e449b6276f9d63f3fea6aa0b08c1', {
    mech: indexed(address),
    serviceId: indexed(uint256),
    maxDeliveryRate: uint256,
})
export type CreateMechFixedPriceTokenEventArgs = EParams<typeof CreateMechFixedPriceToken>
