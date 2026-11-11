// Part 2b: CL and v2 positions, collected fees, claimed rewards, pool
// discovery, gauges and LiFi swaps. Ported from studio 7b60e89
// tests/positionIncome.test.ts and the 2b sections of tests/mapping.test.ts,
// with their receipts (tests/fixtures/receipts2b.ts) and expected values.

import { describe, expect, it } from "vitest";
import * as aeroGaugeFns from "../src/abi/AeroCLGauge/functions";
import * as sugarFns from "../src/abi/AerodromeLpSugar/functions";
import * as aeroFactoryEvents from "../src/abi/AeroV2PoolFactory/events";
import * as poolFactoryFns from "../src/abi/PoolFactory/functions";
import * as v2GaugeFns from "../src/abi/VeloV2Gauge/functions";
import * as voterFns from "../src/abi/VeloVoter/functions";
import * as clFactoryFns from "../src/abi/VelodromeCLFactory/functions";
import * as clPoolFns from "../src/abi/VelodromeCLPool/functions";
import * as nfpmFns from "../src/abi/VelodromePositionNFTManager/functions";
import * as v2PoolEvents from "../src/abi/VelodromeV2Pool/events";
import * as v2PoolFns from "../src/abi/VelodromeV2Pool/functions";
import { processBlock } from "../src/block";
import * as cl from "../src/cl";
import { getAmountsForLiquidity, getSqrtRatioAtTick, MAX_TICK, MIN_TICK } from "../src/clMath";
import {
  AERO,
  AERO_CL_FACTORY,
  AERO_GAUGE_MANAGER,
  AERO_NFT_MANAGER,
  AERO_PROTOCOL_AERO,
  AERO_V2_STABLE_FACTORY,
  AERO_V2_VOLATILE_FACTORY,
  BOLD,
  CHAIN,
  LIFI_DIAMOND,
  PROTOCOL_AERO_CL,
  PROTOCOL_AERO_V2,
  PROTOCOL_VELODROME_V2,
  PROTOCOL_VELODROME_V3,
  USDC_NATIVE,
  VELO_CL_FACTORY,
  VELO_NFT_MANAGER,
  VELO_V2_FACTORY,
  VELO_V2_SUGAR,
  VELO_VOTER,
  WETH,
} from "../src/constants";
import { gd } from "../src/decimal";
import type { RawLog } from "../src/dispatch";
import * as h from "../src/handlers";
import { ETH_ADDRESS, tokenBalanceId, utf8Hex } from "../src/ids";
import {
  AddressType,
  AeroGauge,
  AgentSwapBuffer,
  ClaimableRewardBeforeBlock,
  CreditedRewardClaim,
  FundingBalance,
  NFTPositionMapping,
  PendingMintPosition,
  ProtocolPosition,
  Service,
  SwapTransaction,
  Token,
  TokenBalance,
  V2PoolVenue,
  VeloV2PoolDataSource,
} from "../src/model";
import { attributeRewardTransfer, clPositionId, nftPositionMappingId } from "../src/positions";
import { refreshAllActivePositions } from "../src/refresh";
import { handleLiFiGenericSwapCompleted, swapTransactionId } from "../src/swaps";
import * as v2 from "../src/v2";
import { RECEIPT_CL_GAUGE_WITHDRAW_0X567935AB, RECEIPT_EMISSIONS_CLAIMED_0XCDD2AC26 } from "./fixtures/receipts2b";
import { addr, hash, meta, setup, tx } from "./helpers";

const TS = 1_781_000_000n;
const BLOCK = 53_000_000n;
const TX = hash(0x75);
const SAFE = addr(0x5a);
const OPERATOR = addr(0x0a);
const AGENT = addr(0xa1);
const OTHER = addr(0xe3);
const DUMMY0 = addr(0xd0);
const DUMMY1 = addr(0xd1);
const E18 = 10n ** 18n;
const Q96 = 2n ** 96n;

type W = ReturnType<typeof setup>;

const at = (address: string, logIndex = 1, over: Partial<ReturnType<typeof meta>> = {}) =>
  meta({ address, blockNumber: BLOCK, blockTimestamp: TS, txHash: TX, logIndex, ...over });

function world(): W {
  const w = setup();
  seedTokenPrice(w, USDC_NATIVE, "USDC", 6, "1");
  seedTokenPrice(w, BOLD, "BOLD", 18, "1");
  return w;
}

function seedService(w: W, safe: string) {
  w.cache.set(
    Service,
    new Service({
      id: safe,
      serviceId: 607n,
      operatorSafe: OPERATOR,
      serviceSafe: safe,
      latestRegistrationBlock: BLOCK,
      latestRegistrationTimestamp: TS,
      latestRegistrationTxHash: TX,
      latestMultisigBlock: BLOCK,
      latestMultisigTimestamp: TS,
      latestMultisigTxHash: TX,
      isActive: true,
      createdAt: TS,
      updatedAt: TS,
      positionIds: [],
      agentInstances: [AGENT],
    }),
  );
}

function seedTokenPrice(w: W, token: string, symbol: string, decimals: number, price: string) {
  w.cache.set(
    Token,
    new Token({
      id: token,
      symbol,
      name: symbol,
      decimals: BigInt(decimals),
      derivedUSD: gd(price).toStore(),
      priceSources: [],
      lastPriceUpdate: TS,
      priceConfidence: gd("0.99").toStore(),
      priceStale: false,
      depegged: false,
    }),
  );
}

/** fixtures.ts seedPosition: an active position with $100 entry, its NFT mapping, listed on the Service. */
async function seedPosition(
  w: W,
  safe: string,
  protocol: string,
  tokenId: bigint,
  token0: string,
  token1: string,
  gauge: string | null,
  liquidity: bigint,
  claimableReward: string,
): Promise<ProtocolPosition> {
  const id = clPositionId(safe, tokenId, protocol);
  const zero = gd("0").toStore();
  const service = (await w.cache.get(Service, safe))!;
  const p = new ProtocolPosition({
    id,
    agent: safe,
    service,
    protocol,
    pool: ETH_ADDRESS,
    isActive: true,
    usdCurrent: zero,
    usdCurrentWithRewards: zero,
    token0,
    token1,
    amount0USD: zero,
    amount1USD: zero,
    liquidity,
    claimableReward: gd(claimableReward).toStore(),
    claimableRewardUSD: zero,
    tokenId,
    rewardsContract: gauge,
    tickLower: 0,
    tickUpper: 0,
    entryTxHash: TX,
    entryTimestamp: TS,
    entryAmount0: zero,
    entryAmount0USD: zero,
    entryAmount1: zero,
    entryAmount1USD: zero,
    entryAmountUSD: gd("100").toStore(),
    totalCostsUSD: zero,
    swapSlippageUSD: zero,
    investmentUSD: gd("100").toStore(),
    grossGainUSD: zero,
    netGainUSD: zero,
    positionROI: zero,
    collectedFees0: zero,
    collectedFees1: zero,
    collectedFeesUSD: zero,
    claimedRewards: zero,
    claimedRewardsUSD: zero,
  });
  w.cache.set(ProtocolPosition, p);
  w.cache.set(NFTPositionMapping, new NFTPositionMapping({ id: nftPositionMappingId(protocol, tokenId), protocol, positionId: id }));
  service.positionIds = [...service.positionIds, id];
  return p;
}

const pos = async (w: W, id: string) => (await w.cache.get(ProtocolPosition, id))!;
const field = async (w: W, id: string, f: keyof ProtocolPosition) => {
  const v = (await pos(w, id))[f] as { toFixed?: () => string } | string | bigint | null | undefined;
  return v == null ? v : typeof v === "object" && v.toFixed ? v.toFixed() : String(v);
};

