import {
  ActivateRegistration as ActivateRegistrationEvent,
  CreateMultisigWithAgents as CreateMultisigWithAgentsEvent,
  CreateService as CreateServiceEvent,
  DeployService as DeployServiceEvent,
  Deposit as DepositEvent,
  RegisterInstance as RegisterInstanceEvent,
  TerminateService as TerminateServiceEvent,
  Transfer as TransferEvent,
  UpdateService as UpdateServiceEvent,
} from "../generated/ServiceRegistryL2/ServiceRegistryL2"
import {
  ActivateRegistration,
  CreateMultisigWithAgents,
  CreateService,
  DeployService,
  Deposit,
  RegisterInstance,
  TerminateService,
  Transfer,
  UpdateService,
} from "../generated/schema"

export function handleActivateRegistration(
  event: ActivateRegistrationEvent,
): void {
  let entity = new ActivateRegistration(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.serviceId = event.params.serviceId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleCreateMultisigWithAgents(
  event: CreateMultisigWithAgentsEvent,
): void {
  let entity = new CreateMultisigWithAgents(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.serviceId = event.params.serviceId
  entity.multisig = event.params.multisig

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleCreateService(event: CreateServiceEvent): void {
  let entity = new CreateService(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.serviceId = event.params.serviceId
  entity.configHash = event.params.configHash

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleDeployService(event: DeployServiceEvent): void {
  let entity = new DeployService(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.serviceId = event.params.serviceId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleDeposit(event: DepositEvent): void {
  let entity = new Deposit(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.sender = event.params.sender
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRegisterInstance(event: RegisterInstanceEvent): void {
  let entity = new RegisterInstance(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.operator = event.params.operator
  entity.serviceId = event.params.serviceId
  entity.agentInstance = event.params.agentInstance
  entity.agentId = event.params.agentId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTerminateService(event: TerminateServiceEvent): void {
  let entity = new TerminateService(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.serviceId = event.params.serviceId

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

export function handleUpdateService(event: UpdateServiceEvent): void {
  let entity = new UpdateService(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.serviceId = event.params.serviceId
  entity.configHash = event.params.configHash

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
