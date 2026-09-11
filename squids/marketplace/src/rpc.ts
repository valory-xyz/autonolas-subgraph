// Chainlink `latestRoundData()` on the <native>/USD feed, read at the
// event's block (graph-node semantics) with a logged fallback to `latest`
// when the node cannot serve that block. See README, "About RPC_HTTP".

import { createPublicClient, http } from "viem";
import { CHAIN, CHAINLINK_PRICE_FEED_DECIMALS } from "./constants";
import type { NativePrice, NativePriceSource } from "./fee";

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

/**
 * True only for a genuine revert / no code (the subgraph's `.reverted`).
 * viem wraps every failure, HTTP errors included, in a
 * ContractFunctionExecutionError, so walk the cause chain.
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
 * <native>/USD at `blockNumber`. On a NON-revert failure: primary pinned ->
 * fallback pinned -> primary at `latest` (logged). A revert anywhere returns
 * null (-> $0). If `latest` fails too the error propagates (batch retry).
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

/** Startup probe: says once whether RPC_HTTP can serve historical state. Not a gate. */
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