function closeAt(p: ProtocolPosition, exitUSD: string) {
  p.isActive = false;
  p.exitAmountUSD = gd(exitUSD).toStore();
}

const positionsResult = (liquidity: bigint) => ({
  nonce: 0n,
  operator: ETH_ADDRESS,
  token0: DUMMY0,
  token1: DUMMY1,
  tickSpacing: 1,
  tickLower: -10,
  tickUpper: 10,
  liquidity,
  feeGrowthInside0LastX128: 0n,
  feeGrowthInside1LastX128: 0n,
  tokensOwed0: 0n,
  tokensOwed1: 0n,
});

// ---------------------------------------------------------------------------

describe("CL math (TickMath / LiquidityAmounts)", () => {
  it("matches Uniswap's sqrt ratios at tick 0 and the bounds", () => {
    expect(getSqrtRatioAtTick(0)).toBe(Q96);
    expect(getSqrtRatioAtTick(MIN_TICK)).toBe(4295128739n);
    expect(getSqrtRatioAtTick(MAX_TICK)).toBe(1461446703485210103287273052203988822378723970342n);
    expect(getSqrtRatioAtTick(MAX_TICK + 5)).toBe(getSqrtRatioAtTick(MAX_TICK));
  });

  it("splits liquidity by where the price sits in the range", () => {
    const a = getSqrtRatioAtTick(-10);
    const b = getSqrtRatioAtTick(10);
    const inRange = getAmountsForLiquidity(Q96, a, b, E18);
    expect(inRange.amount0 > 0n && inRange.amount1 > 0n).toBe(true);
    expect(getAmountsForLiquidity(a - 1n, a, b, E18).amount1).toBe(0n);
    expect(getAmountsForLiquidity(b, a, b, E18).amount0).toBe(0n);
  });
});

// --- CL positions (both NFPMs) -----------------------------------------------

const AERO_TOKEN_ID = 42n;
const AERO_CL_POOL = addr(0xc1);
const AERO_CL_GAUGE = addr(0xc2);
const VELO_CL_POOL = addr(0xc3);

function mockCLVenuePosition(w: W, manager: string, factory: string, pool: string, gauge: string, liquidity = E18) {
  w.chain.mock(manager, nfpmFns.positions, { tokenId: AERO_TOKEN_ID }, positionsResult(liquidity));
  w.chain.mock(factory, clFactoryFns.getPool, { _0: DUMMY0, _1: DUMMY1, _2: 1 }, pool);
  w.chain.pools.set(pool, { token0: DUMMY0, token1: DUMMY1, sqrtPriceX96: Q96 });
  w.chain.mock(pool, clPoolFns.gauge, {}, gauge);
}

const mockAeroStaked = (w: W, staked: boolean | null) =>
  w.chain.mock(AERO_CL_GAUGE, aeroGaugeFns.stakedContains, { depositor: SAFE, tokenId: AERO_TOKEN_ID }, staked);

async function openCLPosition(w: W, manager = AERO_NFT_MANAGER): Promise<string> {
  await cl.handleNFTTransfer(w.ctx, at(manager, 1), { from: ETH_ADDRESS, to: SAFE, tokenId: AERO_TOKEN_ID });
  await cl.handleIncreaseLiquidity(w.ctx, at(manager, 2), { tokenId: AERO_TOKEN_ID, amount0: E18, amount1: 2n * E18 });
  return clPositionId(SAFE, AERO_TOKEN_ID, cl.clVenueForManager(manager).protocol);
}

function clWorld() {
  const w = world();
  seedService(w, SAFE);
  seedTokenPrice(w, AERO_PROTOCOL_AERO, "AERO", 18, "0.6");
  seedTokenPrice(w, AERO, "AERO", 18, "0.05");
  mockCLVenuePosition(w, AERO_NFT_MANAGER, AERO_CL_FACTORY, AERO_CL_POOL, AERO_CL_GAUGE);
  mockAeroStaked(w, false);
  return w;
}

describe("Aero CL positions (AeroNFTManager)", () => {
  it("the emitting NFPM picks the venue", () => {
    expect(cl.clVenueForManager(AERO_NFT_MANAGER).protocol).toBe("aero-cl");
    expect(cl.clVenueForManager(VELO_NFT_MANAGER).protocol).toBe("aerodrome-cl");
  });

  it("mint + 6-arg IncreaseLiquidity creates an aero-cl position with its own mapping", async () => {
    const w = clWorld();
    const id = await openCLPosition(w);
    expect(id).toBe(utf8Hex(`${SAFE}-aero-cl-42`));
    const p = await pos(w, id);
    expect([p.protocol, p.pool, p.isActive, p.tickLower, p.tickUpper, p.tickSpacing]).toEqual(["aero-cl", AERO_CL_POOL, true, -10, 10, 1]);
    expect(await field(w, id, "entryAmount0")).toBe("1");
    expect(await field(w, id, "entryAmount1")).toBe("2");
    expect(w.cache.all(NFTPositionMapping)).toHaveLength(1);
    expect((await w.cache.get(NFTPositionMapping, utf8Hex("aero-cl-42")))!.positionId).toBe(id);
    // Unstaked NFT: no rewards, and earned(address,uint256[]) is not called
    expect(await field(w, id, "claimableReward")).toBe("0");
    expect(p.rewardsContract).toBe(AERO_CL_GAUGE);
    expect(w.chain.calls.some((c) => c.startsWith(aeroGaugeFns.earned_1.selector))).toBe(false);
    expect((await w.cache.get(Service, SAFE))!.positionIds).toEqual([id]);
  });

  it("staked position reads earned(agent, [tokenId]) and prices Aero's AERO", async () => {
    const w = clWorld();
    const id = await openCLPosition(w);
    mockAeroStaked(w, true);
    w.chain.mock(AERO_CL_GAUGE, aeroGaugeFns.earned_1, { _account: SAFE, _tokenIds: [AERO_TOKEN_ID] }, 2n * E18);
    await cl.refreshVeloCLPosition(w.ctx, id, AERO_TOKEN_ID, at(AERO_NFT_MANAGER), TX, false);
    expect(await field(w, id, "claimableReward")).toBe("2");
    expect(await field(w, id, "claimableRewardUSD")).toBe("1.2");
  });

  it("a reverting stakedContains records 0 without calling earned", async () => {
    const w = clWorld();
    const id = await openCLPosition(w);
    mockAeroStaked(w, null);
    await cl.refreshVeloCLPosition(w.ctx, id, AERO_TOKEN_ID, at(AERO_NFT_MANAGER), TX, false);
    expect(await field(w, id, "claimableReward")).toBe("0");
    expect(w.chain.calls.some((c) => c.startsWith(aeroGaugeFns.earned_1.selector))).toBe(false);
  });

  it("a full-exit DecreaseLiquidity from the Aero NFPM closes the aero-cl position", async () => {
    const w = clWorld();
    const id = await openCLPosition(w);
    w.chain.mock(AERO_NFT_MANAGER, nfpmFns.positions, { tokenId: AERO_TOKEN_ID }, positionsResult(0n));
    await cl.handleDecreaseLiquidity(w.ctx, at(AERO_NFT_MANAGER, 3), { tokenId: AERO_TOKEN_ID, liquidity: E18, amount0: E18, amount1: 3n * E18 });
    expect(await field(w, id, "isActive")).toBe("false");
    expect(await field(w, id, "exitAmount1")).toBe("3");
    expect(await field(w, id, "exitTxHash")).toBe(TX);
  });

  it("an exit whose NFT is burned in the same block is taken from the DecreaseLiquidity amounts", async () => {
    const w = clWorld();
    const id = await openCLPosition(w);
    w.chain.mock(AERO_NFT_MANAGER, nfpmFns.positions, { tokenId: AERO_TOKEN_ID }, null);
    await cl.handleDecreaseLiquidity(w.ctx, at(AERO_NFT_MANAGER, 3), { tokenId: AERO_TOKEN_ID, liquidity: E18, amount0: 5n * E18, amount1: 0n });
    expect(await field(w, id, "isActive")).toBe("false");
    expect(await field(w, id, "exitAmount0")).toBe("5");
    expect(await field(w, id, "liquidity")).toBe("0");
  });

  it("a burn from the Aero NFPM closes the aero-cl position", async () => {
    const w = clWorld();
    const id = await openCLPosition(w);
    await cl.handleNFTTransfer(w.ctx, at(AERO_NFT_MANAGER, 9, { blockTimestamp: TS + 60n }), { from: SAFE, to: ETH_ADDRESS, tokenId: AERO_TOKEN_ID });
    expect(await field(w, id, "isActive")).toBe("false");
    expect(await field(w, id, "exitTimestamp")).toBe(String(TS + 60n));
  });

  it("the same tokenId on both NFPMs gives two positions", async () => {
    const w = clWorld();
    mockCLVenuePosition(w, VELO_NFT_MANAGER, VELO_CL_FACTORY, VELO_CL_POOL, ETH_ADDRESS);
    const aero = await openCLPosition(w, AERO_NFT_MANAGER);
    const velo = await openCLPosition(w, VELO_NFT_MANAGER);
    expect(aero).not.toBe(velo);
    expect((await pos(w, velo)).protocol).toBe("aerodrome-cl");
    expect((await pos(w, velo)).pool).toBe(VELO_CL_POOL);
    expect(w.cache.all(NFTPositionMapping)).toHaveLength(2);
  });

  it("an NFT minted to an address that is not a service is not tracked", async () => {
    const w = clWorld();
    await cl.handleNFTTransfer(w.ctx, at(AERO_NFT_MANAGER, 1), { from: ETH_ADDRESS, to: OTHER, tokenId: AERO_TOKEN_ID });
    expect(w.cache.all(ProtocolPosition)).toHaveLength(0);
    expect(w.cache.all(NFTPositionMapping)).toHaveLength(0);
  });
});

