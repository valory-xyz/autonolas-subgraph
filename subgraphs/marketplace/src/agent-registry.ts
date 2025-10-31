import {
  CreateAgent as CreateAgentEvent,
  Transfer as TransferEvent,
  UpdateAgentHash as UpdateAgentHashEvent,
} from "../generated/AgentRegistry/AgentRegistry"
import {
  CreateAgent,
  Transfer,
  UpdateAgentHash,
} from "../generated/schema"


export function handleCreateAgent(event: CreateAgentEvent): void {
  let entity = new CreateAgent(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.agentId = event.params.agentId
  entity.agentHash = event.params.agentHash

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}


export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.from = event.params.from
  entity.to = event.params.to
  entity.internal_id = event.params.id

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleUpdateAgentHash(event: UpdateAgentHashEvent): void {
  let entity = new UpdateAgentHash(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.agentId = event.params.agentId
  entity.agentHash = event.params.agentHash

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
