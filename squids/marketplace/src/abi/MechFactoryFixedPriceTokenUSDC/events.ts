import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** CreateMechFixedPriceTokenUSDC(address,uint256,uint256) */
export const CreateMechFixedPriceTokenUSDC = event('0x672b2ed81e331bac39c648692ed01e0184462a5644ee3f6d7268e6eb430f99e5', {
    mech: indexed(address),
    serviceId: indexed(uint256),
    maxDeliveryRate: uint256,
})
export type CreateMechFixedPriceTokenUSDCEventArgs = EParams<typeof CreateMechFixedPriceTokenUSDC>