// --- positionIncome.test.ts: collected fees -----------------------------------

const USDC_50 = 50_000_000n;
const BOLD_50 = 50n * E18;

describe("collected fees", () => {
  async function feeWorld() {
    const w = world();
    seedService(w, SAFE);
    return w;
  }
  const decrease = (w: W, tokenId: bigint, amount0: bigint, amount1: bigint, manager = VELO_NFT_MANAGER) =>
    cl.handleDecreaseLiquidity(w.ctx, at(manager, 3), { tokenId, liquidity: 1n, amount0, amount1 });
  const collect = (w: W, tokenId: bigint, recipient: string, amount0: bigint, amount1: bigint, manager = VELO_NFT_MANAGER) =>
    cl.handleCollect(w.ctx, at(manager, 4), { tokenId, recipient, amount0, amount1 });

  it("Collect finds the legacy Slipstream (aerodrome-cl) position and records only the fee part", async () => {
    const w = await feeWorld();
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    // positions() reverts: the NFT is burned in this block, so this decrease is the exit ($50 + $50)
    await decrease(w, 7n, USDC_50, BOLD_50);
    await collect(w, 7n, SAFE, 51_000_000n, 505n * 10n ** 17n);
    expect(await field(w, p.id, "collectedFees0")).toBe("1");
    expect(await field(w, p.id, "collectedFees1")).toBe("0.5");
    expect(await field(w, p.id, "collectedFeesUSD")).toBe("1.5");
    expect(await field(w, p.id, "exitAmountUSD")).toBe("100");
    expect(await field(w, p.id, "netGainUSD")).toBe("1.5");
    expect(await field(w, p.id, "positionROI")).toBe("1.5");
  });

  it("decreases in the burn block add up to the exit, in USD too", async () => {
    const w = await feeWorld();
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    p.usdCurrentWithRewards = gd("7").toStore();
    await decrease(w, 7n, USDC_50, BOLD_50);
    await decrease(w, 7n, USDC_50, BOLD_50);
    expect(await field(w, p.id, "exitAmount0USD")).toBe("100");
    expect(await field(w, p.id, "exitAmount1USD")).toBe("100");
    expect(await field(w, p.id, "usdCurrentWithRewards")).toBe("0");
    expect(await field(w, p.id, "exitAmountUSD")).toBe("200");
  });

  it("a decrease on a row whose exit was recorded in an earlier block keeps that exit", async () => {
    const w = await feeWorld();
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    closeAt(p, "120");
    p.exitTimestamp = TS - 100n;
    await decrease(w, 7n, USDC_50, BOLD_50);
    expect(await field(w, p.id, "exitAmountUSD")).toBe("120");
  });

  it("a decrease after the NFT was burned or transferred away is not this position's exit", async () => {
    const w = await feeWorld();
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    p.isActive = false;
    p.exitTimestamp = TS;
    await decrease(w, 7n, USDC_50, BOLD_50);
    expect((await pos(w, p.id)).exitAmountUSD).toBeUndefined();
  });

  it("a fee on a closed position with no recorded investment is still saved", async () => {
    const w = await feeWorld();
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 8n, USDC_NATIVE, BOLD, null, 0n, "0");
    p.entryAmountUSD = gd("0").toStore();
    p.investmentUSD = gd("0").toStore();
    closeAt(p, "0");
    await collect(w, 8n, SAFE, 2_000_000n, 0n);
    expect(await field(w, p.id, "collectedFeesUSD")).toBe("2");
  });

  it("a Collect smaller than the owed principal books no fee and leaves the rest owed", async () => {
    const w = await feeWorld();
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    closeAt(p, "100");
    await decrease(w, 7n, USDC_50, 0n);
    await collect(w, 7n, SAFE, 20_000_000n, 0n);
    expect(await field(w, p.id, "collectedFees0")).toBe("0");
    // 30 of principal is still owed, so 31 is 1 of fee
    await collect(w, 7n, SAFE, 31_000_000n, 0n);
    expect(await field(w, p.id, "collectedFees0")).toBe("1");
    expect(await field(w, p.id, "collectedFeesUSD")).toBe("1");
  });

  it("each fee leg is valued at its own token's price", async () => {
    const w = await feeWorld();
    seedTokenPrice(w, BOLD, "BOLD", 18, "2");
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    closeAt(p, "100");
    await collect(w, 7n, SAFE, 1_000_000n, 5n * 10n ** 17n);
    expect(await field(w, p.id, "collectedFeesUSD")).toBe("2");
  });

  it("a Collect paid to another address is not the Safe's fee, but still pays out owed principal", async () => {
    const w = await feeWorld();
    const p = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    closeAt(p, "100");
    await decrease(w, 7n, USDC_50, BOLD_50);
    await collect(w, 7n, OTHER, USDC_50, BOLD_50);
    expect(await field(w, p.id, "collectedFeesUSD")).toBe("0");
    await collect(w, 7n, SAFE, 5_000_000n, 0n);
    expect(await field(w, p.id, "collectedFees0")).toBe("5");
  });

  it("an Aero NFPM Collect books its fee on the aero-cl position, not a Velodrome one with the same tokenId", async () => {
    const w = await feeWorld();
    const velo = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    closeAt(velo, "100");
    const aero = await seedPosition(w, SAFE, PROTOCOL_AERO_CL, 7n, USDC_NATIVE, BOLD, null, 0n, "0");
    closeAt(aero, "100");
    await decrease(w, 7n, USDC_50, BOLD_50, AERO_NFT_MANAGER);
    // The principal is owed under aero-cl, so a Velodrome Collect of the same tokenId is all fee
    await collect(w, 7n, SAFE, 2_000_000n, 0n);
    await collect(w, 7n, SAFE, 51_000_000n, 505n * 10n ** 17n, AERO_NFT_MANAGER);
    expect(await field(w, aero.id, "collectedFeesUSD")).toBe("1.5");
    expect(await field(w, velo.id, "collectedFeesUSD")).toBe("2");
  });
});

