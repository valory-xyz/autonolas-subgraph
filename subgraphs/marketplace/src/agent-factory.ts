import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import {
  CreateMech as CreateMechEvent,
} from '../generated/AgentFactory/AgentFactory';
import { MechAgent } from '../generated/schema';
import { getOrCreateCreateMechEntity, getServiceIdFromAgentId } from './utils';

export function handleCreateMech(event: CreateMechEvent): void {
  let entity = getOrCreateCreateMechEntity(event);
  entity.mech = event.params.mech;
  entity.agentId = event.params.agentId;
  entity.price = event.params.price;
  entity.source = 'MECH';

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let mechAgent = MechAgent.load(event.params.agentId.toHexString());
  log.info("Mech agent: {}", [event.params.agentId.toHexString()]);
  let serviceId = getServiceIdFromAgentId(event.params.agentId);


  if (mechAgent !== null) {
    mechAgent.mech = event.params.mech;
    mechAgent.address = event.params.mech;
    mechAgent.service = serviceId;
    mechAgent.save();
  } else {
    mechAgent = new MechAgent(event.params.agentId.toHexString());
    mechAgent.mech = event.params.mech;
    mechAgent.address = event.params.mech;
    mechAgent.service = serviceId;
    mechAgent.totalTransactions = BigInt.fromI32(0);
    mechAgent.save();
  }
}