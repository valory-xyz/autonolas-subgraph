import { DataSourceBuilder, FieldSelection, type LogRequest } from "@subsquid/evm-stream";
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

type LogQuery = LogRequest & { range?: { from: number; to?: number } };
export const BLOCK_RANGE = { from: START_BLOCK };
export const LOG_QUERIES: LogQuery[] = [
  // --- ServiceRegistryL2: service lifecycle ---------------------------
  {
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
  },

  // --- IdentityRegistryBridger: ERC-8004 links ------------------------
  {
    where: {
      address: [IDENTITY_REGISTRY_BRIDGER],
      topic0: [
        bridger.ServiceAgentLinked.topic,
        bridger.AgentWalletSet.topic,
        bridger.AgentMultisigUpdated.topic,
        bridger.MetadataSet.topic,
      ],
    },
    range: { from: IDENTITY_REGISTRY_BRIDGER_START_BLOCK },
  },

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
  // 45M logs over the whole backfill, ~1% of pearl-transactions' load.
  // Polygon Portal samples from review of #174: ~0.8 / 1.3 / 1.1 combined
  // execution logs/block at 45M / 70M / 96M, below that Base-head sample.
  // If throughput becomes a bottleneck, use an address-filtered historical
  // range plus a topic-only tail (SQD's "factory contracts" pattern).
  {
    where: {
      topic0: [
        safe.ExecutionSuccess.topic,
        safe.ExecutionFromModuleSuccess.topic,
      ],
    },
  },
];

const builder = new DataSourceBuilder()
  .setPortal(portal)
  .setBlockRange(BLOCK_RANGE)
  .setFields(fields);
for (const query of LOG_QUERIES) builder.addLog(query);
export const dataSource = builder.build();
