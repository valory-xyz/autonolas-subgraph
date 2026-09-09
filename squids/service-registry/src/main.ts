// Entry point: decode-and-dispatch only. Event semantics live in
// src/handlers.ts (unit-tested); the data sources are in src/processor.ts.
import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { dataSource } from "./processor";
import { EntityCache } from "./entityCache";
import * as registry from "./abi/ServiceRegistryL2/events";
import * as bridger from "./abi/IdentityRegistryBridge/events";
import * as safe from "./abi/GnosisSafe/events";
import * as h from "./handlers";
import type { EventMeta } from "./logic";
import { IDENTITY_REGISTRY_BRIDGER, SERVICE_REGISTRY_L2 } from "./constants";

const lc = (s: string) => s.toLowerCase();

// run() ctx carries no logger (unlike the old processor.run); create our own.
const logger = createLogger("sqd:processor:mapping");

run(
  dataSource,
  new TypeormDatabase({ supportHotBlocks: true }),
  async (ctx) => {
    const cache = new EntityCache(ctx.store);
    cache.log = logger;

    for (const block of ctx.blocks.map(augmentBlock)) {
      // SQD block timestamps are ms; every entity field and day bucket is in
      // seconds, as in the subgraph.
      const blockNumber = BigInt(block.header.number);
      const blockTimestamp = BigInt(
        Math.floor(Number(block.header.timestamp) / 1000),
      );

      for (const log of block.logs) {
        const address = log.address; // SQD normalizes to lowercase
        const topic0 = log.topics[0];
        const meta: EventMeta = {
          blockNumber,
          blockTimestamp,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        };

        // --- ServiceRegistryL2 ----------------------------------------
        if (address === SERVICE_REGISTRY_L2) {
          if (topic0 === registry.CreateService.topic) {
            const e = registry.CreateService.decode(log);
            await h.handleCreateService(cache, meta, {
              serviceId: e.serviceId,
              configHash: e.configHash,
            });
          } else if (topic0 === registry.UpdateService.topic) {
            const e = registry.UpdateService.decode(log);
            await h.handleUpdateService(cache, meta, {
              serviceId: e.serviceId,
              configHash: e.configHash,
            });
          } else if (topic0 === registry.RegisterInstance.topic) {
            const e = registry.RegisterInstance.decode(log);
            await h.handleRegisterInstance(cache, meta, {
              operator: lc(e.operator),
              serviceId: e.serviceId,
              agentId: e.agentId,
            });
          } else if (topic0 === registry.CreateMultisigWithAgents.topic) {
            const e = registry.CreateMultisigWithAgents.decode(log);
            const from = log.transaction?.from;
            if (from == null) {
              // Cannot happen with `include: { transaction: true }` on this
              // source; guard so a field-selection regression is loud.
              throw new Error(
                `CreateMultisigWithAgents at ${log.transactionHash} has no transaction.from`,
              );
            }
            await h.handleCreateMultisig(cache, meta, {
              serviceId: e.serviceId,
              multisig: lc(e.multisig),
              txFrom: lc(from),
            });
          } else if (topic0 === registry.TerminateService.topic) {
            const e = registry.TerminateService.decode(log);
            await h.handleTerminateService(cache, meta, {
              serviceId: e.serviceId,
            });
          }
          continue;
        }

        // --- IdentityRegistryBridger ----------------------------------
        if (address === IDENTITY_REGISTRY_BRIDGER) {
          if (topic0 === bridger.ServiceAgentLinked.topic) {
            const e = bridger.ServiceAgentLinked.decode(log);
            await h.handleServiceAgentLinked(cache, meta, {
              serviceId: e.serviceId,
              agentId: e.agentId,
            });
          } else if (topic0 === bridger.AgentWalletSet.topic) {
            const e = bridger.AgentWalletSet.decode(log);
            await h.handleAgentWalletSet(cache, meta, {
              agentId: e.agentId,
              multisig: lc(e.multisig),
            });
          } else if (topic0 === bridger.MetadataSet.topic) {
            const e = bridger.MetadataSet.decode(log);
            await h.handleMetadataSet(cache, meta, {
              agentId: e.agentId,
              metadataKey: e.metadataKey,
              metadataValue: e.metadataValue,
            });
          }
          continue;
        }

        // --- Safe execution, chain-wide by topic ----------------------
        // The subscription has no address filter (see processor.ts). This
        // one lookup keeps our service multisigs and drops every other
        // Safe on the chain without decoding or storing anything.
        if (
          topic0 === safe.ExecutionSuccess.topic ||
          topic0 === safe.ExecutionFromModuleSuccess.topic
        ) {
          if (!(await cache.isKnownMultisig(address))) continue;
          await h.handleSafeExecution(cache, meta, { address });
        }
      }
    }

    await cache.flush();
  },
);
