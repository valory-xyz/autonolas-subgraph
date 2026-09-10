// The Safe eth_calls the subgraph makes, ported to viem.
//
// Only getOwners/getThreshold remain here: the StakingProxy config is
// decoded from the createStakingInstance calldata instead (see
// src/stakingConfig.ts), so those two calls are gone.
//
// Unlike graph-node (where contract calls are the indexer's cost), RPC here
// is ours to pay for — so SUCCESSFUL results are memoized for the process
// lifetime. Both are one-shot per subject: twice per Master Safe at first
// sighting.

import { createPublicClient, http } from "viem";
import { SERVICE_REGISTRY_L2 } from "./constants";

// Erigon archive nodes reject a historical eth_call whose `from` has no
// state at that block; the zero-address default has none.
const CALL_FROM = SERVICE_REGISTRY_L2 as `0x${string}`;

const client = createPublicClient({
  transport: http(
    process.env.RPC_POLYGON_HTTP ?? "https://polygon-bor-rpc.publicnode.com",
    { batch: true }
  ),
});

/**
 * Optional second archive endpoint, tried only when the primary fails with
 * something that is NOT a revert.
 *
 * Exists because BlockPI's archive turned out to have small holes — two
 * ~400-block gaps around 86.15M where eth_call fails with
 * "getStateObject … account not found" — and a hole containing any Safe's
 * first-sighting block stalls the backfill forever. The gaps are rare (0 of
 * 53 coarse samples across the range, 0 of 401 in a clean window), so the
 * fallback sees a handful of calls, not the ~700 of a full backfill; a
 * rate-limited public endpoint is fine here.
 */
const fallback = process.env.RPC_POLYGON_HTTP_FALLBACK
  ? createPublicClient({
      transport: http(process.env.RPC_POLYGON_HTTP_FALLBACK, { batch: true }),
    })
  : null;

/**
 * Every historical read goes through here so `blockNumber` and `account`
 * can never be set on one call site and forgotten on another — the startup
 * check and the Safe probes must send the exact same shape, or the check
 * gives false confidence.
 */
// First line of an error message, for the fallback log. No regex escapes on
// purpose: they did not survive the tooling that wrote this file.
const firstLine = (e: unknown): string =>
  String((e as Error)?.message ?? e).split(String.fromCharCode(10))[0];

async function historicalRead<const abi extends readonly unknown[], fn extends string>(
  address: string,
  abi: abi,
  functionName: fn,
  blockNumber: number
) {
  const args = {
    address: address as `0x${string}`,
    abi,
    functionName,
    blockNumber: BigInt(blockNumber),
    account: CALL_FROM,
  } as any;
  try {
    return await client.readContract(args);
  } catch (err) {
    // A revert is a fact about the contract, not the node — the fallback
    // would say the same thing, and the caller must see it as a revert.
    if (isRevert(err) || fallback == null) throw err;
    console.warn(
      `[rpc] primary failed for ${functionName}(${address}) at block ` +
        `${blockNumber} — ${firstLine(err)} — ` +
        `retrying on RPC_POLYGON_HTTP_FALLBACK`
    );
    return await fallback.readContract(args);
  }
}

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

/**
 * Owners + threshold for a Safe, read AT `blockNumber`.
 *
 * The block pin is not optional. Owner lists change — that is precisely why
 * AddedOwner / RemovedOwner / ChangedThreshold are indexed — so reading at
 * `latest` and then replaying historical owner events on top of today's list
 * would produce a wrong owner set and, worse, a wrong `masterEoa`. Reading
 * at the first-sighting block reproduces what the subgraph saw.
 *
 * This makes RPC_POLYGON_HTTP an ARCHIVE endpoint requirement for backfill.
 *
 * Returns null when the address is not a Safe: `getOwners` reverts on
 * anything else, which is how the subgraph distinguishes a Master Safe from
 * the other things a service NFT can land on (a staking proxy, an EOA).
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

  let cfg: SafeConfig | null;
  try {
    const [owners, threshold] = (await Promise.all([
      historicalRead(address, SAFE_ABI, "getOwners", blockNumber),
      historicalRead(address, SAFE_ABI, "getThreshold", blockNumber),
    ])) as [readonly `0x${string}`[], bigint];
    cfg =
      owners.length === 0
        ? null // empty owners is treated as "not a Safe", as in the subgraph
        : {
            owners: owners.map((o) => o.toLowerCase()),
            threshold: threshold as bigint,
          };
  } catch (err) {
    if (isRevert(err)) cfg = null;
    else throw err;
  }

  if (cfg == null) {
    // Logged loudly because the benign reading ("the NFT went to an EOA")
    // and the catastrophic one ("the RPC lied and we just dropped a real
    // user's Master Safe") look identical here. Not cached, so a later
    // sighting re-probes.
    console.warn(
      `[rpc] ${address} classified NOT-a-Safe at block ${blockNumber} ` +
        `(getOwners reverted or returned no code). If this address is a ` +
        `real Master Safe, the RPC is wrong — check it is archive-capable.`
    );
  }
  // Negative results are NOT cached — see safeMemo.
  if (cfg != null) safeMemo.set(memoKey, cfg);
  return cfg;
}

/**
 * Fail fast if RPC_POLYGON_HTTP cannot serve historical state.
 *
 * Every Safe is probed at its first-sighting block, and a pruned node
 * answers those with empty code — indistinguishable from "not a Safe", so
 * the failure mode is silent, permanent data loss rather than an error.
 * Assert it once at startup instead: the registry is deployed at or before
 * START_BLOCK by definition, so it must have code there.
 *
 * Throws with an actionable message; the processor should not start.
 */
export async function assertArchiveRpc(
  registryAddress: string,
  startBlock: number
): Promise<void> {
  let code: string;
  try {
    code = await client.getCode({
      address: registryAddress as `0x${string}`,
      blockNumber: BigInt(startBlock),
    }) ?? "0x";
  } catch (err) {
    throw new Error(
      `RPC_POLYGON_HTTP cannot read state at block ${startBlock}: ` +
        `${(err as Error).message}. An ARCHIVE endpoint is required — Safe ` +
        `owners are read at each Safe's first-sighting block.`
    );
  }
  if (code === "0x") {
    throw new Error(
      `RPC_POLYGON_HTTP returned no code for the service registry ` +
        `${registryAddress} at block ${startBlock}, where it is known to be ` +
        `deployed. The endpoint is not archive-capable; every Safe probe ` +
        `would be silently misread as "not a Safe".`
    );
  }

  // Same call shape as the Safe probes, via the same helper.
  try {
    await historicalRead(registryAddress, OWNER_ABI, "owner", startBlock);
  } catch (err) {
    throw new Error(
      `RPC_POLYGON_HTTP cannot serve a historical eth_call at block ` +
        `${startBlock}: ${(err as Error).message}. The Safe owner probes use ` +
        `this exact call shape, so the backfill would stall on the first ` +
        `Master Safe.`
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
