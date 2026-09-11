// Pure helpers, ported from the subgraph's src/utils.ts. No store access —
// everything here is unit-testable without a database.
import { ONE_DAY } from "./constants";

export type EventMeta = {
  blockNumber: bigint;
  /** Unix seconds (SQD block headers carry ms; converted at the boundary). */
  blockTimestamp: bigint;
  txHash: string;
  logIndex: number;
};

/**
 * SQD block headers carry Unix MILLISECONDS; every entity field and day
 * bucket is in seconds, as in the subgraph. Floor, never round: a rounded-up
 * timestamp at 23:59:59.500 would land in the next day's bucket.
 */
export function blockTimestampSeconds(headerTimestampMs: number): bigint {
  return BigInt(Math.floor(headerTimestampMs / 1000));
}

/** UTC-midnight bucket, same arithmetic as the subgraph's getDayTimestamp. */
export function dayTimestamp(ts: bigint): bigint {
  return (ts / ONE_DAY) * ONE_DAY;
}

// --- Entity ids, character for character as the subgraph builds them ----

export const dailyServiceActivityId = (day: bigint, serviceId: string) =>
  `day-${day}-service-${serviceId}`;
export const dailyUniqueAgentsId = (day: bigint) => `day-${day}`;
export const dailyAgentPerformanceId = (day: bigint, agentId: number) =>
  `day-${day}-agent-${agentId}`;
export const dailyActiveMultisigsId = (day: bigint) => `day-${day}`;
export const agentRegistrationId = (serviceId: number, agentId: number) =>
  `${serviceId}-${agentId}`;
export const erc8004MetadataId = (agentId: number, key: string) =>
  `${agentId}-${key}`;
export const dailyUniqueAgentId = (dailyId: string, agentId: string) =>
  `${dailyId}-${agentId}`;
export const dailyAgentMultisigId = (perfId: string, multisig: string) =>
  `${perfId}-${multisig}`;
export const dailyActiveMultisigId = (dailyId: string, multisig: string) =>
  `${dailyId}-${multisig}`;

/**
 * The agent registered most recently at or before the multisig deployment.
 * Mirrors getMostRecentAgentId: strictly-greater timestamp wins, so on a tie
 * the first candidate in `agentIds` order is kept. Returns -1 when no
 * registration qualifies.
 */
export function mostRecentAgentId(
  agentIds: number[],
  registrationTs: (agentId: number) => bigint | undefined,
  deploymentTs: bigint,
): number {
  let best = -1;
  let bestTs = 0n;
  for (const agentId of agentIds) {
    const ts = registrationTs(agentId);
    if (ts != null && ts <= deploymentTs && ts > bestTs) {
      best = agentId;
      bestTs = ts;
    }
  }
  return best;
}

/** graph-ts `Bytes.toString()` is a UTF-8 decode; MetadataSet values are bytes. */
export function bytesToUtf8(hex: string): string {
  return Buffer.from(hex.replace(/^0x/, ""), "hex").toString("utf8");
}

export function pushUnique(list: number[], value: number): number[] {
  return list.includes(value) ? list : [...list, value];
}
