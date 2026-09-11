// The one eth_call this squid makes: Chainlink `latestRoundData()` on the
// <native>/USD feed, behind the fee -> USD conversion. Event ingestion never
// touches the RPC.
//
// Read AT THE EVENT'S BLOCK, as graph-node did — so a backfill reproduces
// the prices the subgraph would have seen — with a documented fallback to
// `latest` when the node cannot serve that block (pruned state). The
// alternative failure modes are both worse: $0 loses the figure entirely,
// and throwing stalls the whole indexer on a node that will never have the
// state. USD totals are already documented as approximate lower bounds
// ("may differ slightly between deployments due to price feed timing").

import { createPublicClient, http } from "viem";
import { CHAIN, CHAINLINK_PRICE_FEED_DECIMALS } from "./constants";

const primaryUrl = process.env.RPC_HTTP ?? CHAIN.defaultRpc;

const client = createPublicClient({
  transport: http(primaryUrl, { batch: true }),
});

/** Optional second endpoint, tried when the primary fails with a non-revert error. */
const fallback = process.env.RPC_HTTP_FALLBACK
  ? createPublicClient({
      transport: http(process.env.RPC_HTTP_FALLBACK, { batch: true }),
    })
  : null;

const AGGREGATOR_V3_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export interface NativePrice {
  /** Feed answer, fixed point with `decimals` decimals. */
  answer: bigint;
  decimals: number;
}

/**
 * What fee.ts consumes. The production implementation is `rpcPriceSource`;
 * tests inject a stub. `null` means "no price available" and converts to $0
 * with a warning (the subgraph's `.reverted` branch).
 */
export interface NativePriceSource {
  usdPerNative(blockNumber: bigint): Promise<NativePrice | null>;
}

/**
 * True only when the contract genuinely reverted or has no code — a
 * permanent property of the target, and the subgraph's `try_*` .reverted
 * branch. Anything else (timeout, 5xx, rate limit, a pruned node refusing
 * historical state) is a node problem, not a feed problem.
 *
 * Checking `err.name` at the top is NOT enough: viem wraps every failure —
 * HTTP errors included — in a ContractFunctionExecutionError. Walk the cause
 * chain for the two errors that actually mean "the call failed on-chain".
 */
export function isRevert(err: unknown): boolean {
  let e: unknown = err;
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

const firstLine = (e: unknown): string =>
  String((e as Error)?.message ?? e).split("\n")[0];

const feedAddress = CHAIN.nativeUsdFeed as `0x${string}` | null;

// Memoized per block: a batch of N requests at one block reads the feed
// once. Only successful reads are cached; a null (revert) is re-probed.
const priceMemo = new Map<bigint, NativePrice>();
let feedDecimals: number | null = null;
// Warn about the `latest` fallback once per block, not once per request.
const warnedLatestAt = new Set<bigint>();

async function readRound(
  c: typeof client,
  blockNumber: bigint | null
): Promise<readonly [bigint, bigint, bigint, bigint, bigint]> {
  return c.readContract({
    address: feedAddress!,
    abi: AGGREGATOR_V3_ABI,
    functionName: "latestRoundData",
    ...(blockNumber == null ? {} : { blockNumber }),
  });
}

async function readDecimals(): Promise<number> {
  if (feedDecimals != null) return feedDecimals;
  try {
    feedDecimals = Number(
      await client.readContract({
        address: feedAddress!,
        abi: AGGREGATOR_V3_ABI,
        functionName: "decimals",
      })
    );
  } catch (err) {
    console.warn(
      `[rpc] feed.decimals() failed (${firstLine(err)}); assuming ` +
        `${CHAINLINK_PRICE_FEED_DECIMALS}`
    );
    feedDecimals = CHAINLINK_PRICE_FEED_DECIMALS;
  }
  return feedDecimals;
}

/**
 * <native>/USD at `blockNumber`.
 *
 * Order of attempts, each only on a NON-revert failure of the previous:
 *   1. primary, pinned to the block
 *   2. fallback (if configured), pinned to the block
 *   3. primary at `latest` — logged, because the figure is now "price at
 *      indexing time" rather than "price at the event"
 * A revert anywhere returns null (-> $0, warned by the caller). If even step
 * 3 fails the error propagates and SQD retries the batch — that is a
 * transport outage, not a data condition.
 */
export async function readNativeUsd(
  blockNumber: bigint
): Promise<NativePrice | null> {
  if (feedAddress == null) return null;
  const hit = priceMemo.get(blockNumber);
  if (hit != null) return hit;

  const decimals = await readDecimals();
  let round: readonly [bigint, bigint, bigint, bigint, bigint];
  try {
    round = await readRound(client, blockNumber);
  } catch (err) {
    if (isRevert(err)) return null;
    if (fallback != null) {
      try {
        round = await readRound(fallback, blockNumber);
        return memo(blockNumber, { answer: round[1], decimals });
      } catch (err2) {
        if (isRevert(err2)) return null;
        err = err2;
      }
    }
    if (!warnedLatestAt.has(blockNumber)) {
      warnedLatestAt.add(blockNumber);
      console.warn(
        `[rpc] latestRoundData pinned to block ${blockNumber} failed on ` +
          `every endpoint (${firstLine(err)}) — reading at "latest" instead. ` +
          `USD figures for this block use the current price. Point RPC_HTTP ` +
          `at an archive node to avoid this during a backfill.`
      );
    }
    try {
      round = await readRound(client, null);
    } catch (err3) {
      if (isRevert(err3)) return null;
      throw err3;
    }
  }
  return memo(blockNumber, { answer: round[1], decimals });
}

function memo(blockNumber: bigint, price: NativePrice): NativePrice {
  priceMemo.set(blockNumber, price);
  // Bound the memo: blocks only move forward, older entries are dead.
  if (priceMemo.size > 4096) {
    const oldest = priceMemo.keys().next().value;
    if (oldest != null) priceMemo.delete(oldest);
  }
  return price;
}

export const rpcPriceSource: NativePriceSource = {
  usdPerNative: readNativeUsd,
};

/**
 * Startup probe. Not a hard gate (unlike pearl-transactions, whose Safe
 * owner reads are irreparable without archive state): here a pruned node
 * only degrades historical USD figures to current prices, which
 * readNativeUsd handles and logs per block. This just says so up front,
 * once, with the endpoint named — so an operator running a backfill knows
 * before the warnings start.
 */
export async function probeRpc(): Promise<void> {
  if (feedAddress == null) {
    console.info(
      `[rpc] ${CHAIN.name} has no native/USD feed configured; NATIVE fees ` +
        `convert to $0. No RPC is used.`
    );
    return;
  }
  const at = BigInt(CHAIN.mechMarketplace.startBlock);
  try {
    const code = await client.getCode({ address: feedAddress, blockNumber: at });
    if (code == null || code === "0x") {
      console.warn(
        `[rpc] ${primaryUrl} returned no code for the price feed at block ` +
          `${at}. Either the node is pruned or the feed postdates the ` +
          `marketplace; historical USD conversions may fall back to "latest".`
      );
    } else {
      console.info(`[rpc] ${primaryUrl} serves state at block ${at} (archive-capable).`);
    }
  } catch (err) {
    console.warn(
      `[rpc] ${primaryUrl} cannot read state at block ${at} ` +
        `(${firstLine(err)}). Not archive-capable: USD conversions for blocks ` +
        `outside its state window will use the "latest" price.`
    );
  }
}
