// CL positions on the legacy Aerodrome Slipstream NFPM and on Aero's NFPM,
// ported from studio babydegen-base src/veloNFTManager.ts and
// src/veloCLShared.ts as of #175. The emitting manager picks the venue, so
// the two NFTs' token ids never share a mapping or a position id.

import type { EventMeta } from "@olas/squid-shared";
import * as aeroGauge from "./abi/AeroCLGauge/functions";
import * as veloGauge from "./abi/VeloCLGauge/functions";
import * as clFactory from "./abi/VelodromeCLFactory/functions";
import * as clPool from "./abi/VelodromeCLPool/functions";
import * as nfpm from "./abi/VelodromePositionNFTManager/functions";
import * as calls from "./calls";
import { getAmountsForLiquidity, getSqrtRatioAtTick } from "./clMath";
import {
  AERO_CL_FACTORY,
  AERO_NFT_MANAGER,
  PROTOCOL_AERO_CL,
  PROTOCOL_VELODROME_V3,
  rewardTokenFor,
  VELO_CL_FACTORY,
  VELO_NFT_MANAGER,
} from "./constants";
import { GD } from "./decimal";
import { ETH_ADDRESS } from "./ids";
import { NFTPositionMapping, ProtocolPosition, Service } from "./model";
import { calculatePortfolioMetrics } from "./portfolio";
import {
  addServicePosition,
  addToExit,
  calculatePositionROI,
  clPositionId,
  closedWithNoExitThisBlock,
  d,
  exitClosedInBlock,
  initializePositionCosts,
  initializePositionIncome,
  loadMappedPosition,
  mapNFTPosition,
  nftPositionMappingId,
  recordClaimableRewardBeforeBlock,
  recordCollectedFees,
  recordDecreaseInExit,
  recordFullExit,
  recordReleasedPrincipal,
  savePosition,
  type PosCtx,
} from "./positions";
import { getTokenPriceUSD, type At } from "./pricing";
import { associateSwapsWithPosition } from "./swaps";
import { convertTokenAmount, getTokenSymbol } from "./tokenUtils";

const ZERO = GD.ZERO;
const ZERO_ADDRESS = ETH_ADDRESS;
/** `Bytes.empty()`, the txHash of a refresh outside an event (the snapshot scheduler). */
export const NO_TX = "0x";

export interface CLVenue {
  protocol: string;
  manager: string;
  factory: string;
  rewardToken: string;
}

export function clVenue(protocol: string): CLVenue {
  if (protocol === PROTOCOL_AERO_CL) {
    return { protocol, manager: AERO_NFT_MANAGER, factory: AERO_CL_FACTORY, rewardToken: rewardTokenFor(protocol) };
  }
  if (protocol !== PROTOCOL_VELODROME_V3) throw new Error(`CLVenue: '${protocol}' is not a CL venue`);
  return { protocol, manager: VELO_NFT_MANAGER, factory: VELO_CL_FACTORY, rewardToken: rewardTokenFor(protocol) };
}

export function clVenueForManager(manager: string): CLVenue {
  if (manager === AERO_NFT_MANAGER) return clVenue(PROTOCOL_AERO_CL);
  if (manager !== VELO_NFT_MANAGER) throw new Error(`clVenueForManager: ${manager} is not a known CL position manager`);
  return clVenue(PROTOCOL_VELODROME_V3);
}

type PositionData = NonNullable<Awaited<ReturnType<typeof readPosition>>>;

/** NFPM positions(tokenId), addresses lowercased; null on a revert. */
async function readPosition(ctx: PosCtx, manager: string, tokenId: bigint, at: At) {
  const r = await ctx.chain.call(manager, at.blockNumber, nfpm.positions, { tokenId });
  if (r == null) return null;
  return { ...r, token0: r.token0.toLowerCase(), token1: r.token1.toLowerCase() };
}

/** getPoolAddress: the factory's pool for (token0, token1, tickSpacing), trying both orders; zero when none. */
async function getPoolAddress(ctx: PosCtx, venue: CLVenue, token0: string, token1: string, tickSpacing: number, at: At): Promise<string> {
  const read = (a: string, b: string) =>
    ctx.chain.call(venue.factory, at.blockNumber, clFactory.getPool, { _0: a, _1: b, _2: tickSpacing });
  const pool = (await read(token0, token1)) ?? (await read(token1, token0));
  return pool == null ? ZERO_ADDRESS : pool.toLowerCase();
}

