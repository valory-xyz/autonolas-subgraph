// The Safe eth_calls the subgraph makes, ported to viem.
//
// Only getOwners/getThreshold remain here: the StakingProxy config is
// decoded from the createStakingInstance calldata instead (see
// src/stakingConfig.ts), so those two calls are gone.
//
// Unlike graph-node (where contract calls are the indexer's cost), RPC here
// is ours to pay for — so every call is memoized for the process lifetime.
// All four are one-shot per subject: twice per Master Safe at first
// sighting, twice per staking proxy at creation.

import { createPublicClient, http } from "viem";

const client = createPublicClient({
  transport: http(
    process.env.RPC_POLYGON_HTTP ?? "https://polygon-bor-rpc.publicnode.com",
    { batch: true }
  ),
});

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

export interface SafeConfig {
  owners: string[];
  threshold: bigint;
}

/** address -> config, or null when the address is not a Safe. */
const safeMemo = new Map<string, SafeConfig | null>();

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
 * That is a permanent property of the address, so caching null is safe.
 * Transport errors are rethrown, never cached — SQD retries the batch.
 */
export async function getSafeConfig(
  address: string,
  blockNumber: number
): Promise<SafeConfig | null> {
  const memoKey = address;
  if (safeMemo.has(memoKey)) return safeMemo.get(memoKey)!;

  let cfg: SafeConfig | null;
  try {
    const [owners, threshold] = await Promise.all([
      client.readContract({
        address: address as `0x${string}`,
        abi: SAFE_ABI,
        functionName: "getOwners",
        blockNumber: BigInt(blockNumber),
      }),
      client.readContract({
        address: address as `0x${string}`,
        abi: SAFE_ABI,
        functionName: "getThreshold",
        blockNumber: BigInt(blockNumber),
      }),
    ]);
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
    // Memoized, so this decision is permanent for the process. Logged
    // loudly because the benign reading ("the NFT went to a staking proxy
    // or an EOA") and the catastrophic one ("the RPC lied and we just
    // dropped a real user's Master Safe") look identical here.
    console.warn(
      `[rpc] ${address} classified NOT-a-Safe at block ${blockNumber} ` +
        `(getOwners reverted or returned no code). Cached for the process ` +
        `lifetime. If this address is a real Master Safe, the RPC is wrong ` +
        `— check it is archive-capable.`
    );
  }
  safeMemo.set(memoKey, cfg);
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
function isRevert(err: unknown): boolean {
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
