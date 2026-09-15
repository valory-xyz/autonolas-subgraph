// The one eth_call this squid makes: Chainlink `latestRoundData()` on the
// <native>/USD feed, read at the event's block with a logged fallback to
// `latest` when the node cannot serve that block. The client, the fallback
// chain and the per-block memo are @olas/squid-shared; see README,
// "About RPC_HTTP".

import { ChainlinkSource, NO_PRICE_SOURCE, Rpc, type UsdPriceSource } from "@olas/squid-shared";
import { CHAIN } from "./constants";

const rpc = Rpc.fromEnv(CHAIN.defaultRpc);
const feedAddress = CHAIN.nativeUsdFeed as `0x${string}` | null;

export const rpcPriceSource: UsdPriceSource =
  feedAddress == null ? NO_PRICE_SOURCE : new ChainlinkSource(rpc, feedAddress);

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
