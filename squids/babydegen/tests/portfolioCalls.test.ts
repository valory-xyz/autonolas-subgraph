// AC3: calculatePortfolioMetrics stays a no-op but is called wherever #175
// calls it in the part-2 handlers (Collect, a CL full exit, every position
// refresh unless the caller turns it off).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/portfolio", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/portfolio")>();
  return { ...real, calculatePortfolioMetrics: vi.fn(async () => {}) };
});

import * as v2PoolFns from "../src/abi/VelodromeV2Pool/functions";
import * as voterFns from "../src/abi/VeloVoter/functions";
import * as cl from "../src/cl";
import { BOLD, PROTOCOL_VELODROME_V3, USDC_NATIVE, VELO_NFT_MANAGER, VELO_VOTER } from "../src/constants";
import { gd } from "../src/decimal";
import { ETH_ADDRESS } from "../src/ids";
import { NFTPositionMapping, ProtocolPosition, Service, Token } from "../src/model";
import { calculatePortfolioMetrics } from "../src/portfolio";
import { clPositionId, nftPositionMappingId } from "../src/positions";
import { refreshAllActivePositions } from "../src/refresh";
import * as v2 from "../src/v2";
import { addr, hash, meta, setup } from "./helpers";

const SAFE = addr(0x5a);
const POOL = addr(0xb1);
const TS = 1_781_000_000n;
const E18 = 10n ** 18n;
const at = (address: string, logIndex = 1) => meta({ address, blockNumber: 53_000_000n, blockTimestamp: TS, txHash: hash(0x75), logIndex });
const calls = vi.mocked(calculatePortfolioMetrics);

function world() {
  const w = setup();
  for (const [id, symbol, decimals] of [[USDC_NATIVE, "USDC", 6n], [BOLD, "BOLD", 18n]] as const) {
    w.cache.set(Token, new Token({
      id, symbol, name: symbol, decimals, derivedUSD: gd("1").toStore(), priceSources: [], lastPriceUpdate: TS,
      priceConfidence: gd("0.99").toStore(), priceStale: false, depegged: false,
    }));
  }
  w.cache.set(Service, new Service({ id: SAFE, operatorSafe: addr(0x0a), positionIds: [], agentInstances: [] }));
  return w;
}

async function seedCL(w: ReturnType<typeof world>) {
  const id = clPositionId(SAFE, 7n, PROTOCOL_VELODROME_V3);
  const z = gd("0").toStore();
  w.cache.set(ProtocolPosition, new ProtocolPosition({
    id, agent: SAFE, protocol: PROTOCOL_VELODROME_V3, pool: ETH_ADDRESS, isActive: true, tokenId: 7n, token0: USDC_NATIVE, token1: BOLD,
    usdCurrent: z, usdCurrentWithRewards: z, amount0USD: z, amount1USD: z, entryAmountUSD: gd("100").toStore(), totalCostsUSD: z,
    swapSlippageUSD: z, investmentUSD: z, grossGainUSD: z, netGainUSD: z, positionROI: z, collectedFees0: z, collectedFees1: z,
    collectedFeesUSD: z, claimedRewards: z, claimedRewardsUSD: z, entryTimestamp: TS,
  }));
  w.cache.set(NFTPositionMapping, new NFTPositionMapping({ id: nftPositionMappingId(PROTOCOL_VELODROME_V3, 7n), protocol: PROTOCOL_VELODROME_V3, positionId: id }));
  return id;
}

describe("calculatePortfolioMetrics call sites (part 2)", () => {
  beforeEach(() => calls.mockClear());

  it("a full-exit DecreaseLiquidity and a Collect each call it for the position's safe", async () => {
    const w = world();
    await seedCL(w);
    // positions() reverts: burned in the block, so the decrease is a full exit
    await cl.handleDecreaseLiquidity(w.ctx, at(VELO_NFT_MANAGER, 3), { tokenId: 7n, liquidity: 1n, amount0: 1_000_000n, amount1: E18 });
    expect(calls).toHaveBeenCalledTimes(1);
    await cl.handleCollect(w.ctx, at(VELO_NFT_MANAGER, 4), { tokenId: 7n, recipient: SAFE, amount0: 1n, amount1: 0n });
    expect(calls).toHaveBeenCalledTimes(2);
    expect(calls.mock.calls.every((c) => c[1] === SAFE)).toBe(true);
  });

  it("a v2 refresh calls it unless the caller turns it off, as refreshAllActivePositions(false) does", async () => {
    const w = world();
    w.chain.pools.set(POOL, { token0: USDC_NATIVE, token1: BOLD, r0: 1000_000_000n, r1: 1000n * E18, stable: false });
    w.chain.mock(POOL, v2PoolFns.balanceOf, { account: SAFE }, E18);
    w.chain.mock(POOL, v2PoolFns.totalSupply, {}, 100n * E18);
    w.chain.mock(VELO_VOTER, voterFns.gauges, { pool: POOL }, ETH_ADDRESS);
    await v2.refreshVeloV2Position(w.ctx, SAFE, POOL, at(POOL), hash(0x75));
    expect(calls).toHaveBeenCalledTimes(1);
    await refreshAllActivePositions(w.ctx, SAFE, at(POOL), false);
    expect(calls).toHaveBeenCalledTimes(1);
    await refreshAllActivePositions(w.ctx, SAFE, at(POOL), true);
    expect(calls).toHaveBeenCalledTimes(2);
  });
});
