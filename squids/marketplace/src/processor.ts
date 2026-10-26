import { DataSourceBuilder, FieldSelection, LogRequest } from "@subsquid/evm-stream";
import { getIngestionConfig } from "@olas/squid-shared";
import { EvmRpcDataSourceBuilder } from "@subsquid/squid-sdk/evm/rpc";
import * as registry from "./abi/ServiceRegistryL2/events";
import * as metadata from "./abi/ComplementaryServiceMetadata/events";
import * as karma from "./abi/Karma/events";
import * as mech from "./abi/MechFixedPriceNative/events";
import { factoryEvent, marketplaceEras, marketplaceTopics } from "./decode";
import {
  CHAIN,
  KARMA,
  MECH_FACTORY_ADDRESSES,
  MECH_MARKETPLACE,
  SERVICE_REGISTRY_L2,
  START_BLOCK,
  assertPortalDataset,
} from "./constants";

export { selectIngestSource, type IngestSource } from "@olas/squid-shared";

const ingestion = getIngestionConfig(CHAIN);
if (ingestion.source === "portal") {
  assertPortalDataset(
    typeof ingestion.portal === "string" ? ingestion.portal : ingestion.portal.url,
    CHAIN
  );
}

// The modern SDK has no implicit field defaults: every field the handlers
// read must be listed here, or the property does not exist at runtime.
// `logIndex` and `block.number` are always-present required fields and are
// deliberately NOT listed (listing them is a type error).
const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
  // `from` is Mech.owner at CreateMech and the direct-path Request/Deliver
  // sender; `to` is the marketplace-vs-direct classification. Only the
  // subscriptions that set `include: {transaction: true}` carry them.
  transaction: { from: true, to: true },
} satisfies FieldSelection;

export type Fields = typeof fields;

const factoryStart = Math.min(...CHAIN.mechFactories.map((f) => f.startBlock));
const factoryTopics = [...new Set(CHAIN.mechFactories.map((f) => factoryEvent(f.event).topic))];

type LogQuery = LogRequest & { range?: { from: number; to?: number } };

/** The subscriptions, identical for both sources (same query surface). */
export const LOG_QUERIES: LogQuery[] = [
  // --- ServiceRegistryL2: service lifecycle ---------------------------
  {
    where: {
      address: [SERVICE_REGISTRY_L2],
      topic0: [
        registry.CreateService.topic,
        registry.Transfer.topic,
        registry.UpdateService.topic,
        registry.CreateMultisigWithAgents.topic,
        registry.RegisterInstance.topic,
        registry.TerminateService.topic,
      ],
    },
    range: { from: CHAIN.serviceRegistryL2.startBlock },
  },

  // --- Karma (proxy) ---------------------------------------------------
  {
    where: { address: [KARMA], topic0: [karma.MechKarmaChanged.topic] },
    range: { from: CHAIN.karma.startBlock },
  },

  // --- MechMarketplace (proxy) ----------------------------------------
  //
  // One query per ABI era (decode.ts marketplaceEras, the single definition
  // of the V1/V2 cutover), as the subgraph's MechMarketplaceV1 / V2 data
  // sources. A chain that launched on V2 (Robinhood) has only the V2 era.
  ...marketplaceEras(CHAIN.mechMarketplace.startBlock, CHAIN.mechMarketplaceV1EndBlock).map(
    (era): LogQuery => ({
      where: { address: [MECH_MARKETPLACE], topic0: marketplaceTopics(era.abi) },
      include: { transaction: true },
      range: era.to == null ? { from: era.from } : { from: era.from, to: era.to },
    })
  ),

  // --- Mech factories: the maxDeliveryRate hand-off --------------------
  //
  // Each factory emits its own `CreateMech<Kind>` right before the
  // marketplace's `CreateMech` in the same tx. Every configured event name is
  // listed for every factory address, because a deployment's event name does
  // not always match its kind (Robinhood's USDC factory emits
  // `CreateMechFixedPriceToken`, see constants.ts).
  {
    where: {
      address: MECH_FACTORY_ADDRESSES,
      topic0: factoryTopics,
    },
    range: { from: factoryStart },
  },

  // --- Mech contracts (replaces the four graph-node templates) --------
  //
  // graph-node spawned a template per mech at CreateMech. SQD has no
  // templates, so subscribe by topic with NO address filter and discard
  // emitters that are not a known mech (CreateMech lookup) in main.ts.
  // These three signatures are OlasMech-specific and the marketplace's own
  // `Deliver` has a different arity (hence a different topic0), so the
  // unfiltered volume is the mechs' own traffic plus nothing measurable.
  //
  // MaxDeliveryRateUpdated only where the subgraph's templates handle it
  // (not on Base).
  {
    where: {
      topic0: [
        mech.Request.topic,
        mech.Deliver.topic,
        ...(CHAIN.handlesMaxDeliveryRateUpdated ? [mech.MaxDeliveryRateUpdated.topic] : []),
      ],
    },
    include: { transaction: true },
    range: { from: CHAIN.mechMarketplace.startBlock },
  },

  // --- ComplementaryServiceMetadata (optional per chain) ---------------
  ...(CHAIN.complementaryServiceMetadata == null
    ? []
    : [
        {
          where: {
            address: [CHAIN.complementaryServiceMetadata.address],
            topic0: [metadata.ComplementaryMetadataUpdated.topic],
          },
          range: { from: CHAIN.complementaryServiceMetadata.startBlock },
        } satisfies LogQuery,
      ]),
];

function addQueries<B extends { addLog(q: LogQuery): B }>(builder: B): B {
  let b = builder;
  for (const q of LOG_QUERIES) b = b.addLog(q);
  return b;
}

export const INGEST_SOURCE = ingestion.source;

function buildPortalSource() {
  return addQueries(
    new DataSourceBuilder()
      .setPortal(ingestion.portal)
      .setBlockRange({ from: START_BLOCK })
      .setFields(fields)
  ).build();
}

function buildRpcSource() {
  return addQueries(
    new EvmRpcDataSourceBuilder()
      .setRpc(ingestion.rpc)
      .setBlockRange({ from: START_BLOCK })
      .setFields(fields)
  ).build();
}

export const dataSource =
  INGEST_SOURCE === "portal" ? buildPortalSource() : buildRpcSource();