// --- positionIncome.test.ts: claimed rewards ----------------------------------

// Optimism tx 0x567935ab…: Safe 0xd32613 unstakes tokenId 53083183 from a Slipstream CL gauge;
// the gauge pays 1.814069823640933344 of its reward token (adapted to Base AERO), then emits
// Withdraw(Safe, 53083183, …).
const SAFE_D12 = "0xd32613ed605be41d9c7fbc85f2ccb4fba59778ac";
const GAUGE_D12 = "0x0f5212f63ba8eab0fabd94fc2071d461d9d6ddb2";
const REWARD_PAID = 1814069823640933344n;
const CL_GAUGE_WITHDRAW_TOPIC = "0x8903a5b5d08a841e7f68438387f1da20c84dea756379ed37e633ff3854b99b84";
const word = (hex: string) => "0x" + hex.replace(/^0x/, "").padStart(64, "0");
const gaugeWithdraw = (gauge: string, user: string, tokenId: bigint, logIndex: number): h.ReceiptLog => ({
  address: gauge,
  topics: [CL_GAUGE_WITHDRAW_TOPIC, word(user), word(tokenId.toString(16)), word("1")],
  data: "0x",
  logIndex,
});

describe("claimed rewards", () => {
  function rewardWorld(safe = SAFE_D12) {
    const w = world();
    seedTokenPrice(w, AERO, "AERO", 18, "0.05");
    seedService(w, safe);
    w.cache.set(AddressType, new AddressType({ id: GAUGE_D12, isContract: true, isSafe: false, checkedAt: BLOCK }));
    return w;
  }
  const rewardTransfer = (w: W, safe: string, value: bigint, logIndex: number, receipt: h.ReceiptLog[]) =>
    h.handleERC20Transfer(w.ctx, at(AERO, logIndex), { from: GAUGE_D12, to: safe, value }, tx(), receipt);

  it("a reward Transfer goes to the tokenId of the gauge Withdraw after it (0x567935ab)", async () => {
    const w = rewardWorld();
    const unstaked = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 53083183n, USDC_NATIVE, BOLD, GAUGE_D12, 1n, "1");
    const other = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 53000000n, USDC_NATIVE, BOLD, GAUGE_D12, 1000n, "50");
    expect(RECEIPT_CL_GAUGE_WITHDRAW_0X567935AB).toHaveLength(10);
    await rewardTransfer(w, SAFE_D12, REWARD_PAID, 34, RECEIPT_CL_GAUGE_WITHDRAW_0X567935AB);
    expect(await field(w, unstaked.id, "claimedRewards")).toBe("1.814069823640933344");
    expect(await field(w, unstaked.id, "claimedRewardsUSD")).toBe("0.0907034911820466672");
    expect(await field(w, other.id, "claimedRewards")).toBe("0");
    expect(await w.cache.get(FundingBalance, SAFE_D12)).toBeUndefined();
  });

  it("each reward goes to the Withdraw after it, not one before it", async () => {
    const w = rewardWorld();
    const first = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 1001n, USDC_NATIVE, BOLD, GAUGE_D12, 1n, "0");
    const second = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 1002n, USDC_NATIVE, BOLD, GAUGE_D12, 1n, "0");
    const receipt = [gaugeWithdraw(GAUGE_D12, SAFE_D12, 1001n, 21), gaugeWithdraw(GAUGE_D12, SAFE_D12, 1002n, 23)];
    await rewardTransfer(w, SAFE_D12, E18, 20, receipt);
    await rewardTransfer(w, SAFE_D12, 2n * E18, 22, receipt);
    expect(await field(w, first.id, "claimedRewards")).toBe("1");
    expect(await field(w, second.id, "claimedRewards")).toBe("2");
  });

  it("a Withdraw naming an untracked tokenId credits no other position", async () => {
    const w = rewardWorld();
    const p = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 1001n, USDC_NATIVE, BOLD, GAUGE_D12, 1n, "0");
    await rewardTransfer(w, SAFE_D12, E18, 20, [gaugeWithdraw(GAUGE_D12, SAFE_D12, 9999n, 21)]);
    expect(await field(w, p.id, "claimedRewards")).toBe("0");
  });

  it("a reward credited to a closed position is in its gain and ROI", async () => {
    const w = rewardWorld();
    const p = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 1001n, USDC_NATIVE, BOLD, GAUGE_D12, 1n, "0");
    closeAt(p, "100");
    await rewardTransfer(w, SAFE_D12, 20n * E18, 20, [gaugeWithdraw(GAUGE_D12, SAFE_D12, 1001n, 21)]);
    expect(await field(w, p.id, "claimedRewardsUSD")).toBe("1");
    expect(await field(w, p.id, "grossGainUSD")).toBe("101");
    expect(await field(w, p.id, "positionROI")).toBe("1");
  });

  it("a v2 gauge reward claimed after the exit goes to the last closed position on that gauge", async () => {
    const w = rewardWorld();
    const older = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V2, 1n, USDC_NATIVE, BOLD, GAUGE_D12, 0n, "0");
    closeAt(older, "100");
    older.exitTimestamp = TS - 1000n;
    const latest = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V2, 2n, USDC_NATIVE, BOLD, GAUGE_D12, 0n, "0");
    closeAt(latest, "100");
    latest.exitTimestamp = TS - 10n;
    await rewardTransfer(w, SAFE_D12, 20n * E18, 1, []);
    expect(await field(w, latest.id, "claimedRewards")).toBe("20");
    expect(await field(w, older.id, "claimedRewards")).toBe("0");
  });

  it("a CL claim with no Withdraw is split by what each position had earned before the block", async () => {
    const w = rewardWorld();
    const a = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 1n, USDC_NATIVE, BOLD, GAUGE_D12, 1n, "3");
    const b = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 2n, USDC_NATIVE, BOLD, GAUGE_D12, 1000n, "1");
    await rewardTransfer(w, SAFE_D12, 4n * E18, 1, []);
    expect(await field(w, a.id, "claimedRewards")).toBe("3");
    expect(await field(w, b.id, "claimedRewards")).toBe("1");
  });

  it("with nothing earned on record the claim is split by liquidity, and equally with no liquidity either", async () => {
    const w = rewardWorld();
    const a = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 1n, USDC_NATIVE, BOLD, GAUGE_D12, 3n, "0");
    const b = await seedPosition(w, SAFE_D12, PROTOCOL_VELODROME_V3, 2n, USDC_NATIVE, BOLD, GAUGE_D12, 1n, "0");
    await rewardTransfer(w, SAFE_D12, 4n * E18, 1, []);
    expect([await field(w, a.id, "claimedRewards"), await field(w, b.id, "claimedRewards")]).toEqual(["3", "1"]);
    a.liquidity = 0n;
    b.liquidity = 0n;
    await rewardTransfer(w, SAFE_D12, 2n * E18, 2, []);
    expect([await field(w, a.id, "claimedRewards"), await field(w, b.id, "claimedRewards")]).toEqual(["4", "2"]);
  });

  it("the claimable reward a block started with survives later refreshes in that block", async () => {
    const w = clWorld();
    const id = await openCLPosition(w);
    (await pos(w, id)).claimableReward = gd("5").toStore();
    const next = at(AERO_NFT_MANAGER, 1, { blockNumber: BLOCK + 1n, blockTimestamp: TS + 2n });
    await cl.refreshVeloCLPosition(w.ctx, id, AERO_TOKEN_ID, next, TX, false); // reads 0 now (unstaked)
    await cl.refreshVeloCLPosition(w.ctx, id, AERO_TOKEN_ID, next, TX, false);
    expect(await field(w, id, "claimableReward")).toBe("0");
    const before = (await w.cache.get(ClaimableRewardBeforeBlock, id))!;
    expect([before.block, before.claimableReward.toFixed()]).toEqual([BLOCK + 1n, "5"]);
  });
});

