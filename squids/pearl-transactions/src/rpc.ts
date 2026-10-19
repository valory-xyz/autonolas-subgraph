// The Safe eth_calls the subgraph makes, ported to viem.
//
// Only getOwners/getThreshold remain here: the StakingProxy config is
// decoded from the createStakingInstance calldata instead (see
// src/stakingConfig.ts), so those two calls are gone.
//
// Unlike graph-node (where contract calls are the indexer's cost), RPC here
// is ours to pay for — so SUCCESSFUL results are memoized for the process
// lifetime. Both are one-shot per Master Safe at first sighting.

import { createPublicClient, http, type PublicClient } from "viem";
import { CHAIN, SERVICE_REGISTRY_L2 } from "./constants";

// Erigon archive nodes reject a historical eth_call whose `from` has no
// state at that block; the zero-address default has none.
const CALL_FROM = SERVICE_REGISTRY_L2 as `0x${string}`;

const clientFor = (url: string): PublicClient =>
  createPublicClient({ transport: http(url, { batch: true }) });

/**
 * First non-empty of `generic`, then its legacy Polygon `alias`, with the
 * var name it came from. The alias is honoured only on matic: on any other
 * chain a set alias throws.
 */
export function rpcFromEnv(
  generic: string,
  alias: string,
  chainName: string = CHAIN.name
): { url: string; envName: string } | null {
  const genericUrl = process.env[generic];
  const aliasUrl = process.env[alias];
  if (aliasUrl && chainName !== "matic") {
    throw new Error(
      `${alias} is set, but it is a Polygon-only legacy alias and ` +
        `PEARL_TRANSACTIONS_CHAIN="${chainName}". Unset ${alias} and set ` +
        `${generic} to a ${chainName} archive RPC.`
    );
  }
  if (genericUrl && aliasUrl && genericUrl !== aliasUrl) {
    // Names only: the URLs may carry API keys.
    console.warn(
      `[rpc] Both ${generic} and ${alias} are set with different values; ` +
        `using ${generic}. Unset ${alias} to silence this.`
    );
  }
  if (genericUrl) return { url: genericUrl, envName: generic };
  if (aliasUrl) return { url: aliasUrl, envName: alias };
  return null;
}

const primaryRpc = rpcFromEnv("RPC_HTTP", "RPC_POLYGON_HTTP") ?? {
  url: CHAIN.defaultRpc,
  envName: `default public RPC (${CHAIN.defaultRpc})`,
};
const primary = clientFor(primaryRpc.url);

/**
 * Optional second archive endpoint, tried when the primary fails with
 * something that is NOT a trusted revert (e.g. a hole in its archive), and
 * as the second check on every "not a Safe" verdict. Sees only those calls,
 * so a rate-limited endpoint is fine.
 */
const fallbackRpc = rpcFromEnv("RPC_HTTP_FALLBACK", "RPC_POLYGON_HTTP_FALLBACK");
const fallback: PublicClient | null = fallbackRpc
  ? clientFor(fallbackRpc.url)
  : null;