// --- veloNFTManager.ts ---------------------------------------------------------

export async function handleNFTTransfer(
  ctx: PosCtx,
  meta: EventMeta,
  e: { from: string; to: string; tokenId: bigint },
): Promise<void> {
  const venue = clVenueForManager(meta.address);
  if (e.from === ZERO_ADDRESS) {
    if ((await ctx.cache.get(Service, e.to)) == null) return;
    const positionId = clPositionId(e.to, e.tokenId, venue.protocol);
    await mapNFTPosition(ctx, venue.protocol, e.tokenId, positionId);
    if ((await ctx.cache.get(ProtocolPosition, positionId)) == null) {
      await refreshOrCreateCLPosition(ctx, positionId, e.tokenId, meta, meta.txHash, false, { owner: e.to, venue });
    }
    return;
  }
  if (e.to === ZERO_ADDRESS) {
    if ((await ctx.cache.get(Service, e.from)) == null) return;
    const position = await ctx.cache.get(ProtocolPosition, clPositionId(e.from, e.tokenId, venue.protocol));
    if (position != null) {
      position.isActive = false;
      position.exitTxHash = meta.txHash;
      position.exitTimestamp = meta.blockTimestamp;
      savePosition(ctx, position);
    }
  }
}

/** handleIncreaseLiquidity (legacy, 4 args) and handleAeroIncreaseLiquidity (6 args) alike. */
export async function handleIncreaseLiquidity(
  ctx: PosCtx,
  meta: EventMeta,
  e: { tokenId: bigint; amount0: bigint; amount1: bigint },
): Promise<void> {
  const protocol = clVenueForManager(meta.address).protocol;
  const mapping = await ctx.cache.get(NFTPositionMapping, nftPositionMappingId(protocol, e.tokenId));
  if (mapping == null) return;
  await refreshVeloCLPositionWithEventAmounts(ctx, mapping.positionId, e.tokenId, meta, e.amount0, e.amount1, meta.txHash);
}

export async function handleDecreaseLiquidity(
  ctx: PosCtx,
  meta: EventMeta,
  e: { tokenId: bigint; liquidity: bigint; amount0: bigint; amount1: bigint },
): Promise<void> {
  const protocol = clVenueForManager(meta.address).protocol;
  const mapping = await ctx.cache.get(NFTPositionMapping, nftPositionMappingId(protocol, e.tokenId));
  if (mapping == null) return;
  await recordReleasedPrincipal(ctx, protocol, e.tokenId, e.amount0, e.amount1);
  await refreshVeloCLPositionWithExitAmounts(ctx, mapping.positionId, e.tokenId, meta, e.amount0, e.amount1, meta.txHash);
}

export async function handleCollect(
  ctx: PosCtx,
  meta: EventMeta,
  e: { tokenId: bigint; recipient: string; amount0: bigint; amount1: bigint },
): Promise<void> {
  const protocol = clVenueForManager(meta.address).protocol;
  const position = await loadMappedPosition(ctx, protocol, e.tokenId);
  if (position == null) return;
  await recordCollectedFees(ctx, position, protocol, e.recipient, e.amount0, e.amount1, meta);
  // A closed position keeps the exit amounts its DecreaseLiquidity recorded.
  if (position.isActive) await refreshVeloCLPosition(ctx, position.id, e.tokenId, meta, meta.txHash, false);
  await calculatePortfolioMetrics(ctx, position.agent, meta);
}

// --- veloCLShared.ts -----------------------------------------------------------