// --- positionIncome.test.ts: Aero CL rewards from EmissionsClaimed ------------

const ACCOUNT_D14 = "0x787fd1dc3b533171781e4ae1a563c1ac7b4435e4";
const AERO_CL_GAUGE_D14 = "0x46a9dca72d78366571be583aa69c1dc16e6889fb";
const EMISSIONS_CLAIMED_TOPIC = "0x7b6bd720815adbeaaaed4fc759e1a535705901f33709fbb33e62ee9a89427bb1";
const emissionsClaimed = (tokenId: bigint, recipient: string, amount: bigint, logIndex: number): h.ReceiptLog => ({
  address: AERO_CL_GAUGE_D14,
  topics: [EMISSIONS_CLAIMED_TOPIC, word(ACCOUNT_D14), word(tokenId.toString(16)), word(recipient)],
  data: word(amount.toString(16)),
  logIndex,
});

describe("Aero CL rewards from EmissionsClaimed", () => {
  async function emissionsWorld() {
    const w = world();
    seedTokenPrice(w, AERO_PROTOCOL_AERO, "AERO", 18, "0.6");
    seedService(w, ACCOUNT_D14);
    const a = await seedPosition(w, ACCOUNT_D14, PROTOCOL_AERO_CL, 1226169n, USDC_NATIVE, BOLD, AERO_CL_GAUGE_D14, 1n, "0");
    const b = await seedPosition(w, ACCOUNT_D14, PROTOCOL_AERO_CL, 1226170n, USDC_NATIVE, BOLD, AERO_CL_GAUGE_D14, 1n, "0");
    return { w, a, b };
  }
  const attribute = (w: W, amount: bigint, logIndex: number, receipt: h.ReceiptLog[]) =>
    attributeRewardTransfer(w.ctx, at(AERO_PROTOCOL_AERO, logIndex), ETH_ADDRESS, ACCOUNT_D14, amount, receipt);

  it("EmissionsClaimed credits its tokenId once (0xcdd2ac26)", async () => {
    const { w, a } = await emissionsWorld();
    expect(RECEIPT_EMISSIONS_CLAIMED_0XCDD2AC26).toHaveLength(28);
    const paid = 2618141535596443223n;
    expect(await attribute(w, paid, 102, RECEIPT_EMISSIONS_CLAIMED_0XCDD2AC26)).toBe(true);
    expect(await attribute(w, paid, 102, RECEIPT_EMISSIONS_CLAIMED_0XCDD2AC26)).toBe(false);
    expect(await field(w, a.id, "claimedRewards")).toBe("2.618141535596443223");
    expect(w.cache.all(CreditedRewardClaim).map((c) => c.id)).toEqual([TX + "6e000000"]); // log 110, little-endian
  });

  it("one claimEmissions over two tokenIds credits each its own amount", async () => {
    const { w, a, b } = await emissionsWorld();
    const receipt = [emissionsClaimed(1226169n, ACCOUNT_D14, 15n * 10n ** 17n, 11), emissionsClaimed(1226170n, ACCOUNT_D14, 25n * 10n ** 16n, 12)];
    expect(await attribute(w, 175n * 10n ** 16n, 10, receipt)).toBe(true);
    expect(await field(w, a.id, "claimedRewards")).toBe("1.5");
    expect(await field(w, b.id, "claimedRewards")).toBe("0.25");
  });

  it("only claims paid to the Safe, for its own tokenIds, are credited", async () => {
    const { w, a } = await emissionsWorld();
    const receipt = [emissionsClaimed(1226169n, OTHER, E18, 11), emissionsClaimed(999n, ACCOUNT_D14, E18, 12), emissionsClaimed(1226169n, ACCOUNT_D14, E18, 13)];
    expect(await attribute(w, 3n * E18, 10, receipt)).toBe(true);
    expect(await field(w, a.id, "claimedRewards")).toBe("1");
  });

  it("an EmissionsClaimed not emitted by the position's gauge is not credited", async () => {
    const { w, a } = await emissionsWorld();
    const receipt = [{ ...emissionsClaimed(1226169n, ACCOUNT_D14, E18, 11), address: OTHER }];
    expect(await attribute(w, E18, 10, receipt)).toBe(false);
    expect(await field(w, a.id, "claimedRewards")).toBe("0");
  });

  it("a Transfer pays only the claims its amount covers, in log order", async () => {
    const { w, a, b } = await emissionsWorld();
    const receipt = [emissionsClaimed(1226169n, ACCOUNT_D14, 2n * E18, 11), emissionsClaimed(1226170n, ACCOUNT_D14, E18, 12)];
    expect(await attribute(w, E18, 10, receipt)).toBe(true);
    expect(await field(w, a.id, "claimedRewards")).toBe("0");
    expect(await field(w, b.id, "claimedRewards")).toBe("1");
  });

  it("a Transfer of another token does not take the claims", async () => {
    const { w, a } = await emissionsWorld();
    const receipt = [emissionsClaimed(1226169n, ACCOUNT_D14, E18, 11)];
    expect(await attributeRewardTransfer(w.ctx, at(AERO, 10), ETH_ADDRESS, ACCOUNT_D14, E18, receipt)).toBe(false);
    expect(await field(w, a.id, "claimedRewards")).toBe("0");
  });
});

// --- v2 positions -------------------------------------------------------------

const V2_POOL = addr(0xb1);
const AERO_V2_POOL = addr(0xb2);
const AERO_V2_GAUGE = addr(0xb3);
const LP_SUPPLY = 1000n * E18;

function mockV2Pool(w: W, pool: string, safeLp: bigint, stable?: boolean) {
  w.chain.pools.set(pool, { token0: USDC_NATIVE, token1: BOLD, r0: 1000_000_000n, r1: 1000n * E18, stable });
  w.chain.mock(pool, v2PoolFns.balanceOf, { account: SAFE }, safeLp);
  w.chain.mock(pool, v2PoolFns.totalSupply, {}, LP_SUPPLY);
}

function v2World() {
  const w = world();
  seedService(w, SAFE);
  seedTokenPrice(w, AERO_PROTOCOL_AERO, "AERO", 18, "0.6");
  w.cache.set(VeloV2PoolDataSource, new VeloV2PoolDataSource({ id: V2_POOL, createdAtBlock: BLOCK }));
  mockV2Pool(w, V2_POOL, 10n * E18, true);
  w.chain.mock(VELO_VOTER, voterFns.gauges, { pool: V2_POOL }, ETH_ADDRESS);
  return w;
}