const SAFE_ABI = [
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const OWNER_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export interface SafeConfig {
  owners: string[];
  threshold: bigint;
}

/**
 * address -> config. ONLY successful probes are cached.
 *
 * A negative result is deliberately not memoized. The subgraph re-probes on
 * every sighting (`try_getOwners` with no negative cache), and caching
 * "not a Safe" for the process lifetime diverges from that in three ways
 * that all end in a user's history being wrong or missing:
 *
 *  - a hot-block reorg re-invokes the handler in the SAME process, so a
 *    verdict derived on the discarded fork would be reused for the
 *    canonical chain (EntityCache guards its own index with
 *    `builtThroughBlock` for exactly this reason; a Map has no such guard);
 *  - a counterfactual Safe probed before deployment reverts once and would
 *    stay "not a Safe" for the rest of the backfill, no reorg needed;
 *  - a mid-run failover to a pruned peer returns
 *    ContractFunctionZeroDataError, which is indistinguishable from a real
 *    revert, and assertArchiveRpc only runs at startup.
 *
 * Re-probing costs little: staking proxies are filtered out by the
 * StakingContract check before this is ever called, so the repeat traffic
 * is the rare EOA that receives a service NFT.
 */
const safeMemo = new Map<string, SafeConfig>();

// viem keeps the node's own text in `details`; `shortMessage` is generic.
const firstLine = (e: unknown): string => {
  const err = e as { details?: string; shortMessage?: string; message?: string };
  const text = String(err?.details || err?.shortMessage || err?.message || e);
  // Some gateways prefix `details` with a newline; skip blank lines.
  return text.split("\n").find((l) => l.trim())?.trim() ?? text;
};

/** One historical read against one client; always pinned, always with `from`. */
function readAt<const abi extends readonly unknown[], fn extends string>(
  client: PublicClient,
  address: string,
  abi: abi,
  functionName: fn,
  blockNumber: number
) {
  return client.readContract({
    address: address as `0x${string}`,
    abi,
    functionName,
    blockNumber: BigInt(blockNumber),
    account: CALL_FROM,
  } as any);
}

/**
 * Does `client` hold state for the registry at `blockNumber`? False only
 * for empty code; any other error (rate limit, timeout, pruned-history
 * error) is rethrown so the caller can surface the real cause.
 */
async function hasStateAt(
  client: PublicClient,
  blockNumber: number
): Promise<boolean> {
  const code = await client.getCode({
    address: SERVICE_REGISTRY_L2 as `0x${string}`,
    blockNumber: BigInt(blockNumber),
  });
  return code != null && code !== "0x";
}

/** Deliberately not a revert (no cause chain to one), so isRevert rejects it. */
class UnprovenRevertError extends Error {
  name = "UnprovenRevertError";
  constructor(envName: string, blockNumber: number, err: unknown) {
    super(
      `${envName} reverted at block ${blockNumber} (${firstLine(err)}) but ` +
        `holds no state for the service registry there, so the revert is ` +
        `not trusted`
    );
  }
}

/**
 * A Safe probe read. Primary first; on a failure, the identical call on the
 * fallback. A revert from EITHER endpoint is only trusted if that endpoint
 * holds state at the block: a pruned or lagging node answers `0x`, which
 * viem reports as a revert, and that would silently mislabel a real Safe.
 * An unproven primary revert, or a failed state check, goes to the
 * fallback like any other failure; with no usable fallback, a non-revert
 * error is thrown so the batch retries instead of recording "not a Safe".
 */
async function historicalRead<
  const abi extends readonly unknown[],
  fn extends string,
>(address: string, abi: abi, functionName: fn, blockNumber: number) {
  let primaryErr: unknown;
  try {
    return await readAt(primary, address, abi, functionName, blockNumber);
  } catch (err) {
    if (!isRevert(err)) primaryErr = err;
    else {
      let proven = false;
      try {
        proven = await hasStateAt(primary, blockNumber);
      } catch (codeErr) {
        primaryErr = codeErr;
      }
      if (proven) throw err;
      primaryErr ??= new UnprovenRevertError(primaryRpc.envName, blockNumber, err);
    }
  }
  if (fallback == null) throw primaryErr;
  console.warn(
    `[rpc] primary failed for ${functionName}(${address}) at block ` +
      `${blockNumber} — ${firstLine(primaryErr)} — retrying on ${fallbackRpc?.envName}`
  );
  try {
    return await readAt(fallback, address, abi, functionName, blockNumber);
  } catch (fbErr) {
    if (isRevert(fbErr)) {
      const proven = await hasStateAt(fallback, blockNumber).catch(() => false);
      if (!proven) throw primaryErr;
    }
    throw fbErr;
  }
}

/** Wait before re-probing a "not a Safe" on the primary (no fallback set). */
export const NEGATIVE_RECHECK_MS = 500;

/**
 * One read on one client, with a revert trusted only if that client holds
 * state at the block; otherwise a non-revert is thrown so the batch retries.
 */
async function provenRead(
  client: PublicClient,
  envName: string,
  address: string,
  functionName: "getOwners" | "getThreshold",
  blockNumber: number
) {
  try {
    return await readAt(client, address, SAFE_ABI, functionName, blockNumber);
  } catch (err) {
    if (isRevert(err) && !(await hasStateAt(client, blockNumber))) {
      throw new UnprovenRevertError(envName, blockNumber, err);
    }
    throw err;
  }
}

/**
 * Both Safe reads through `read`: the config, or null for a revert or empty
 * owners ("not a Safe", as in the subgraph). Anything else is rethrown.
 */
async function probeSafe(
  read: (functionName: "getOwners" | "getThreshold") => Promise<unknown>
): Promise<SafeConfig | null> {
  try {
    const [owners, threshold] = (await Promise.all([
      read("getOwners"),
      read("getThreshold"),
    ])) as [readonly `0x${string}`[], bigint];
    if (owners.length === 0) return null;
    return { owners: owners.map((o) => o.toLowerCase()), threshold };
  } catch (err) {
    if (isRevert(err)) return null;
    throw err;
  }
}

/**
 * Owners + threshold for a Safe, read AT `blockNumber`.
 *
 * The block pin is not optional. Owner lists change — that is precisely why
 * AddedOwner / RemovedOwner / ChangedThreshold are indexed — so reading at
 * `latest` and then replaying historical owner events on top of today's list
 * would produce a wrong owner set and, worse, a wrong `masterEoa`. Reading
 * at the first-sighting block reproduces what the subgraph saw.
 *
 * This makes RPC_HTTP an ARCHIVE endpoint requirement for backfill.
 *
 * Returns null when the address is not a Safe: `getOwners` reverts on
 * anything else, which is how the subgraph distinguishes a Master Safe from
 * the other things a service NFT can land on (a staking proxy, an EOA).
 *
 * "Not a Safe" needs two agreeing checks; a positive from either wins. A
 * single check is not enough: viem reports ANY JSON-RPC -32603 (a
 * provider's internal/upstream error) as ContractFunctionRevertedError, and
 * the state check passes because the node does hold the block, so one
 * provider blip would drop a real Master Safe. The second check re-runs
 * both reads on the fallback when one is set (a revert there trusted only
 * if the fallback holds state), otherwise on the primary after
 * NEGATIVE_RECHECK_MS.
 *
 * A negative verdict is NOT cached — see safeMemo for why. Transport errors
 * are rethrown rather than swallowed, so SQD retries the batch.
 */
export async function getSafeConfig(
  address: string,
  blockNumber: number
): Promise<SafeConfig | null> {
  const memoKey = address;
  const hit = safeMemo.get(memoKey);
  if (hit != null) return hit;

  let cfg = await probeSafe((fn) =>
    historicalRead(address, SAFE_ABI, fn, blockNumber)
  );

  if (cfg == null) {
    const recheck = fallbackRpc?.envName ?? `${primaryRpc.envName} (re-probe)`;
    if (fallback != null && fallbackRpc != null) {
      const fb = fallback;
      const envName = fallbackRpc.envName;
      cfg = await probeSafe((fn) =>
        provenRead(fb, envName, address, fn, blockNumber)
      );
    } else {
      await new Promise((r) => setTimeout(r, NEGATIVE_RECHECK_MS));
      cfg = await probeSafe((fn) =>
        historicalRead(address, SAFE_ABI, fn, blockNumber)
      );
    }
    if (cfg != null) {
      console.warn(
        `[rpc] ${address} read as NOT-a-Safe at block ${blockNumber} on the ` +
          `first check, but ${recheck} resolved it as a Safe; using that.`
      );
    }
  }

  if (cfg == null) {
    // Logged loudly because the benign reading ("the NFT went to an EOA")
    // and the catastrophic one ("the RPC lied and we just dropped a real
    // user's Master Safe") look identical here. Not cached, so a later
    // sighting re-probes.
    console.warn(
      `[rpc] ${address} classified NOT-a-Safe at block ${blockNumber} ` +
        `(getOwners reverted, returned no code or no owners, on both ` +
        `checks). If this address is a real Master Safe, the RPC is wrong — ` +
        `check it is archive-capable.`
    );
  }
  // Negative results are NOT cached — see safeMemo.
  if (cfg != null) safeMemo.set(memoKey, cfg);
  return cfg;
}

/**
 * Fail fast if an endpoint cannot serve historical state: a pruned node
 * reads every Safe as "not a Safe". The registry must have code at
 * START_BLOCK and answer an eth_call shaped like the Safe probes (same
 * `from`). Checks the primary directly (not via the fallback, which would
 * mask it), then the fallback if set; either failing is fatal.
 */
export async function assertArchiveRpc(
  registryAddress: string,
  startBlock: number
): Promise<void> {
  await assertClientArchive(primary, primaryRpc.envName, registryAddress, startBlock, {
    noCode: `every Safe probe would be silently misread as "not a Safe"`,
    noCall: "the backfill would stall on the first Master Safe",
  });
  if (fallback != null && fallbackRpc != null) {
    const fbImpact =
      "the fallback could not cover a hole in the primary's archive, so " +
      "the backfill would stall there. Fix it, or unset it to run on the " +
      "primary alone";
    await assertClientArchive(
      fallback,
      fallbackRpc.envName,
      registryAddress,
      startBlock,
      { noCode: fbImpact, noCall: fbImpact }
    );
  }
}

async function assertClientArchive(
  client: PublicClient,
  envName: string,
  registryAddress: string,
  startBlock: number,
  impact: { noCode: string; noCall: string }
): Promise<void> {
  let code: string;
  try {
    code =
      (await client.getCode({
        address: registryAddress as `0x${string}`,
        blockNumber: BigInt(startBlock),
      })) ?? "0x";
  } catch (err) {
    throw new Error(
      `${envName} cannot read state at block ${startBlock}: ` +
        `${firstLine(err)}. An ARCHIVE endpoint is required — Safe owners ` +
        `are read at each Safe's first-sighting block.`
    );
  }
  if (code === "0x") {
    throw new Error(
      `${envName} returned no code for the service registry ` +
        `${registryAddress} at block ${startBlock}, where it is known to be ` +
        `deployed. The endpoint is not archive-capable; ${impact.noCode}.`
    );
  }
  try {
    await readAt(client, registryAddress, OWNER_ABI, "owner", startBlock);
  } catch (err) {
    throw new Error(
      `${envName} cannot serve a historical eth_call at block ${startBlock}: ` +
        `${firstLine(err)}. The Safe owner probes use this exact call shape, ` +
        `so ${impact.noCall}.`
    );
  }
}

/**
 * True only when the contract genuinely reverted or has no code — a
 * permanent property of the target, and the subgraph's `try_*` .reverted
 * branch. Anything else (timeout, 5xx, rate limit, a non-archive node
 * refusing historical state) must propagate so the batch retries.
 *
 * Checking `err.name` is NOT enough: viem's getContractError wraps EVERY
 * failure — HTTP errors included — in a ContractFunctionExecutionError
 * before rethrowing (the final `return new ContractFunctionExecutionError`
 * is unconditional). Matching that name would classify a rate-limit blip
 * as "not a Safe", memoize it, and permanently lose that Master Safe: no
 * MasterSafe row, no SAFE_DEPLOYED, no tracked addresses, and the user's
 * entire history missing — with a restart unable to repair it, because the
 * batch has already committed.
 *
 * So walk the cause chain and look for the two errors that actually mean
 * "the call itself failed on-chain".
 */
export function isRevert(err: unknown): boolean {
  let e: unknown = err;
  // Bounded, in case a cause chain ever loops.
  for (let depth = 0; e != null && depth < 16; depth++) {
    const name = (e as { name?: string }).name;
    if (
      name === "ContractFunctionRevertedError" ||
      name === "ContractFunctionZeroDataError"
    ) {
      return true;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
