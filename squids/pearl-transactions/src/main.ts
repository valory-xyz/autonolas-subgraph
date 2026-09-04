// Entry point: decode-and-dispatch only. Event semantics live in
// src/handlers.ts (unit-tested via src/logic.ts); the data sources are in
// src/processor.ts.

import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/evm-objects";
import { createLogger } from "@subsquid/logger";
import { dataSource } from "./processor";
import { EntityCache } from "./entityCache";
import { BondQueue } from "./logic";
import * as registry from "./abi/ServiceRegistryL2/events";
import * as srtu from "./abi/ServiceRegistryTokenUtility/events";
import * as stakingFactory from "./abi/StakingFactory/events";
import * as stakingProxy from "./abi/StakingProxy/events";
import * as safe from "./abi/GnosisSafe/events";
import * as erc20 from "./abi/ERC20Detailed/events";
import * as h from "./handlers";
import type { EventMeta, Ctx } from "./handlers";
import {
  ERC20_TOKENS,
  SERVICE_REGISTRY_L2,
  SRTU,
  STAKING_FACTORY,
  isAllowedImplementation,
} from "./constants";

const lc = (s: string) => s.toLowerCase();

/**
 * Decode a log from an ADDRESS-LESS subscription, returning null when the
 * log is not actually the event we mean.
 *
 * topic0 is keccak of the event signature, and indexed-ness is NOT part of
 * that signature. So an unrelated contract declaring
 * `event AddedOwner(address indexed owner)` produces the exact same topic0
 * as Gnosis Safe's `event AddedOwner(address owner)` but carries two topics
 * instead of one, and the decoder rightly rejects it. Address-filtered
 * sources cannot hit this; our two template replacements (Safe,
 * StakingProxy) can, and do — this fires within the first 1k blocks of the
 * Polygon range.
 *
 * Only shape mismatches are swallowed. Any other failure propagates so a
 * genuine decoding bug still crashes the batch rather than silently
 * dropping data.
 */
function decodeForeignSafe<T>(
  event: { decode(log: any): T },
  log: any
): T | null {
  try {
    // Called as a method: the decoder reads `this.topicCount`, so a bare
    // function reference would lose its receiver.
    return event.decode(log);
  } catch (err) {
    if ((err as { name?: string })?.name === "DecodingError") return null;
    throw err;
  }
}

// run() ctx carries no logger (unlike the old processor.run); create our own.
const logger = createLogger("sqd:processor:mapping");

const ERC20_SET = new Set(ERC20_TOKENS);