export async function refreshVeloCLPositionWithEventAmounts(
  ctx: PosCtx,
  positionId: string,
  tokenId: bigint,
  at: At,
  eventAmount0: bigint,
  eventAmount1: bigint,
  txHash: string,
): Promise<void> {
  const pp = await ctx.cache.get(ProtocolPosition, positionId);
  if (pp == null) return;
  const owner = pp.agent;
  const data = await readPosition(ctx, clVenue(pp.protocol).manager, tokenId, at);
  if (data == null) {
    ctx.log.warn(`CL entry: positions() reverted for position ${positionId} (tokenId ${tokenId}, venue ${pp.protocol}) — entry amounts not recorded`);
    return;
  }
  const price0 = await getTokenPriceUSD(ctx, data.token0, at);
  const price1 = await getTokenPriceUSD(ctx, data.token1, at);
  const human0 = convertTokenAmount(eventAmount0, data.token0, ctx.log);
  const human1 = convertTokenAmount(eventAmount1, data.token1, ctx.log);
  const usd0 = human0.times(price0);
  const usd1 = human1.times(price1);
  const usd = usd0.plus(usd1);

  if (d(pp.entryAmountUSD).equals(ZERO) && pp.entryTimestamp === 0n) {
    pp.entryTxHash = txHash;
    pp.entryTimestamp = at.blockTimestamp;
    pp.entryAmount0 = human0.toStore();
    pp.entryAmount0USD = usd0.toStore();
    pp.entryAmount1 = human1.toStore();
    pp.entryAmount1USD = usd1.toStore();
    pp.entryAmountUSD = usd.toStore();
    let slippage = await associateSwapsWithPosition(ctx, owner, at);
    if (slippage.lt(ZERO)) slippage = ZERO;
    pp.swapSlippageUSD = slippage.toStore();
    pp.totalCostsUSD = slippage.toStore();
    pp.investmentUSD = usd.plus(slippage).toStore();
  } else {
    pp.entryAmount0 = d(pp.entryAmount0).plus(human0).toStore();
    pp.entryAmount0USD = d(pp.entryAmount0USD).plus(usd0).toStore();
    pp.entryAmount1 = d(pp.entryAmount1).plus(human1).toStore();
    pp.entryAmount1USD = d(pp.entryAmount1USD).plus(usd1).toStore();
    pp.entryAmountUSD = d(pp.entryAmountUSD).plus(usd).toStore();
    pp.investmentUSD = d(pp.entryAmountUSD).plus(d(pp.totalCostsUSD)).toStore();
  }
  savePosition(ctx, pp);
  await refreshVeloCLPosition(ctx, positionId, tokenId, at, txHash);
}

export async function refreshVeloCLPositionWithExitAmounts(
  ctx: PosCtx,
  positionId: string,
  tokenId: bigint,
  at: At,
  eventAmount0: bigint,
  eventAmount1: bigint,
  txHash: string,
): Promise<void> {
  const pp = await ctx.cache.get(ProtocolPosition, positionId);
  if (pp == null) return;
  if (closedWithNoExitThisBlock(pp, at)) {
    ctx.log.warn(`CL exit: tx ${txHash} — DecreaseLiquidity for position ${positionId} (tokenId ${tokenId}) skipped: the position is closed and recorded no exit in this block`);
    return;
  }
  const venue = clVenue(pp.protocol);
  // positions() reads end-of-block state, so it reverts when the NFT is burned later in the block.
  const data = await readPosition(ctx, venue.manager, tokenId, at);
  if (data == null) {
    ctx.log.warn(`CL exit: positions() reverted for position ${positionId} (tokenId ${tokenId}, venue ${venue.protocol}) — burned in this block; exit taken from the DecreaseLiquidity amounts`);
  }
  const isFullExit = data == null || data.liquidity === 0n;
  if (isFullExit && (await recordFullExit(ctx, pp, eventAmount0, eventAmount1, at, txHash))) {
    savePosition(ctx, pp);
    await calculatePortfolioMetrics(ctx, pp.agent, at); // refreshPortfolio
  } else {
    // A partial decrease's principal is exit proceeds too, whenever it is collected.
    if (!isFullExit && (await recordDecreaseInExit(ctx, pp, eventAmount0, eventAmount1, at))) savePosition(ctx, pp);
    await refreshVeloCLPosition(ctx, positionId, tokenId, at, txHash);
  }
}

export function refreshVeloCLPosition(
  ctx: PosCtx,
  positionId: string,
  tokenId: bigint,
  at: At,
  txHash: string = NO_TX,
  updatePortfolio = true,
): Promise<void> {
  return refreshOrCreateCLPosition(ctx, positionId, tokenId, at, txHash, updatePortfolio, null);
}

const isPositionClosed = (liquidity: bigint, amount0: GD, amount1: GD) =>
  liquidity === 0n || (amount0.equals(ZERO) && amount1.equals(ZERO));