const v2Id = (protocol: string, pool: string) => utf8Hex(`${SAFE}-${protocol}-${pool}`);

describe("v2 positions: LP Transfer + Mint", () => {
  it("the LP mint opens the position and its Mint replaces the entry with the minted amounts", async () => {
    const w = v2World();
    await v2.handleVeloV2Transfer(w.ctx, at(V2_POOL, 1), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    const id = v2Id(PROTOCOL_VELODROME_V2, V2_POOL);
    // the refresh backfilled the entry from current amounts ($10 + $10)
    expect(await field(w, id, "entryAmountUSD")).toBe("20");
    expect(await w.cache.get(PendingMintPosition, `${TX}-${V2_POOL}`)).toBeDefined();
    await v2.handleV2Mint(w.ctx, at(V2_POOL, 2), { amount0: 9_000_000n, amount1: 11n * E18 });
    expect(await field(w, id, "entryAmount0")).toBe("9");
    expect(await field(w, id, "entryAmount1")).toBe("11");
    expect(await field(w, id, "entryAmountUSD")).toBe("20");
    expect(await field(w, id, "investmentUSD")).toBe("20");
    expect(await field(w, id, "fee")).toBe("5");
    expect(await field(w, id, "amount0")).toBe("10");
    expect(await w.cache.get(PendingMintPosition, `${TX}-${V2_POOL}`)).toBeUndefined();
    expect((await w.cache.get(Service, SAFE))!.positionIds).toEqual([id]);
  });

  it("two LP mints in the tx that creates the row add up to its entry", async () => {
    const w = v2World();
    await v2.handleVeloV2Transfer(w.ctx, at(V2_POOL, 1), { from: ETH_ADDRESS, to: SAFE, value: 5n * E18 });
    await v2.handleV2Mint(w.ctx, at(V2_POOL, 2), { amount0: 5_000_000n, amount1: 5n * E18 });
    await v2.handleVeloV2Transfer(w.ctx, at(V2_POOL, 3), { from: ETH_ADDRESS, to: SAFE, value: 5n * E18 });
    await v2.handleV2Mint(w.ctx, at(V2_POOL, 4), { amount0: 4_000_000n, amount1: 6n * E18 });
    expect(await field(w, v2Id(PROTOCOL_VELODROME_V2, V2_POOL), "entryAmountUSD")).toBe("20");
  });

  it("LP minted into a closed row starts a new cycle with no income, exit, costs or ROI", async () => {
    const w = v2World();
    await v2.handleVeloV2Transfer(w.ctx, at(V2_POOL, 1), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    const id = v2Id(PROTOCOL_VELODROME_V2, V2_POOL);
    const p = await pos(w, id);
    closeAt(p, "30");
    p.collectedFeesUSD = gd("4").toStore();
    p.positionROI = gd("12").toStore();
    p.totalCostsUSD = gd("2").toStore();
    const later = { blockNumber: BLOCK + 10n, blockTimestamp: TS + 20n, txHash: hash(0x76) };
    await v2.handleVeloV2Transfer(w.ctx, at(V2_POOL, 1, later), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    await v2.handleV2Mint(w.ctx, at(V2_POOL, 2, later), { amount0: 7_000_000n, amount1: 7n * E18 });
    const q = await pos(w, id);
    expect([q.isActive, q.exitAmountUSD, q.exitTxHash, q.entryTxHash]).toEqual([true, null, null, hash(0x76)]);
    expect(await field(w, id, "collectedFeesUSD")).toBe("0");
    expect(await field(w, id, "positionROI")).toBe("0");
    expect(await field(w, id, "totalCostsUSD")).toBe("0");
    expect(await field(w, id, "entryAmountUSD")).toBe("14");
  });

  it("a Burn records the exit and a zero balance closes the position", async () => {
    const w = v2World();
    await v2.handleVeloV2Transfer(w.ctx, at(V2_POOL, 1), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    await v2.handleV2Mint(w.ctx, at(V2_POOL, 2), { amount0: 10_000_000n, amount1: 10n * E18 });
    w.chain.mock(V2_POOL, v2PoolFns.balanceOf, { account: SAFE }, 0n);
    const later = { blockNumber: BLOCK + 10n, blockTimestamp: TS + 20n };
    await v2.handleVeloV2Burn(w.ctx, at(V2_POOL, 5, later), { sender: OTHER, to: SAFE, amount0: 11_000_000n, amount1: 11n * E18 });
    const id = v2Id(PROTOCOL_VELODROME_V2, V2_POOL);
    expect(await field(w, id, "isActive")).toBe("false");
    expect(await field(w, id, "exitAmountUSD")).toBe("22");
    expect(await field(w, id, "netGainUSD")).toBe("2");
    expect(await field(w, id, "positionROI")).toBe("10");
    expect(await field(w, id, "usdCurrent")).toBe("0");
  });

  it("a legacy pool's Voter gauge is cached; a staked LP counts and earns legacy AERO", async () => {
    const w = v2World();
    seedTokenPrice(w, AERO, "AERO", 18, "0.05");
    const GAUGE = addr(0xb4);
    w.chain.mock(VELO_VOTER, voterFns.gauges, { pool: V2_POOL }, GAUGE);
    w.chain.mock(V2_POOL, v2PoolFns.balanceOf, { account: SAFE }, 0n);
    w.chain.mock(GAUGE, v2GaugeFns.balanceOf, { account: SAFE }, 10n * E18);
    w.chain.mock(GAUGE, v2GaugeFns.earned, { account: SAFE }, 20n * E18);
    await v2.refreshVeloV2Position(w.ctx, SAFE, V2_POOL, at(V2_POOL), TX);
    const id = v2Id(PROTOCOL_VELODROME_V2, V2_POOL);
    expect([await field(w, id, "isActive"), await field(w, id, "liquidity"), await field(w, id, "rewardsContract")]).toEqual(["true", String(10n * E18), GAUGE]);
    expect(await field(w, id, "claimableRewardUSD")).toBe("1");
    expect(await field(w, id, "usdCurrentWithRewards")).toBe("21");
    const voterCalls = () => w.chain.calls.filter((c) => c.startsWith(voterFns.gauges.selector)).length;
    const before = voterCalls();
    await v2.refreshVeloV2Position(w.ctx, SAFE, V2_POOL, at(V2_POOL), TX);
    expect(voterCalls()).toBe(before);
  });
});

describe("Aero v2 pools (factories + GaugeManager)", () => {
  const created = (w: W, factory: string, token0: string, token1: string, pool = AERO_V2_POOL) =>
    v2.handleAeroV2PoolCreated(w.ctx, at(factory), { token0, token1, pool });

  it("PoolCreated for a pair that is not whitelisted is ignored", async () => {
    const w = world();
    await created(w, AERO_V2_STABLE_FACTORY, USDC_NATIVE, DUMMY0);
    expect(w.cache.all(V2PoolVenue)).toHaveLength(0);
    expect(w.ctx.spawnedPools).toEqual([]);
  });

  it("PoolCreated records the venue (stable by factory) and starts the AeroV2Pool template", async () => {
    const w = world();
    await created(w, AERO_V2_STABLE_FACTORY, USDC_NATIVE, BOLD);
    await created(w, AERO_V2_VOLATILE_FACTORY, USDC_NATIVE, WETH, addr(0xb9));
    expect((await w.cache.get(V2PoolVenue, AERO_V2_POOL))!).toMatchObject({ protocol: "aero-v2", stable: true });
    expect((await w.cache.get(V2PoolVenue, addr(0xb9)))!.stable).toBe(false);
    expect(w.ctx.spawnedPools).toEqual([AERO_V2_POOL, addr(0xb9)]);
  });

  it("GaugeCreated feeds the aero-v2 gauge lookup; staked LP and Aero's AERO rewards are counted", async () => {
    const w = world();
    seedService(w, SAFE);
    seedTokenPrice(w, AERO_PROTOCOL_AERO, "AERO", 18, "0.6");
    await created(w, AERO_V2_STABLE_FACTORY, USDC_NATIVE, BOLD);
    await v2.handleAeroGaugeCreated(w.ctx, at(AERO_GAUGE_MANAGER), { target: AERO_V2_POOL, gauge: AERO_V2_GAUGE });
    mockV2Pool(w, AERO_V2_POOL, 0n); // Aero v2 pools have no stable(): the venue row gives it
    w.chain.mock(AERO_V2_GAUGE, v2GaugeFns.balanceOf, { account: SAFE }, 10n * E18);
    w.chain.mock(AERO_V2_GAUGE, v2GaugeFns.earned, { account: SAFE }, 2n * E18);
    await v2.handleVeloV2Transfer(w.ctx, at(AERO_V2_POOL, 1), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    const id = v2Id(PROTOCOL_AERO_V2, AERO_V2_POOL);
    const p = await pos(w, id);
    expect([p.protocol, p.isActive, p.rewardsContract, p.fee]).toEqual(["aero-v2", true, AERO_V2_GAUGE, 5]);
    expect(await field(w, id, "claimableReward")).toBe("2");
    expect(await field(w, id, "claimableRewardUSD")).toBe("1.2");
    expect(await field(w, id, "usdCurrent")).toBe("20");
    expect(w.chain.calls.some((c) => c.startsWith(voterFns.gauges.selector))).toBe(false);
  });

  it("a later GaugeCreated for the same pool replaces the gauge", async () => {
    const w = world();
    await v2.handleAeroGaugeCreated(w.ctx, at(AERO_GAUGE_MANAGER), { target: AERO_V2_POOL, gauge: AERO_V2_GAUGE });
    await v2.handleAeroGaugeCreated(w.ctx, at(AERO_GAUGE_MANAGER, 1, { blockNumber: BLOCK + 5n }), { target: AERO_V2_POOL, gauge: OTHER });
    expect(await w.cache.get(AeroGauge, AERO_V2_POOL)).toMatchObject({ gauge: OTHER, createdAtBlock: BLOCK + 5n });
  });

  it("Aero's 4-arg Mint sets entry amounts", async () => {
    const w = world();
    seedService(w, SAFE);
    await created(w, AERO_V2_VOLATILE_FACTORY, USDC_NATIVE, BOLD);
    mockV2Pool(w, AERO_V2_POOL, 10n * E18);
    await v2.handleVeloV2Transfer(w.ctx, at(AERO_V2_POOL, 1), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    await v2.handleV2Mint(w.ctx, at(AERO_V2_POOL, 2), { amount0: 3_000_000n, amount1: 4n * E18 });
    const id = v2Id(PROTOCOL_AERO_V2, AERO_V2_POOL);
    expect(await field(w, id, "entryAmountUSD")).toBe("7");
    expect(await field(w, id, "fee")).toBe("30");
  });
});

// --- discovery: LpSugar bootstrap and the Aerodrome v2 factory ----------------

const sugarPool = (lp: string, type: number, token0: string, token1: string) => ({
  lp,
  type,
  token0,
  token1,
  factory: VELO_V2_FACTORY,
  pool_fee: 0n,
});

describe("handleVeloV2Bootstrap pagination", () => {
  const startAt = { blockNumber: BigInt(CHAIN.startBlock), blockTimestamp: TS };

  it("aborts without calling forSwaps when allPoolsLength reverts", async () => {
    const w = world();
    w.chain.mock(VELO_V2_FACTORY, poolFactoryFns.allPoolsLength, {}, null);
    await v2.handleVeloV2Bootstrap(w.ctx, startAt);
    expect(w.chain.calls.some((c) => c.startsWith(sugarFns.forSwaps.selector))).toBe(false);
    expect(w.cache.all(VeloV2PoolDataSource)).toHaveLength(0);
  });

  it("continues past a short page up to allPoolsLength; only whitelisted stable/volatile pools", async () => {
    const w = world();
    w.chain.mock(VELO_V2_FACTORY, poolFactoryFns.allPoolsLength, {}, 600n);
    w.chain.mock(VELO_V2_SUGAR, sugarFns.forSwaps, { _limit: 500n, _offset: 0n }, [
      sugarPool(addr(0x101), 0, USDC_NATIVE, BOLD),
      sugarPool(addr(0x102), -1, USDC_NATIVE, DUMMY0), // not whitelisted
      sugarPool(addr(0x103), 1, USDC_NATIVE, BOLD), // CL (tickSpacing 1)
    ]);
    w.chain.mock(VELO_V2_SUGAR, sugarFns.forSwaps, { _limit: 500n, _offset: 500n }, [sugarPool(addr(0x104), -1, WETH, USDC_NATIVE)]);
    await v2.handleVeloV2Bootstrap(w.ctx, startAt);
    expect(w.cache.all(VeloV2PoolDataSource).map((r) => r.id)).toEqual([addr(0x101), addr(0x104)]);
  });

  it("the Aerodrome v2 factory adds whitelisted pools created later", async () => {
    const w = world();
    await v2.handleVeloV2PoolCreated(w.ctx, at(VELO_V2_FACTORY), { token0: USDC_NATIVE, token1: DUMMY0, pool: addr(0x105) });
    await v2.handleVeloV2PoolCreated(w.ctx, at(VELO_V2_FACTORY), { token0: USDC_NATIVE, token1: BOLD, pool: addr(0x106) });
    expect(w.cache.all(VeloV2PoolDataSource).map((r) => r.id)).toEqual([addr(0x106)]);
  });
});

// --- LiFi swaps and their slippage ---------------------------------------------

const LIFI_TX_ID = hash(0x1f1);

describe("LiFi swaps", () => {
  const swap = (w: W, over: Partial<Parameters<typeof handleLiFiGenericSwapCompleted>[2]> = {}, logIndex = 5) =>
    handleLiFiGenericSwapCompleted(w.ctx, at(LIFI_DIAMOND, logIndex), {
      transactionId: LIFI_TX_ID,
      integrator: "valory",
      receiver: SAFE,
      fromAssetId: ETH_ADDRESS,
      toAssetId: USDC_NATIVE,
      fromAmount: E18,
      toAmount: 2990_000_000n,
      ...over,
    });

  it("a valory swap into a service safe records its slippage, buffers it and moves the ETH balance", async () => {
    const w = world();
    seedService(w, SAFE);
    await swap(w);
    const id = swapTransactionId(TX, 5);
    expect(id).toBe(TX + Buffer.from("-5").toString("hex"));
    const s = (await w.cache.get(SwapTransaction, id))!;
    expect([s.fromAmountUSD.toFixed(), s.toAmountUSD.toFixed(), s.expectedToAmountUSD.toFixed(), s.slippageUSD.toFixed()]).toEqual([
      "3000",
      "2990",
      "3000",
      "10",
    ]);
    expect(s.slippagePercentage.toFixed()).toBe("0.3333333333333333333333333333333333");
    expect([s.isAssociated, s.expiresAt, s.agent, s.transactionId]).toEqual([false, TS + 1200n, SAFE, LIFI_TX_ID]);
    const buffer = (await w.cache.get(AgentSwapBuffer, SAFE))!;
    expect(buffer.bucket0Swaps).toBe(`${TS},${id},10,${TS + 1200n},${id}`);
    expect(buffer.currentBucketIndex).toBe(TS / 300n);
    expect((await w.cache.get(TokenBalance, tokenBalanceId(SAFE, ETH_ADDRESS)))!.balance.toFixed()).toBe("0");
  });

  it("ETH out of a swap raises the ETH balance; a newer bucket rotates the buffer", async () => {
    const w = world();
    seedService(w, SAFE);
    await swap(w);
    const later = at(LIFI_DIAMOND, 7, { blockTimestamp: TS + 600n });
    await handleLiFiGenericSwapCompleted(w.ctx, later, {
      transactionId: LIFI_TX_ID,
      integrator: "valory",
      receiver: SAFE,
      fromAssetId: USDC_NATIVE,
      toAssetId: ETH_ADDRESS,
      fromAmount: 3000_000_000n,
      toAmount: E18,
    });
    expect((await w.cache.get(TokenBalance, tokenBalanceId(SAFE, ETH_ADDRESS)))!.balance.toFixed()).toBe("1");
    const buffer = (await w.cache.get(AgentSwapBuffer, SAFE))!;
    expect(buffer.bucket1Swaps).toContain(`,10,`);
    expect(buffer.bucket0Swaps).toContain(`${TS + 600n},`);
  });

  it("other integrators and receivers that are not service safes are ignored", async () => {
    const w = world();
    seedService(w, SAFE);
    await swap(w, { integrator: "jumper" });
    await swap(w, { receiver: OTHER });
    expect(w.cache.all(SwapTransaction)).toHaveLength(0);
  });

  it("a v2 position whose entry is backfilled takes the buffered swap's slippage as its cost", async () => {
    const w = v2World();
    await swap(w);
    await v2.handleVeloV2Transfer(w.ctx, at(V2_POOL, 9), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    const id = v2Id(PROTOCOL_VELODROME_V2, V2_POOL);
    expect(await field(w, id, "swapSlippageUSD")).toBe("10");
    expect(await field(w, id, "investmentUSD")).toBe("30");
    expect((await w.cache.get(AgentSwapBuffer, SAFE))!.bucket0Swaps).toBe("");
    // the immutable SwapTransaction is not rewritten
    expect((await w.cache.get(SwapTransaction, swapTransactionId(TX, 5)))!.isAssociated).toBe(false);
  });
});

// --- dispatch / block: template sets, deferral, bootstrap ------------------------

describe("position events through processBlock", () => {
  const header = { number: Number(BLOCK), hash: hash(0xb1), timestamp: Number(TS) * 1000 };
  const raw = (logIndex: number, address: string, e: { topics: string[]; data: string }): RawLog => ({
    address,
    logIndex,
    transactionHash: TX,
    topics: e.topics,
    data: e.data,
    transaction: tx(),
  });
  const stream = () => ({ serviceSafes: new Set([SAFE]), safeHosts: new Set([SAFE]) });

  it("a pool created in the block runs its events after the block's others, earlier ones included", async () => {
    const w = world();
    seedService(w, SAFE);
    mockV2Pool(w, AERO_V2_POOL, 10n * E18);
    const logs = [
      raw(1, AERO_V2_POOL, v2PoolEvents.Transfer.encode({ from: ETH_ADDRESS, to: SAFE, value: 10n * E18 })),
      raw(2, AERO_V2_STABLE_FACTORY, aeroFactoryEvents.PoolCreated.encode({ token0: USDC_NATIVE, token1: BOLD, pool: AERO_V2_POOL, _3: 1n })),
      raw(3, V2_POOL, v2PoolEvents.Transfer.encode({ from: ETH_ADDRESS, to: SAFE, value: E18 })), // no template: ignored
    ];
    await processBlock(w.ctx, { header, logs }, stream(), async () => []);
    expect((await pos(w, v2Id(PROTOCOL_AERO_V2, AERO_V2_POOL))).isActive).toBe(true);
    expect(w.cache.all(ProtocolPosition)).toHaveLength(1);
    expect(w.ctx.spawnedPools).toEqual([]);
  });

  it("a factory log before its data source's startBlock is ignored", async () => {
    const w = world();
    const early = { ...header, number: 52_000_000 };
    const logs = [raw(1, AERO_V2_STABLE_FACTORY, aeroFactoryEvents.PoolCreated.encode({ token0: USDC_NATIVE, token1: BOLD, pool: AERO_V2_POOL, _3: 1n }))];
    await processBlock(w.ctx, { header: early, logs }, stream(), async () => []);
    expect(w.cache.all(V2PoolVenue)).toHaveLength(0);
  });

  it("the start block runs the LpSugar bootstrap after its logs", async () => {
    const w = world();
    w.chain.mock(VELO_V2_FACTORY, poolFactoryFns.allPoolsLength, {}, 1n);
    w.chain.mock(VELO_V2_SUGAR, sugarFns.forSwaps, { _limit: 500n, _offset: 0n }, [sugarPool(addr(0x101), 0, USDC_NATIVE, BOLD)]);
    await processBlock(w.ctx, { header: { ...header, number: CHAIN.startBlock }, logs: [] }, stream(), async () => []);
    expect(w.cache.all(VeloV2PoolDataSource).map((r) => r.id)).toEqual([addr(0x101)]);
    await processBlock(w.ctx, { header: { ...header, number: CHAIN.startBlock + 1 }, logs: [] }, stream(), async () => []);
    expect(w.chain.calls.filter((c) => c.startsWith(poolFactoryFns.allPoolsLength.selector))).toHaveLength(1);
  });
});

describe("refreshAllActivePositions dispatch (snapshot refresh)", () => {
  it("refreshes active aero-cl and aero-v2 positions, and skips closed ones", async () => {
    const w = clWorld();
    const clId = await openCLPosition(w);
    await v2.handleAeroV2PoolCreated(w.ctx, at(AERO_V2_STABLE_FACTORY), { token0: USDC_NATIVE, token1: BOLD, pool: AERO_V2_POOL });
    mockV2Pool(w, AERO_V2_POOL, 10n * E18);
    await v2.handleVeloV2Transfer(w.ctx, at(AERO_V2_POOL, 5), { from: ETH_ADDRESS, to: SAFE, value: 10n * E18 });
    const v2Pos = await pos(w, v2Id(PROTOCOL_AERO_V2, AERO_V2_POOL));
    const closed = await seedPosition(w, SAFE, PROTOCOL_VELODROME_V3, 99n, USDC_NATIVE, BOLD, null, 0n, "0");
    closeAt(closed, "1");

    mockV2Pool(w, AERO_V2_POOL, 20n * E18);
    const snapshot = { blockNumber: BLOCK + 1800n, blockTimestamp: TS + 3600n };
    w.chain.calls = [];
    await refreshAllActivePositions(w.ctx, SAFE, snapshot, false);
    expect(await field(w, v2Pos.id, "usdCurrent")).toBe("40");
    expect((await pos(w, clId)).entryTxHash).toBe(TX);
    expect(w.chain.calls.some((c) => c.startsWith(nfpmFns.positions.selector) && c.includes(AERO_NFT_MANAGER))).toBe(true);
    expect(w.chain.calls.some((c) => c.includes(`@${ETH_ADDRESS}#`))).toBe(false); // the closed row's pool is not read
  });
});
