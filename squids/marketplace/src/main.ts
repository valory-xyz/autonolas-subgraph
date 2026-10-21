// Entry point: decode-and-dispatch only. Event semantics live in
// src/handlers.ts (unit-tested); the data sources are in src/processor.ts.

import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { dataSource } from "./processor";
import { lc } from "@olas/squid-shared";
import { EntityCache } from "./entityCache";
import * as registry from "./abi/ServiceRegistryL2/events";
import * as metadata from "./abi/ComplementaryServiceMetadata/events";
import * as karma from "./abi/Karma/events";
import * as mech from "./abi/MechFixedPriceNative/events";
import * as h from "./handlers";
import type { Ctx } from "./handlers";
import { decodeFactoryLog, decodeForeign, decodeMarketplaceLog, eventMeta } from "./decode";
import { probeRpc, rpcOlasPool, rpcPriceSource } from "./rpc";
import {
  CHAIN,
  COMPLEMENTARY_SERVICE_METADATA,
  KARMA,
  MECH_FACTORY_ADDRESSES,
  MECH_MARKETPLACE,
  SERVICE_REGISTRY_L2,
} from "./constants";


// run() ctx carries no logger; create our own.
const logger = createLogger("sqd:processor:mapping");

const FACTORY_SET = new Set(MECH_FACTORY_ADDRESSES);

// Informational only (see rpc.ts).
const probed = probeRpc();

run(
  dataSource,
  new TypeormDatabase({ supportHotBlocks: true, isolationLevel: 'READ COMMITTED' }),
  async (ctx) => {
    await probed;
    const cache = new EntityCache(ctx.store);
    cache.log = logger;
    const hctx: Ctx = {
      cache,
      log: logger,
      price: rpcPriceSource,
      olasPool: rpcOlasPool,
      ...h.newBatchState(),
    };

    let lastBlockNumber = 0n;
    let lastBlockTimestamp = 0n;

    for (const block of ctx.blocks.map(augmentBlock)) {
      lastBlockNumber = BigInt(block.header.number);
      lastBlockTimestamp = BigInt(Math.floor(Number(block.header.timestamp) / 1000));

      for (const log of block.logs) {
        const address = log.address; // SQD normalizes to lowercase
        const topic0 = log.topics[0];
        const meta = eventMeta(block.header, log);

        // --- MechMarketplace (proxy), V1 or V2 ABI by block ------------
        if (address === MECH_MARKETPLACE) {
          const e = decodeMarketplaceLog(log, block.header.number, CHAIN.mechMarketplaceV1EndBlock);
          if (e?.kind === "CreateMech") {
            await h.handleCreateMech(hctx, meta, e);
          } else if (e?.kind === "MarketplaceRequest") {
            await h.handleMarketplaceRequest(hctx, meta, e);
          } else if (e?.kind === "MarketplaceDelivery") {
            await h.handleMarketplaceDelivery(hctx, meta, e);
          } else if (e?.kind === "MarketplaceDeliveryWithSignatures") {
            await h.handleMarketplaceDeliveryWithSignatures(hctx, meta, e);
          } else if (e?.kind === "Deliver") {
            await h.handleDeliverWithSignatures(hctx, meta, e);
          }
          continue;
        }

        // --- ServiceRegistryL2 ---------------------------------------
        if (address === SERVICE_REGISTRY_L2) {
          if (topic0 === registry.CreateService.topic) {
            const e = registry.CreateService.decode(log);
            await h.handleCreateService(hctx, meta, {
              serviceId: e.serviceId,
              configHash: lc(e.configHash),
            });
          } else if (topic0 === registry.CreateMultisigWithAgents.topic) {
            const e = registry.CreateMultisigWithAgents.decode(log);
            await h.handleCreateMultisigWithAgents(hctx, meta, {
              serviceId: e.serviceId,
              multisig: lc(e.multisig),
            });
          } else if (topic0 === registry.RegisterInstance.topic) {
            const e = registry.RegisterInstance.decode(log);
            await h.handleRegisterInstance(hctx, meta, {
              operator: lc(e.operator),
              serviceId: e.serviceId,
              agentInstance: lc(e.agentInstance),
              agentId: e.agentId,
            });
          } else if (topic0 === registry.TerminateService.topic) {
            const e = registry.TerminateService.decode(log);
            await h.handleTerminateService(hctx, meta, { serviceId: e.serviceId });
          } else if (topic0 === registry.Transfer.topic) {
            const e = registry.Transfer.decode(log);
            await h.handleServiceTransfer(hctx, meta, {
              from: lc(e.from),
              to: lc(e.to),
              id: e.id,
            });
          } else if (topic0 === registry.UpdateService.topic) {
            const e = registry.UpdateService.decode(log);
            await h.handleUpdateService(hctx, meta, {
              serviceId: e.serviceId,
              configHash: lc(e.configHash),
            });
          }
          continue;
        }

        // --- Karma (proxy) -------------------------------------------
        if (address === KARMA) {
          if (topic0 === karma.MechKarmaChanged.topic) {
            const e = karma.MechKarmaChanged.decode(log);
            await h.handleMechKarmaChanged(hctx, meta, {
              mech: lc(e.mech),
              karmaChange: e.karmaChange,
            });
          }
          continue;
        }

        // --- ComplementaryServiceMetadata ----------------------------
        if (
          COMPLEMENTARY_SERVICE_METADATA != null &&
          address === COMPLEMENTARY_SERVICE_METADATA
        ) {
          if (topic0 === metadata.ComplementaryMetadataUpdated.topic) {
            const e = metadata.ComplementaryMetadataUpdated.decode(log);
            await h.handleComplementaryMetadataUpdated(hctx, meta, {
              serviceId: e.serviceId,
              hash: lc(e.hash),
            });
          }
          continue;
        }

        // --- Mech factories: maxDeliveryRate hand-off ----------------
        if (FACTORY_SET.has(address)) {
          const e = decodeFactoryLog(log);
          if (e != null) h.handleMechFactoryCreate(hctx, meta, e);
          continue;
        }

        // --- Mech contracts (unfiltered by address) ------------------
        //
        // Replaces the subgraph's per-mech templates. Any address may emit
        // these topics; the handlers return false for emitters without a
        // CreateMech row, and decodeForeign drops same-topic/other-layout
        // events from unrelated contracts.
        if (topic0 === mech.Request.topic) {
          const e = decodeForeign(mech.Request, log);
          if (e != null) {
            await h.handleMechRequest(hctx, meta, {
              requestId: lc(e.requestId),
              data: lc(e.data),
            });
          }
        } else if (topic0 === mech.Deliver.topic) {
          const e = decodeForeign(mech.Deliver, log);
          if (e != null) {
            await h.handleMechDeliver(hctx, meta, {
              mechServiceMultisig: lc(e.mechServiceMultisig),
              requestId: lc(e.requestId),
              deliveryRate: e.deliveryRate,
              data: lc(e.data),
            });
          }
        } else if (
          CHAIN.handlesMaxDeliveryRateUpdated &&
          topic0 === mech.MaxDeliveryRateUpdated.topic
        ) {
          const e = decodeForeign(mech.MaxDeliveryRateUpdated, log);
          if (e != null) {
            await h.handleMaxDeliveryRateUpdated(hctx, meta, {
              maxDeliveryRate: e.maxDeliveryRate,
            });
          }
        }
      }
    }

    if (lastBlockNumber > 0n) {
      h.writeIndexerStatus(hctx, lastBlockNumber, lastBlockTimestamp);
    }
    await cache.flush();
  }
);