async function refreshOrCreateCLPosition(
  ctx: PosCtx,
  positionId: string,
  tokenId: bigint,
  at: At,
  txHash: string,
  updatePortfolio: boolean,
  create: { owner: string; venue: CLVenue } | null,
): Promise<void> {
  let position = await ctx.cache.get(ProtocolPosition, positionId);
  let owner: string;
  let poolAddress: string;
  let venue: CLVenue;
  let first: Awaited<ReturnType<typeof readPosition>> = null;

  if (position == null) {
    if (create === null) return;
    owner = create.owner;
    venue = create.venue;
    const service = await ctx.cache.get(Service, owner);
    if (service == null) return;
    first = await readPosition(ctx, venue.manager, tokenId, at);
    if (first == null) {
      ctx.log.error(`CL create: positions() reverted for position ${positionId} (tokenId ${tokenId}, venue ${venue.protocol}, manager ${venue.manager}) — not created.`);
      return;
    }
    poolAddress = await getPoolAddress(ctx, venue, first.token0, first.token1, first.tickSpacing, at);
    if (poolAddress === ZERO_ADDRESS) {
      ctx.log.error(`CL create: no pool for position ${positionId} (tokenId ${tokenId}, venue ${venue.protocol}, factory ${venue.factory}, token0 ${first.token0}, token1 ${first.token1}, tickSpacing ${first.tickSpacing}) — not created.`);
      return;
    }
    position = new ProtocolPosition({ id: positionId });
    initializePositionIncome(position);
    position.agent = owner;
    position.service = service;
    position.protocol = venue.protocol;
    position.pool = poolAddress;
    position.tokenId = tokenId;
    position.isActive = true;
    await addServicePosition(ctx, owner, positionId);
    position.tickLower = first.tickLower;
    position.tickUpper = first.tickUpper;
    position.tickSpacing = first.tickSpacing;
    position.token0 = first.token0;
    position.token1 = first.token1;
    position.token0Symbol = getTokenSymbol(first.token0, ctx.log);
    position.token1Symbol = getTokenSymbol(first.token1, ctx.log);
    position.entryTxHash = txHash;
    // 0 until the first IncreaseLiquidity records the entry and links its buffered swaps
    position.entryTimestamp = 0n;
    position.entryAmount0 = ZERO.toStore();
    position.entryAmount0USD = ZERO.toStore();
    position.entryAmount1 = ZERO.toStore();
    position.entryAmount1USD = ZERO.toStore();
    position.entryAmountUSD = ZERO.toStore();
    position.usdCurrent = ZERO.toStore();
    position.usdCurrentWithRewards = ZERO.toStore();
    position.amount0USD = ZERO.toStore();
    position.amount1USD = ZERO.toStore();
    initializePositionCosts(ctx, position);
  } else {
    venue = clVenue(position.protocol);
    owner = position.agent;
    poolAddress = position.pool;
  }

  // The create path already read positions() at this block.
  const data: PositionData | null = first ?? (await readPosition(ctx, venue.manager, tokenId, at));
  if (data == null) return;
  const slot0 = await ctx.chain.call(poolAddress, at.blockNumber, calls.slot0, {});
  if (slot0 == null) return;

  const amounts = getAmountsForLiquidity(
    slot0.sqrtPriceX96,
    getSqrtRatioAtTick(data.tickLower),
    getSqrtRatioAtTick(data.tickUpper),
    data.liquidity,
  );
  const price0 = await getTokenPriceUSD(ctx, data.token0, at);
  const price1 = await getTokenPriceUSD(ctx, data.token1, at);
  const human0 = convertTokenAmount(amounts.amount0, data.token0, ctx.log);
  const human1 = convertTokenAmount(amounts.amount1, data.token1, ctx.log);
  const usd0 = human0.times(price0);
  const usd1 = human1.times(price1);
  const usd = usd0.plus(usd1);

  let rewardAmount = ZERO;
  let rewardUSD = ZERO;
  const gauge = await resolveCLGauge(ctx, poolAddress, position, venue, at);
  if (gauge !== ZERO_ADDRESS) {
    const earned =
      venue.protocol === PROTOCOL_AERO_CL
        ? await getAeroCLEarned(ctx, gauge, owner, tokenId, at)
        : await ctx.chain.call(gauge, at.blockNumber, veloGauge.earned, { account: owner, tokenId });
    if (earned != null) {
      rewardAmount = convertTokenAmount(earned, venue.rewardToken, ctx.log);
      rewardUSD = rewardAmount.times(await getTokenPriceUSD(ctx, venue.rewardToken, at));
    } else {
      ctx.log.warn(`CL rewards: gauge.earned() reverted for active CL position ${positionId} (gauge ${gauge}, account ${owner}, tokenId ${tokenId}) — recording 0 reward.`);
    }
  }

  position.usdCurrent = usd.toStore();
  position.usdCurrentWithRewards = usd.plus(rewardUSD).toStore();
  position.token0 = data.token0;
  position.token0Symbol = getTokenSymbol(data.token0, ctx.log);
  position.amount0 = human0.toStore();
  position.amount0USD = usd0.toStore();
  position.token1 = data.token1;
  position.token1Symbol = getTokenSymbol(data.token1, ctx.log);
  position.amount1 = human1.toStore();
  position.amount1USD = usd1.toStore();
  position.liquidity = data.liquidity;
  await recordClaimableRewardBeforeBlock(ctx, position, at);
  position.claimableReward = rewardAmount.toStore();
  position.claimableRewardUSD = rewardUSD.toStore();

  if (d(position.totalCostsUSD).equals(ZERO) && d(position.swapSlippageUSD).equals(ZERO)) {
    if (d(position.investmentUSD).equals(ZERO) && d(position.entryAmountUSD).gt(ZERO)) {
      position.investmentUSD = d(position.entryAmountUSD).plus(d(position.totalCostsUSD)).toStore();
    }
  }

  if (isPositionClosed(data.liquidity, human0, human1)) {
    // A refresh after this block's exit (e.g. an IncreaseLiquidity) keeps that exit.
    if (!exitClosedInBlock(position, at)) {
      position.exitTxHash = txHash;
      position.exitTimestamp = at.blockTimestamp;
      addToExit(position, human0, usd0, human1, usd1);
    }
    position.isActive = false;
    calculatePositionROI(ctx, position);
  }
  savePosition(ctx, position);
  if (updatePortfolio) await calculatePortfolioMetrics(ctx, owner, at); // refreshPortfolio(owner, block, true)
}