run(
  dataSource,
  new TypeormDatabase({ supportHotBlocks: true }),
  async (ctx) => {
    const cache = new EntityCache(
      ctx.store,
      ctx.blocks.length > 0 ? ctx.blocks[0].header.number : -1,
      ctx.blocks.length > 0
        ? ctx.blocks[ctx.blocks.length - 1].header.number
        : -1
    );
    cache.log = logger;
    // Per-tx bond-attribution state. Scoped to the batch: every producer
    // (SRTU) and consumer (registry) pair lives in one transaction, and SQD
    // never splits a block across batches.
    const bondQueue = new BondQueue();
    const hctx: Ctx = { cache, bondQueue, log: logger };

    let lastBlockNumber = 0n;
    let lastBlockTimestamp = 0n;

    for (const block of ctx.blocks.map(augmentBlock)) {
      lastBlockNumber = BigInt(block.header.number);
      // SQD block timestamps are ms; the subgraph's are seconds, and every
      // day bucket and consumer contract is in seconds.
      lastBlockTimestamp = BigInt(
        Math.floor(Number(block.header.timestamp) / 1000)
      );

      for (const log of block.logs) {
        const address = log.address; // SQD normalizes to lowercase
        const topic0 = log.topics[0];
        const meta: EventMeta = {
          blockNumber: lastBlockNumber,
          blockTimestamp: lastBlockTimestamp,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          address,
        };

        // --- ServiceRegistryL2 ---------------------------------------
        if (address === SERVICE_REGISTRY_L2) {
          if (topic0 === registry.RegisterInstance.topic) {
            const e = registry.RegisterInstance.decode(log);
            await h.handleRegisterInstance(hctx, meta, {
              serviceId: e.serviceId,
              agentId: e.agentId,
              operator: lc(e.operator),
            });
          } else if (topic0 === registry.ActivateRegistration.topic) {
            const e = registry.ActivateRegistration.decode(log);
            await h.handleActivateRegistration(hctx, meta, {
              serviceId: e.serviceId,
            });
          } else if (topic0 === registry.CreateMultisigWithAgents.topic) {
            const e = registry.CreateMultisigWithAgents.decode(log);
            await h.handleCreateMultisigWithAgents(hctx, meta, {
              serviceId: e.serviceId,
              multisig: lc(e.multisig),
            });
          } else if (topic0 === registry.Transfer.topic) {
            const e = registry.Transfer.decode(log);
            await h.handleServiceNftTransfer(hctx, meta, {
              serviceId: e.id,
              from: lc(e.from),
              to: lc(e.to),
            });
          } else if (topic0 === registry.TerminateService.topic) {
            const e = registry.TerminateService.decode(log);
            await h.handleTerminateService(hctx, meta, {
              serviceId: e.serviceId,
            });
          } else if (topic0 === registry.OperatorUnbond.topic) {
            const e = registry.OperatorUnbond.decode(log);
            await h.handleOperatorUnbond(hctx, meta, {
              serviceId: e.serviceId,
            });
          }
          continue;
        }

        // --- ServiceRegistryTokenUtility ------------------------------
        if (address === SRTU) {
          if (topic0 === srtu.TokenDeposit.topic) {
            const e = srtu.TokenDeposit.decode(log);
            await h.handleTokenDeposit(hctx, meta, {
              account: lc(e.account),
              token: lc(e.token),
              amount: e.amount,
            });
          } else if (topic0 === srtu.TokenRefund.topic) {
            const e = srtu.TokenRefund.decode(log);
            await h.handleTokenRefund(hctx, meta, {
              account: lc(e.account),
              token: lc(e.token),
              amount: e.amount,
            });
          }
          continue;
        }

        // --- StakingFactory -------------------------------------------
        if (
          address === STAKING_FACTORY &&
          topic0 === stakingFactory.InstanceCreated.topic
        ) {
          const e = stakingFactory.InstanceCreated.decode(log);
          const implementation = lc(e.implementation);
          await h.handleInstanceCreated(
            hctx,
            meta,
            { instance: lc(e.instance), implementation },
            isAllowedImplementation(implementation)
          );
          continue;
        }

        // --- ERC-20 transfers -----------------------------------------
        if (ERC20_SET.has(address) && topic0 === erc20.Transfer.topic) {
          const e = erc20.Transfer.decode(log);
          await h.handleErc20Transfer(hctx, meta, {
            from: lc(e.from),
            to: lc(e.to),
            value: e.value,
          });
          continue;
        }

        // --- StakingProxy (unfiltered by address) ---------------------
        //
        // Replaces the subgraph's StakingProxy template. Any address may
        // emit these topics, so the handlers discard proxies that are not
        // tracked StakingContracts.
        if (topic0 === stakingProxy.ServiceStaked.topic) {
          const e = decodeForeignSafe(stakingProxy.ServiceStaked, log);
          if (e != null && (await isTrackedProxy(hctx, address))) {
            await h.handleServiceStaked(hctx, meta, {
              serviceId: e.serviceId,
              owner: lc(e.owner),
              multisig: lc(e.multisig),
            });
          }
          continue;
        }
        if (topic0 === stakingProxy.RewardClaimed.topic) {
          const e = decodeForeignSafe(stakingProxy.RewardClaimed, log);
          if (e != null && (await isTrackedProxy(hctx, address))) {
            await h.handleRewardClaimed(hctx, meta, {
              serviceId: e.serviceId,
              multisig: lc(e.multisig),
              reward: e.reward,
              epoch: e.epoch,
            });
          }
          continue;
        }
        if (
          topic0 === stakingProxy.ServiceUnstaked.topic ||
          topic0 === stakingProxy.ServiceForceUnstaked.topic
        ) {
          const e = decodeForeignSafe(
            topic0 === stakingProxy.ServiceUnstaked.topic
              ? stakingProxy.ServiceUnstaked
              : stakingProxy.ServiceForceUnstaked,
            log
          );
          if (e != null && (await isTrackedProxy(hctx, address))) {
            await h.handleAnyUnstake(hctx, meta, {
              serviceId: e.serviceId,
              multisig: lc(e.multisig),
              reward: e.reward,
              epoch: e.epoch,
            });
          }
          continue;
        }
        if (topic0 === stakingProxy.ServicesEvicted.topic) {
          const e = decodeForeignSafe(stakingProxy.ServicesEvicted, log);
          if (e != null && (await isTrackedProxy(hctx, address))) {
            await h.handleServicesEvicted(hctx, meta, {
              serviceIds: e.serviceIds,
              multisigs: e.multisigs.map(lc),
              epoch: e.epoch,
            });
          }
          continue;
        }

        // --- Safe (unfiltered by address) -----------------------------
        //
        // Replaces the subgraph's Safe template. handleSafeReceived exits
        // at classifyTransfer's first guard for untracked addresses; the
        // owner handlers no-op unless the address is a known MasterSafe.
        if (topic0 === safe.SafeReceived.topic) {
          const e = decodeForeignSafe(safe.SafeReceived, log);
          if (e != null) {
            await h.handleSafeReceived(hctx, meta, {
              sender: lc(e.sender),
              value: e.value,
            });
          }
        } else if (topic0 === safe.AddedOwner.topic) {
          const e = decodeForeignSafe(safe.AddedOwner, log);
          if (e != null) {
            await h.handleSafeAddedOwner(hctx, meta, { owner: lc(e.owner) });
          }
        } else if (topic0 === safe.RemovedOwner.topic) {
          const e = decodeForeignSafe(safe.RemovedOwner, log);
          if (e != null) {
            await h.handleSafeRemovedOwner(hctx, meta, { owner: lc(e.owner) });
          }
        } else if (topic0 === safe.ChangedThreshold.topic) {
          const e = decodeForeignSafe(safe.ChangedThreshold, log);
          if (e != null) {
            await h.handleSafeChangedThreshold(hctx, meta, {
              threshold: e.threshold,
            });
          }
        }
      }
    }

    if (lastBlockNumber > 0n) {
      h.writeIndexerStatus(hctx, lastBlockNumber, lastBlockTimestamp);
    }
    await cache.flush();
    bondQueue.clear();
  }
);

/**
 * Staking events are subscribed without an address filter, so discard any
 * emitter that is not a StakingContract we created from an allowed
 * StakingFactory implementation.
 */
async function isTrackedProxy(ctx: Ctx, address: string): Promise<boolean> {
  const t = await ctx.cache.tracked(address);
  return t != null && t.role === "STAKING";
}
