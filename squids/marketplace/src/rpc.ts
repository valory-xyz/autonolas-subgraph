// The eth_calls this squid makes, all read at the event's block with a
// logged fallback to `latest` when the node cannot serve that block:
// Chainlink `latestRoundData()` on the <native>/USD feed, and — on chains
// with an OLAS pool (Base) — the Balancer vault's `getPoolTokens`. The
// client, the fallback chain and the per-block memo are @olas/squid-shared;
// see README, "About RPC_HTTP".

import {
  BalancerPool,
  ChainlinkSource,
  NO_PRICE_SOURCE,
  Rpc,
  type UsdPriceSource,
} from "@olas/squid-shared";
import { CHAIN, type OlasPoolConfig } from "./constants";
import { NO_OLAS_POOL, type OlasPoolSource } from "./fee";

const rpc = Rpc.fromEnv(CHAIN.defaultRpc);
const feedAddress = CHAIN.nativeUsdFeed as `0x${string}` | null;

export const rpcPriceSource: UsdPriceSource =
  feedAddress == null ? NO_PRICE_SOURCE : new ChainlinkSource(rpc, feedAddress);

/**
 * OLAS/stablecoin balances of the chain's Balancer pool, the subgraph's
 * getPoolTokenBalances: a token missing from the pool reads as balance 0.
 */
export function balancerOlasPool(
  pool: { reservesAt(blockNumber: bigint): Promise<{ tokens: string[]; balances: bigint[] } | null> },
  cfg: OlasPoolConfig
): OlasPoolSource {
  return {
    async balancesAt(blockNumber) {
      const r = await pool.reservesAt(blockNumber);
      if (r == null) return null;
      const at = (token: string) => {
        const i = r.tokens.indexOf(token);
        return i < 0 ? 0n : r.balances[i];
      };
      return { olas: at(cfg.olas), stable: at(cfg.stable) };
    },
  };
}

export const rpcOlasPool: OlasPoolSource =
  CHAIN.olasPool == null
    ? NO_OLAS_POOL
    : balancerOlasPool(
        new BalancerPool(
          rpc,
          CHAIN.olasPool.pool as `0x${string}`,
          CHAIN.olasPool.vault as `0x${string}`
        ),
        CHAIN.olasPool
      );

/** Startup probe: says once whether RPC_HTTP can serve historical state. Not a gate. */
export async function probeRpc(): Promise<void> {
  if (feedAddress == null) {
    console.info(
      `[rpc] ${CHAIN.name} has no native/USD feed configured; NATIVE fees ` +
        `convert to $0. No RPC is used.`
    );
    return;
  }
  await rpc.probeArchive(feedAddress, BigInt(CHAIN.mechMarketplace.startBlock));
}
