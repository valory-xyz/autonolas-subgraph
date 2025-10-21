import { newMockEvent } from 'matchstick-as'
import { Request } from '../generated/templates/AgentMech/AgentMech'
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'

export function createMechRequestEvent(
    sender: Address,
    requestId: BigInt,
    data: Bytes
): Request {
    let requestEvent = changetype<Request>(newMockEvent())

    let parameters = new Array<ethereum.EventParam>()

    parameters.push(
        new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender))
    )
    parameters.push(
        new ethereum.EventParam("requestId", ethereum.Value.fromUnsignedBigInt(requestId))
    )
    parameters.push(
        new ethereum.EventParam("data", ethereum.Value.fromBytes(data))
    )

    requestEvent.parameters = parameters

    return requestEvent
}