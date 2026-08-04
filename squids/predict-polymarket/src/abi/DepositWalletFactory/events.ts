import { address, bytes32 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** WalletDeployed(address,address,bytes32,address) */
export const WalletDeployed = event('0x7441de0ad639fe5d2bf1c22447715a0528b682385736bb40ae8dd92555eb8276', {
    wallet: indexed(address),
    owner: indexed(address),
    salt: indexed(bytes32),
    implementation: address,
})
export type WalletDeployedEventArgs = EParams<typeof WalletDeployed>
