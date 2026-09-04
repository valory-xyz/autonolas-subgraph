import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** DrainerUpdated(address) */
export const DrainerUpdated = event('0x8d1e8547016120917daad7f81c42b48f7fee379badc48f1889f0f43bb6194725', {
    drainer: indexed(address),
})
export type DrainerUpdatedEventArgs = EParams<typeof DrainerUpdated>

/** ManagerUpdated(address) */
export const ManagerUpdated = event('0x2c1c11af44aa5608f1dca38c00275c30ea091e02417d36e70e9a1538689c433d', {
    manager: indexed(address),
})
export type ManagerUpdatedEventArgs = EParams<typeof ManagerUpdated>

/** OperatorTokenSlashed(uint256,address,uint256) */
export const OperatorTokenSlashed = event('0xd79658b314eb967321e5e6a82ab39f6f7ffc567d38c6feee527761aca406a597', {
    amount: uint256,
    operator: indexed(address),
    serviceId: indexed(uint256),
})
export type OperatorTokenSlashedEventArgs = EParams<typeof OperatorTokenSlashed>

/** OwnerUpdated(address) */
export const OwnerUpdated = event('0x4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b', {
    owner: indexed(address),
})
export type OwnerUpdatedEventArgs = EParams<typeof OwnerUpdated>

/** TokenDeposit(address,address,uint256) */
export const TokenDeposit = event('0x98c09d9949722bae4bd0d988d4050091c3ae7ec6d51d3c6bbfe4233593944e9e', {
    account: indexed(address),
    token: indexed(address),
    amount: uint256,
})
export type TokenDepositEventArgs = EParams<typeof TokenDeposit>

/** TokenDrain(address,address,uint256) */
export const TokenDrain = event('0xeb64d3e0fe21df59e0edd78e9749e4bc9f3cf593a842d487fe40f29ef45fdad6', {
    drainer: indexed(address),
    token: indexed(address),
    amount: uint256,
})
export type TokenDrainEventArgs = EParams<typeof TokenDrain>

/** TokenRefund(address,address,uint256) */
export const TokenRefund = event('0xb5ea3bd24bc48df54cdc99f11e448ab16503a3e16f46c363202f5fff4891acba', {
    account: indexed(address),
    token: indexed(address),
    amount: uint256,
})
export type TokenRefundEventArgs = EParams<typeof TokenRefund>
