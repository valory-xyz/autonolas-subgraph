import { DataSourceBuilder, FieldSelection } from "@subsquid/evm-stream";
import * as registry from "./abi/ServiceRegistryL2/events";
import * as bridger from "./abi/IdentityRegistryBridge/events";
import * as safe from "./abi/GnosisSafe/events";
import {
  CHAIN,
  IDENTITY_REGISTRY_BRIDGER,
  IDENTITY_REGISTRY_BRIDGER_START_BLOCK,
  SERVICE_REGISTRY_L2,
  START_BLOCK,
  portalFor,
} from "./constants";

// SQD Portal endpoint for this chain; see portalFor in constants.ts.
const portal = portalFor(CHAIN);

// The modern SDK has no implicit field defaults: every field the handlers
// read must be listed here, or the property does not exist at runtime.
// `logIndex` and `block.number` are always-present required fields and are
// deliberately NOT listed (listing them is a type error).
const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
  // `from` is the service creator on CreateMultisigWithAgents (the subgraph
  // reads event.transaction.from).
  transaction: { from: true },
} satisfies FieldSelection;

export type Fields = typeof fields;

export const dataSource = new DataSourceBuilder()
  .setPortal(portal)
  .setBlockRange({ from: START_BLOCK })
  .setFields(fields)

  // --- ServiceRegistryL2: service lifecycle ---------------------------
  .addLog({
    where: {
      address: [SERVICE_REGISTRY_L2],
      topic0: [
        registry.CreateService.topic,
        registry.UpdateService.topic,
        registry.CreateMultisigWithAgents.topic,
        registry.RegisterInstance.topic,
        registry.TerminateService.topic,
      ],
    },
    include: { transaction: true },
  })

  // --- IdentityRegistryBridger: ERC-8004 links ------------------------
  .addLog({
    where: {
      address: [IDENTITY_REGISTRY_BRIDGER],
      topic0: [
        bridger.ServiceAgentLinked.topic,
        bridger.AgentWalletSet.topic,
        bridger.MetadataSet.topic,
      ],
    },
    range: { from: IDENTITY_REGISTRY_BRIDGER_START_BLOCK },
  })

  // --- Safe execution events (replaces the GnosisSafe template) -------
  //
  // graph-node spawned a template per service multisig at
  // CreateMultisigWithAgents. SQD has no templates and the data source is
  // fixed at build time, so subscribe by topic with NO address filter and
  // drop every log whose address is not a known service multisig in the
  // handler (EntityCache.isKnownMultisig, an in-memory set). Nothing about
  // foreign Safes is stored.
  //
  // Measured on Robinhood before committing to it: 11 ExecutionSuccess and
  // 0 ExecutionFromModuleSuccess logs over 20,000 blocks (~34 min), from 7
  // Safes — about 470 logs a day chain-wide. On Base (SQD portal sample,
  // BDMARK-2310): 0.02 logs/block at 15M, 0.9 at 46M, ~10.7 at head — about
  // 45M logs over the whole backfill, ~1% of pearl-transactions' load. If
  // that ever grows to Polygon levels, split this into an address-filtered
  // range up to a checkpoint plus a topic-only tail (the "factory
  // contracts" pattern in SQD's docs).
  .addLog({
    where: {
      topic0: [
        safe.ExecutionSuccess.topic,
        safe.ExecutionFromModuleSuccess.topic,
      ],
    },
  })

  .build();
