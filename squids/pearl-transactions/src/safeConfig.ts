// Safe owner/threshold resolution WITHOUT an RPC node.
//
// The subgraph had to eth_call getOwners()/getThreshold() because a
// graph-node template only starts at the block it is spawned — there was no
// way to look into the past. A squid has no such limit: the portal answers
// ad-hoc, address-filtered log queries over any range, so a Safe's owner set
// can be reconstructed from its own events.
//
//   SafeSetup(initiator, owners, threshold, ...)  -> the initial set
//   AddedOwner / RemovedOwner / ChangedThreshold  -> applied in order
//
// Folding those up to the sighting block reproduces exactly what
// getOwners() would have returned there, and removes the archive-RPC
// requirement, the revert-vs-transient-failure classification, and the
// class of bug where a rate-limit blip permanently mislabels a real Master
// Safe as "not a Safe".
//
// Verified against the live Base subgraph: Safe
// 0x000c3b0e…603b resolves to owner 0x955aeb67…53c6 from events alone,
// matching the masterEoa that deployment got from getOwners().

import { DataSourceBuilder } from "@subsquid/evm-stream";
import type { PortalClientOptions } from "@subsquid/portal-client";
import * as safe from "./abi/GnosisSafe/events";
import { CHAIN, SAFE_LOOKBACK_FLOOR } from "./constants";

export interface SafeConfig {
  owners: string[];
  threshold: bigint;
}

/** address -> config, or null when the address is not a Safe. */
const memo = new Map<string, SafeConfig | null>();

function portal(): string | PortalClientOptions {
  const url = process.env.SQD_PORTAL_URL ?? CHAIN.portalDataset;
  return process.env.SQD_PORTAL_API_KEY
    ? { url, http: { headers: { "x-api-key": process.env.SQD_PORTAL_API_KEY } } }
    : url;
}

/**
 * Owners + threshold for `address` as of `upToBlock`, or null when the
 * address never emitted a SafeSetup in range — which is the not-a-Safe
 * signal, and a cleaner one than an eth_call revert.
 *
 * One targeted query per discovered Master Safe. Address-filtered, so the
 * portal skips chunks on their stats rather than scanning; against a main
 * stream moving ~133 logs/block for 12.8M blocks this does not register.
 * Memoized for the process lifetime — a Safe's history up to a fixed block
 * cannot change.
 *
 * The floor matters: a Safe created before SAFE_LOOKBACK_FLOOR has no
 * SafeSetup in range and reads as not-a-Safe. It is set to the chain's
 * start block, on the reasoning that a Pearl Master Safe is created during
 * onboarding and cannot predate the registry we index from. Sampled Safes
 * are created only a few hundred blocks before first sighting.
 */
export async function getSafeConfig(
  address: string,
  upToBlock: number
): Promise<SafeConfig | null> {
  if (memo.has(address)) return memo.get(address)!;

  const src = new DataSourceBuilder()
    .setPortal(portal())
    .setBlockRange({ from: SAFE_LOOKBACK_FLOOR })
    .setFields({ log: { address: true, topics: true, data: true } })
    .addLog({
      where: {
        address: [address],
        topic0: [
          safe.SafeSetup.topic,
          safe.AddedOwner.topic,
          safe.RemovedOwner.topic,
          safe.ChangedThreshold.topic,
        ],
      },
    })
    .build();

  let owners: string[] | null = null;
  let threshold = 0n;

  for await (const batch of src.getFinalizedStream({
    from: SAFE_LOOKBACK_FLOOR,
    to: upToBlock,
  })) {
    for (const block of batch.blocks) {
      for (const log of block.logs ?? []) {
        switch (log.topics[0]) {
          case safe.SafeSetup.topic: {
            // A re-setup would be a proxy re-initialisation; last wins,
            // matching what an eth_call at the sighting block would see.
            const e = safe.SafeSetup.decode(log);
            owners = e.owners.map((o) => o.toLowerCase());
            threshold = e.threshold;
            break;
          }
          case safe.AddedOwner.topic: {
            if (owners == null) break; // owner churn before setup: not ours
            const o = safe.AddedOwner.decode(log).owner.toLowerCase();
            if (!owners.includes(o)) owners.push(o);
            break;
          }
          case safe.RemovedOwner.topic: {
            if (owners == null) break;
            const o = safe.RemovedOwner.decode(log).owner.toLowerCase();
            owners = owners.filter((x) => x !== o);
            break;
          }
          case safe.ChangedThreshold.topic:
            threshold = safe.ChangedThreshold.decode(log).threshold;
            break;
        }
      }
    }
  }

  // No SafeSetup, or every owner removed — not a Safe we can attribute.
  const cfg =
    owners == null || owners.length === 0 ? null : { owners, threshold };
  memo.set(address, cfg);
  return cfg;
}

/** Test seam: drop the process-lifetime memo. */
export function resetSafeConfigMemoForTests(): void {
  memo.clear();
}
