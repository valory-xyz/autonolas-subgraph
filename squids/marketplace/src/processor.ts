import { DataSourceBuilder, FieldSelection, LogRequest } from "@subsquid/evm-stream";
import type { PortalClientOptions } from "@subsquid/portal-client";
import { EvmRpcDataSourceBuilder } from "@subsquid/squid-sdk/evm/rpc";
import * as registry from "./abi/ServiceRegistryL2/events";
import * as metadata from "./abi/ComplementaryServiceMetadata/events";
import * as karma from "./abi/Karma/events";
import * as marketplace from "./abi/MechMarketplaceV2/events";
import * as factoryNative from "./abi/MechFactoryFixedPriceNative/events";
import * as factoryToken from "./abi/MechFactoryFixedPriceToken/events";
import * as mech from "./abi/MechFixedPriceNative/events";
import {
  CHAIN,
  KARMA,
  MECH_FACTORY_ADDRESSES,
  MECH_MARKETPLACE,
  SERVICE_REGISTRY_L2,
  START_BLOCK,
} from "./constants";

// Where blocks come from: INGEST_SOURCE=portal | rpc; unset = portal when
// SQD_PORTAL_API_KEY is set, rpc otherwise. See README, "Where blocks come from".
export type IngestSource = "portal" | "rpc";

export function selectIngestSource(env: NodeJS.ProcessEnv = process.env): IngestSource {
  const explicit = env.INGEST_SOURCE?.trim().toLowerCase();
  if (explicit === "portal" || explicit === "rpc") return explicit;
  if (explicit) {
    throw new Error(`INGEST_SOURCE="${env.INGEST_SOURCE}" must be "portal" or "rpc"`);
  }
  return env.SQD_PORTAL_API_KEY ? "portal" : "rpc";
}

// The private portal URL + key come from env; never commit them.
const portalUrl = process.env.SQD_PORTAL_URL ?? CHAIN.portalDataset;
const portal: string | PortalClientOptions = process.env.SQD_PORTAL_API_KEY
  ? {
      url: portalUrl,
      http: { headers: { "x-api-key": process.env.SQD_PORTAL_API_KEY } },
    }
  : portalUrl;

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
  // V2 ABI only: the chain launched on the current marketplace, there is no
  // V1 event range to bridge (the subgraph's dual V1/V2 data sources).
  {
    where: {
      address: [MECH_MARKETPLACE],
      topic0: [
        marketplace.CreateMech.topic,
        marketplace.MarketplaceRequest.topic,
        marketplace.MarketplaceDelivery.topic,
        marketplace.MarketplaceDeliveryWithSignatures.topic,
        marketplace.Deliver.topic, // signed (off-chain) per-request delivery
      ],
    },
    include: { transaction: true },
    range: { from: CHAIN.mechMarketplace.startBlock },
  },

  // --- Mech factories: the maxDeliveryRate hand-off --------------------
  //
  // Each factory emits its own `CreateMech<Kind>` right before the
  // marketplace's `CreateMech` in the same tx. Both topics are listed for
  // every factory address because the deployed USDC factory emits the
  // `CreateMechFixedPriceToken` name (see constants.ts).
  {
    where: {
      address: MECH_FACTORY_ADDRESSES,
      topic0: [
        factoryNative.CreateMechFixedPriceNative.topic,
        factoryToken.CreateMechFixedPriceToken.topic,
      ],
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
  {
    where: {
      topic0: [
        mech.Request.topic,
        mech.Deliver.topic,
        mech.MaxDeliveryRateUpdated.topic,
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

export const INGEST_SOURCE: IngestSource = selectIngestSource();

function buildPortalSource() {
  return addQueries(
    new DataSourceBuilder()
      .setPortal(portal)
      .setBlockRange({ from: START_BLOCK })
      .setFields(fields)
  ).build();
}

function buildRpcSource() {
  const url = process.env.RPC_HTTP ?? CHAIN.defaultRpc;
  const rateLimit = process.env.RPC_RATE_LIMIT
    ? Number(process.env.RPC_RATE_LIMIT)
    : undefined;
  return addQueries(
    new EvmRpcDataSourceBuilder()
      .setRpc({
        url,
        // No shipped preset for this chain; passing explicit validation
        // options is what clears the SDK's "parity unverified" warning.
        // Block hash + logs bloom are cheap and catch a node handing back
        // a wrong or log-less block. Finality is left to the node's own
        // `finalized` tag (Nitro reports L1 finality), so no confirmation
        // depth is set here.
        network: CHAIN.chainId,
        rpc: { verifyBlockHash: true, verifyLogsBloom: true },
        ...(rateLimit != null && Number.isFinite(rateLimit) ? { rateLimit } : {}),
      })
      .setBlockRange({ from: START_BLOCK })
      .setFields(fields)
  ).build();
}

export const dataSource =
  INGEST_SOURCE === "portal" ? buildPortalSource() : buildRpcSource();
