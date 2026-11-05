import { address, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** CreateMultisigWithAgents(uint256,address) */
export const CreateMultisigWithAgents = event('0x2d53f895cd5faf3cddba94a25c2ced2105885b5b37450ff430ffa3cbdf332c74', {
    serviceId: indexed(uint256),
    multisig: indexed(address),
})
export type CreateMultisigWithAgentsEventArgs = EParams<typeof CreateMultisigWithAgents>

/** RegisterInstance(address,uint256,address,uint256) */
export const RegisterInstance = event('0x6835389a6da5341647f18cbe0a89c56f473f4c17bfaee6e6d07d61f1928e0b7c', {
    operator: indexed(address),
    serviceId: indexed(uint256),
    agentInstance: indexed(address),
    agentId: uint256,
})
export type RegisterInstanceEventArgs = EParams<typeof RegisterInstance>
