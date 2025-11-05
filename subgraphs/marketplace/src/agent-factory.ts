import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
  CreateMech as CreateMechEvent,
} from '../generated/AgentFactory/AgentFactory';
import { MechAgent } from '../generated/schema';
import { AgentMech } from '../generated/templates';
import { getOrCreateCreateMechEntity, getServiceIdFromAgentId } from './utils';

export function handleCreateMech(event: CreateMechEvent): void {
  let entity = getOrCreateCreateMechEntity(event);
  entity.mech = event.params.mech;
  entity.agentId = event.params.agentId;
  entity.price = event.params.price;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let mechAgent = MechAgent.load(event.params.agentId.toString());
  log.info("Mech agent: {}", [event.params.agentId.toString()]);
  let serviceId = getServiceIdFromAgentId(event.params.agentId);

  if (serviceId === null) {
    // log.critical("Service ID not found for agent {0}", [event.params.agentId.toHexString()]);
    return;
  }

  // Mech is created after agent, which already handles mechAgent creation
  // add this check just in case
  if (mechAgent !== null) {
    mechAgent.mech = event.params.mech;
    mechAgent.address = event.params.mech;
    mechAgent.service = serviceId;
    mechAgent.save();
  } else {
    mechAgent = new MechAgent(event.params.agentId.toString());
    mechAgent.mech = event.params.mech;
    mechAgent.address = event.params.mech;
    mechAgent.service = serviceId;
    mechAgent.totalTransactions = BigInt.fromI32(0);
    mechAgent.save();
  }

  AgentMech.create(event.params.mech);
}