/**
 * resolveCLGauge: the pool's gauge, or zero. Legacy gauges are cached on
 * rewardsContract once found; Aero ones are re-read each refresh. A zero or
 * reverted gauge() is never cached.
 */
async function resolveCLGauge(ctx: PosCtx, pool: string, position: ProtocolPosition, venue: CLVenue, at: At): Promise<string> {
  const cached = position.rewardsContract;
  if (cached && venue.protocol !== PROTOCOL_AERO_CL) return cached;
  const gauge = await ctx.chain.call(pool, at.blockNumber, clPool.gauge, {});
  if (gauge == null) {
    ctx.log.warn(`CL rewards: pool.gauge() reverted for position ${position.id} (pool ${pool}, tokenId ${position.tokenId}) — using the cached gauge, if any.`);
    return cached ? cached : ZERO_ADDRESS;
  }
  const value = gauge.toLowerCase();
  if (value === ZERO_ADDRESS) return ZERO_ADDRESS;
  position.rewardsContract = value;
  return value;
}

/**
 * Aero's CLGauge: earned(account, [tokenId]) reverts unless the account has
 * the NFT staked; an unstaked position earns 0.
 */
async function getAeroCLEarned(ctx: PosCtx, gauge: string, account: string, tokenId: bigint, at: At): Promise<bigint | null> {
  const staked = await ctx.chain.call(gauge, at.blockNumber, aeroGauge.stakedContains, { depositor: account, tokenId });
  if (staked == null) {
    ctx.log.warn(`Aero CL rewards: gauge.stakedContains() reverted (gauge ${gauge}, account ${account}, tokenId ${tokenId}) — recording 0 reward.`);
    return 0n;
  }
  if (!staked) return 0n;
  return ctx.chain.call(gauge, at.blockNumber, aeroGauge.earned_1, { _account: account, _tokenIds: [tokenId] });
}
