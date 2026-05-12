import { log } from '@graphprotocol/graph-ts';
import {
  ServiceAgentLinked,
  AgentWalletSet,
  MetadataSet,
} from '../generated/IdentityRegistryBridger/IdentityRegistryBridger';
import { Service } from '../generated/schema';
import {
  getOrCreateERC8004Agent,
  getOrCreateERC8004Metadata,
  initializeERC8004DefaultMetadata,
} from './utils';

// Handlers for the IdentityRegistryBridger contract. Kept in this file
// (separate from mapping.ts / mapping-eth.ts) so per-network manifests
// that don't deploy IdentityRegistryBridger — e.g. subgraph.mode-mainnet.yaml,
// where the contract doesn't exist on Mode — never reference the generated
// IdentityRegistryBridger module, and codegen for those manifests succeeds.

export function handleServiceAgentLinked(event: ServiceAgentLinked): void {
  let service = Service.load(event.params.serviceId.toString());
  if (service != null) {
    let agentId = event.params.agentId.toI32();
    let serviceId = event.params.serviceId.toI32();
    let erc8004Agent = getOrCreateERC8004Agent(agentId);
    service.erc8004Agent = erc8004Agent.id;
    service.save();
    initializeERC8004DefaultMetadata(agentId, serviceId);
  } else {
    log.warning('Service {} not found for ServiceAgentLinked event', [
      event.params.serviceId.toString(),
    ]);
  }
}

export function handleAgentWalletSet(event: AgentWalletSet): void {
  let agentId = event.params.agentId.toI32();
  let erc8004Agent = getOrCreateERC8004Agent(agentId);
  erc8004Agent.agentWallet = event.params.multisig;
  erc8004Agent.save();
}

export function handleMetadataSet(event: MetadataSet): void {
  let agentId = event.params.agentId.toI32();
  let metadata = getOrCreateERC8004Metadata(agentId, event.params.metadataKey);
  metadata.value = event.params.metadataValue.toString();
  metadata.save();
}
