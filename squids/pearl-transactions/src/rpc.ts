// The four eth_calls the subgraph makes, ported to viem.
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

const STAKING_ABI = [
  {
    type: "function",
    name: "minStakingDeposit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "numAgentInstances",
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
const stakingMemo = new Map<
  string,
  { minStakingDeposit: bigint; numAgentInstances: bigint } | null
>();

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

  safeMemo.set(memoKey, cfg);
  return cfg;
}

/**
 * Staking proxy config snapshot. These are set at proxy creation and never
 * change (the Olas staking-contract pattern), so unlike getSafeConfig this
 * one does NOT need a block pin and works against a non-archive node.
 * Returns null when either call reverts — the subgraph skips the proxy.
 */
export async function getStakingConfig(
  proxyAddress: string
): Promise<{ minStakingDeposit: bigint; numAgentInstances: bigint } | null> {
  if (stakingMemo.has(proxyAddress)) return stakingMemo.get(proxyAddress)!;

  let cfg: { minStakingDeposit: bigint; numAgentInstances: bigint } | null;
  try {
    const [minStakingDeposit, numAgentInstances] = await Promise.all([
      client.readContract({
        address: proxyAddress as `0x${string}`,
        abi: STAKING_ABI,
        functionName: "minStakingDeposit",
      }),
      client.readContract({
        address: proxyAddress as `0x${string}`,
        abi: STAKING_ABI,
        functionName: "numAgentInstances",
      }),
    ]);
    cfg = {
      minStakingDeposit: minStakingDeposit as bigint,
      numAgentInstances: numAgentInstances as bigint,
    };
  } catch (err) {
    if (isRevert(err)) cfg = null;
    else throw err;
  }

  stakingMemo.set(proxyAddress, cfg);
  return cfg;
}

/**
 * A revert (or a call to a non-contract) is a property of the target, not a
 * transient failure — the subgraph's `try_*` .reverted branch. Anything
 * else (timeout, 5xx, rate limit) must propagate so the batch retries.
 */
function isRevert(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  const msg = String((err as { message?: string })?.message ?? "");
  return (
    name === "ContractFunctionRevertedError" ||
    name === "ContractFunctionExecutionError" ||
    msg.includes("reverted") ||
    msg.includes("returned no data")
  );
}
