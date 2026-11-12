// Aerodrome (legacy) and Aero v2 LP positions, pool discovery and gauges,
// ported from studio babydegen-base src/veloV2Pool.ts, src/veloV2Shared.ts,
// src/veloV2Bootstrap.ts, src/veloV2Factory.ts and src/aeroGaugeManager.ts
// as of #175.
//
// The subgraph's VeloV2Pool / AeroV2Pool templates are kept as rows: an
// AeroV2Pool instance is exactly a V2PoolVenue row (handleAeroV2PoolCreated
// writes both), a VeloV2Pool instance a squid-only VeloV2PoolDataSource row.
// Pool events reach the handlers only from those addresses (dispatch.ts).

import type { EventMeta } from "@olas/squid-shared";
import * as sugar from "./abi/AerodromeLpSugar/functions";
import * as poolFactory from "./abi/PoolFactory/functions";
import * as v2Gauge from "./abi/VeloV2Gauge/functions";
import * as voter from "./abi/VeloVoter/functions";
import * as v2Pool from "./abi/VelodromeV2Pool/functions";
import {
  AERO_V2_STABLE_FACTORY,
  isPoolRelevant,
  PROTOCOL_AERO_V2,
  PROTOCOL_VELODROME_V2,
  rewardTokenFor,
  V2_STABLE_FEE_BPS,
  V2_VOLATILE_FEE_BPS,
  VELO_V2_FACTORY,
  VELO_V2_SUGAR,
  VELO_VOTER,
} from "./constants";
import { GD } from "./decimal";
import { ETH_ADDRESS, utf8Hex } from "./ids";
import { AeroGauge, PendingMintPosition, ProtocolPosition, Service, V2PoolVenue, VeloV2PoolDataSource } from "./model";
import { calculatePortfolioMetrics } from "./portfolio";
import {
  addServicePosition,
  addToExit,
  calculatePositionROI,
  d,
  initializePositionCosts,
  initializePositionIncome,
  savePosition,
  type PosCtx,
} from "./positions";
import type { Ctx } from "./handlers";
import { getTokenPriceUSD, v2PoolKind, type At } from "./pricing";
import { associateSwapsWithPosition } from "./swaps";
import { convertTokenAmount, getTokenSymbol } from "./tokenUtils";

const ZERO = GD.ZERO;
const ZERO_ADDRESS = ETH_ADDRESS;

/** Ctx with the pool template instances created by the current log (block.ts defers their events). */
export type PoolCtx = PosCtx & Pick<Ctx, "spawnedPools">;

export async function v2ProtocolFor(ctx: PosCtx, pool: string): Promise<string> {
  const venue = await ctx.cache.get(V2PoolVenue, pool);
  return venue != null ? venue.protocol : PROTOCOL_VELODROME_V2;
}

export async function getVeloV2PositionId(ctx: PosCtx, user: string, pool: string): Promise<string> {
  return utf8Hex(`${user}-${await v2ProtocolFor(ctx, pool)}-${pool}`);
}

async function setV2PoolFee(ctx: PosCtx, pp: ProtocolPosition, pool: string, at: At): Promise<void> {
  const kind = await v2PoolKind(ctx, pool, at);
  if (kind !== "unknown") pp.fee = kind === "stable" ? V2_STABLE_FEE_BPS : V2_VOLATILE_FEE_BPS;
}

/**
 * resolveV2Gauge: aero-v2 reads AeroGauge on every refresh (no gauge() on
 * the pool); legacy pools ask the Voter once and cache it on rewardsContract.
 * A Voter revert or a zero gauge is not cached.
 */
async function resolveV2Gauge(ctx: PosCtx, pool: string, pp: ProtocolPosition, at: At): Promise<string> {
  if (pp.protocol === PROTOCOL_AERO_V2) {
    const row = await ctx.cache.get(AeroGauge, pool);
    if (row == null) return ZERO_ADDRESS;
    pp.rewardsContract = row.gauge;
    return row.gauge;
  }
  if (pp.rewardsContract) return pp.rewardsContract;
  const gauge = await ctx.chain.call(VELO_VOTER, at.blockNumber, voter.gauges, { pool });
  if (gauge == null) {
    ctx.log.warn(`V2 gauge resolution: Voter.gauges() reverted for pool ${pool} — treating as no gauge this refresh (not cached).`);
    return ZERO_ADDRESS;
  }
  const value = gauge.toLowerCase();
  if (value === ZERO_ADDRESS) return ZERO_ADDRESS;
  pp.rewardsContract = value;
  return value;
}

/** refreshVeloV2Position: current amounts from the LP share (in the safe plus staked), and gauge rewards. */
export async function refreshVeloV2Position(
  ctx: PosCtx,
  user: string,
  pool: string,
  at: At,
  txHash: string,
  updatePortfolio = true,
): Promise<void> {
  const positionId = await getVeloV2PositionId(ctx, user, pool);
  const service = await ctx.cache.get(Service, user);
  if (service == null) return;

  let pp = await ctx.cache.get(ProtocolPosition, positionId);
  if (pp == null) {
    pp = new ProtocolPosition({ id: positionId });
    initializePositionIncome(pp);
    pp.agent = user;
    pp.service = service;
    pp.protocol = await v2ProtocolFor(ctx, pool);
    pp.pool = pool;
    pp.isActive = true;
    pp.tokenId = 0n;
    await addServicePosition(ctx, user, positionId);
    const t0 = await ctx.chain.call(pool, at.blockNumber, v2Pool.token0, {});
    const t1 = await ctx.chain.call(pool, at.blockNumber, v2Pool.token1, {});
    if (t0 == null || t1 == null) return;
    pp.token0 = t0.toLowerCase();
    pp.token1 = t1.toLowerCase();
    pp.token0Symbol = getTokenSymbol(pp.token0, ctx.log);
    pp.token1Symbol = getTokenSymbol(pp.token1, ctx.log);
    await setV2PoolFee(ctx, pp, pool, at);
    pp.usdCurrent = ZERO.toStore();
    pp.amount0 = ZERO.toStore();
    pp.amount0USD = ZERO.toStore();
    pp.amount1 = ZERO.toStore();
    pp.amount1USD = ZERO.toStore();
    pp.liquidity = 0n;
    pp.entryTxHash = txHash;
    pp.entryTimestamp = at.blockTimestamp;
    pp.entryAmount0 = ZERO.toStore();
    pp.entryAmount0USD = ZERO.toStore();
    pp.entryAmount1 = ZERO.toStore();
    pp.entryAmount1USD = ZERO.toStore();
    pp.entryAmountUSD = ZERO.toStore();
    pp.tickLower = 0;
    pp.tickUpper = 0;
    pp.tickSpacing = 0;
    pp.totalCostsUSD = ZERO.toStore();
    pp.swapSlippageUSD = ZERO.toStore();
    pp.investmentUSD = ZERO.toStore();
    pp.grossGainUSD = ZERO.toStore();
    pp.netGainUSD = ZERO.toStore();
    pp.positionROI = ZERO.toStore();
  }

  const balance = await ctx.chain.call(pool, at.blockNumber, v2Pool.balanceOf, { account: user });
  const totalSupply = await ctx.chain.call(pool, at.blockNumber, v2Pool.totalSupply, {});
  const reserves = await ctx.chain.call(pool, at.blockNumber, v2Pool.getReserves, {});
  if (balance == null || totalSupply == null || reserves == null) return;

  // Gauge-staked LP still belongs to the position and earns rewards.
  let staked = 0n;
  let rewardAmount = ZERO;
  let rewardUSD = ZERO;
  const gauge = await resolveV2Gauge(ctx, pool, pp, at);
  if (gauge !== ZERO_ADDRESS) {
    const stakedRes = await ctx.chain.call(gauge, at.blockNumber, v2Gauge.balanceOf, { account: user });
    if (stakedRes != null) {
      staked = stakedRes;
    } else {
      ctx.log.warn(`AERO rewards (V2): gauge.balanceOf() reverted for staked position (pool ${pool}, gauge ${gauge}, account ${user}) — staked LP read as 0.`);
    }
    const earned = await ctx.chain.call(gauge, at.blockNumber, v2Gauge.earned, { account: user });
    if (earned != null) {
      const rewardToken = rewardTokenFor(pp.protocol);
      rewardAmount = convertTokenAmount(earned, rewardToken, ctx.log);
      rewardUSD = rewardAmount.times(await getTokenPriceUSD(ctx, rewardToken, at));
    } else {
      ctx.log.warn(`AERO rewards (V2): gauge.earned() reverted for staked position (pool ${pool}, gauge ${gauge}, account ${user}) — recording 0 reward.`);
    }
  }

  const userBalance = balance + staked;
  if (userBalance === 0n) {
    pp.isActive = false;
    if (pp.exitAmountUSD != null && d(pp.exitAmountUSD).gt(ZERO)) calculatePositionROI(ctx, pp);
    pp.usdCurrent = ZERO.toStore();
    pp.usdCurrentWithRewards = ZERO.toStore();
    pp.claimableReward = ZERO.toStore();
    pp.claimableRewardUSD = ZERO.toStore();
    pp.amount0 = ZERO.toStore();
    pp.amount0USD = ZERO.toStore();
    pp.amount1 = ZERO.toStore();
    pp.amount1USD = ZERO.toStore();
    pp.liquidity = 0n;
  } else {
    const share = GD.fromBigInt(userBalance).div(GD.fromBigInt(totalSupply));
    const reserve0 = convertTokenAmount(reserves._reserve0, pp.token0!, ctx.log);
    const reserve1 = convertTokenAmount(reserves._reserve1, pp.token1!, ctx.log);
    const amount0 = reserve0.times(share);
    const amount1 = reserve1.times(share);
    const price0 = await getTokenPriceUSD(ctx, pp.token0!, at);
    const price1 = await getTokenPriceUSD(ctx, pp.token1!, at);
    const usd0 = price0.times(amount0);
    const usd1 = price1.times(amount1);
    const usd = usd0.plus(usd1);
    pp.amount0 = amount0.toStore();
    pp.amount1 = amount1.toStore();
    pp.amount0USD = usd0.toStore();
    pp.amount1USD = usd1.toStore();
    pp.usdCurrent = usd.toStore();
    pp.claimableReward = rewardAmount.toStore();
    pp.claimableRewardUSD = rewardUSD.toStore();
    pp.usdCurrentWithRewards = usd.plus(rewardUSD).toStore();
    pp.liquidity = userBalance;
    pp.isActive = true;
    // Entry not recorded yet (the Mint may not have run): current amounts stand in.
    if (d(pp.entryAmountUSD).equals(ZERO)) {
      pp.entryTxHash = txHash;
      pp.entryTimestamp = at.blockTimestamp;
      pp.entryAmount0 = pp.amount0;
      pp.entryAmount0USD = pp.amount0USD;
      pp.entryAmount1 = pp.amount1;
      pp.entryAmount1USD = pp.amount1USD;
      pp.entryAmountUSD = pp.usdCurrent;
      let slippage = await associateSwapsWithPosition(ctx, user, at);
      if (slippage.lt(ZERO)) slippage = ZERO;
      pp.swapSlippageUSD = slippage.toStore();
      pp.totalCostsUSD = slippage.toStore();
      pp.investmentUSD = usd.plus(slippage).toStore();
    }
  }
  savePosition(ctx, pp);
  if (updatePortfolio) await calculatePortfolioMetrics(ctx, user, at);
}

/** refreshVeloV2PositionWithBurnAmounts: the Burn's amounts are the exit. */
async function refreshVeloV2PositionWithBurnAmounts(
  ctx: PosCtx,
  user: string,
  pool: string,
  at: At,
  amount0: bigint,
  amount1: bigint,
  txHash: string,
): Promise<void> {
  const positionId = await getVeloV2PositionId(ctx, user, pool);
  if ((await ctx.cache.get(Service, user)) == null) return;
  const pp = await ctx.cache.get(ProtocolPosition, positionId);
  if (pp == null) return;
  const human0 = convertTokenAmount(amount0, pp.token0!, ctx.log);
  const human1 = convertTokenAmount(amount1, pp.token1!, ctx.log);
  const price0 = await getTokenPriceUSD(ctx, pp.token0!, at);
  const price1 = await getTokenPriceUSD(ctx, pp.token1!, at);
  const usd0 = price0.times(human0);
  const usd1 = price1.times(human1);
  // The cycle's Burns add up (startNewCycle clears the exit).
  pp.exitTxHash = txHash;
  pp.exitTimestamp = at.blockTimestamp;
  addToExit(pp, human0, usd0, human1, usd1);
  calculatePositionROI(ctx, pp);
  savePosition(ctx, pp);
  await refreshVeloV2Position(ctx, user, pool, at, txHash);
}

// --- veloV2Pool.ts (VeloV2Pool and AeroV2Pool templates) ----------------------

const pendingId = (txHash: string, pool: string) => `${txHash}-${pool}`;

/** startNewCycle: restarts a reused v2 row as a new one (initializePositionCosts saves it). */
function startNewCycle(ctx: PosCtx, pp: ProtocolPosition, meta: EventMeta): void {
  initializePositionIncome(pp);
  pp.exitTxHash = null;
  pp.exitTimestamp = null;
  pp.exitAmount0 = null;
  pp.exitAmount0USD = null;
  pp.exitAmount1 = null;
  pp.exitAmount1USD = null;
  pp.exitAmountUSD = null;
  pp.entryTxHash = meta.txHash;
  pp.entryTimestamp = meta.blockTimestamp;
  pp.entryAmount0 = ZERO.toStore();
  pp.entryAmount0USD = ZERO.toStore();
  pp.entryAmount1 = ZERO.toStore();
  pp.entryAmount1USD = ZERO.toStore();
  pp.entryAmountUSD = ZERO.toStore();
  initializePositionCosts(ctx, pp);
}

/** handleVeloV2Transfer: LP Transfer; a mint to a service safe opens (or reopens) its position. */
export async function handleVeloV2Transfer(ctx: PosCtx, meta: EventMeta, e: { from: string; to: string; value: bigint }): Promise<void> {
  const pool = meta.address;
  if (e.from === ZERO_ADDRESS) {
    if ((await ctx.cache.get(Service, e.to)) == null) return;
    const positionId = await getVeloV2PositionId(ctx, e.to, pool);
    const existing = await ctx.cache.get(ProtocolPosition, positionId);
    const startsEntry = existing == null || !existing.isActive;
    if (existing != null && !existing.isActive) startNewCycle(ctx, existing, meta);
    await refreshVeloV2Position(ctx, e.to, pool, meta, meta.txHash);
    ctx.cache.set(
      PendingMintPosition,
      new PendingMintPosition({
        id: pendingId(meta.txHash, pool),
        txHash: meta.txHash,
        poolAddress: pool,
        positionId: await getVeloV2PositionId(ctx, e.to, pool),
        recipient: e.to,
        startsEntry,
      }),
    );
    return;
  }
  if (e.to === ZERO_ADDRESS) {
    await refreshVeloV2Position(ctx, e.from, pool, meta, meta.txHash);
    return;
  }
  await refreshVeloV2Position(ctx, e.from, pool, meta, meta.txHash);
  await refreshVeloV2Position(ctx, e.to, pool, meta, meta.txHash);
}

/** handleVeloV2Mint (3 args) and handleAeroV2Mint (4 args): the Mint after the LP mint sets the entry. */
export async function handleV2Mint(ctx: PosCtx, meta: EventMeta, e: { amount0: bigint; amount1: bigint }): Promise<void> {
  const id = pendingId(meta.txHash, meta.address);
  const pending = await ctx.cache.get(PendingMintPosition, id);
  if (pending == null) return;
  ctx.cache.remove(PendingMintPosition, id);
  if ((await ctx.cache.get(Service, pending.recipient)) == null) return;
  const position = await ctx.cache.get(ProtocolPosition, pending.positionId);
  if (position == null) return;
  const human0 = convertTokenAmount(e.amount0, position.token0!, ctx.log);
  const human1 = convertTokenAmount(e.amount1, position.token1!, ctx.log);
  const price0 = await getTokenPriceUSD(ctx, position.token0!, meta);
  const price1 = await getTokenPriceUSD(ctx, position.token1!, meta);
  const usd0 = price0.times(human0);
  const usd1 = price1.times(human1);
  const total = usd0.plus(usd1);
  if (pending.startsEntry) {
    position.entryAmount0 = human0.toStore();
    position.entryAmount0USD = usd0.toStore();
    position.entryAmount1 = human1.toStore();
    position.entryAmount1USD = usd1.toStore();
    position.entryAmountUSD = total.toStore();
  } else {
    position.entryAmount0 = d(position.entryAmount0).plus(human0).toStore();
    position.entryAmount0USD = d(position.entryAmount0USD).plus(usd0).toStore();
    position.entryAmount1 = d(position.entryAmount1).plus(human1).toStore();
    position.entryAmount1USD = d(position.entryAmount1USD).plus(usd1).toStore();
    position.entryAmountUSD = d(position.entryAmountUSD).plus(total).toStore();
  }
  position.investmentUSD = d(position.entryAmountUSD).plus(d(position.totalCostsUSD)).toStore();
  savePosition(ctx, position);
  await refreshVeloV2Position(ctx, pending.recipient, meta.address, meta, meta.txHash);
}

/** handleVeloV2Burn: the recipient's position, else the sender's. */
export async function handleVeloV2Burn(
  ctx: PosCtx,
  meta: EventMeta,
  e: { sender: string; to: string; amount0: bigint; amount1: bigint },
): Promise<void> {
  for (const user of [e.to, e.sender]) {
    if ((await ctx.cache.get(Service, user)) == null) continue;
    await refreshVeloV2PositionWithBurnAmounts(ctx, user, meta.address, meta, e.amount0, e.amount1, meta.txHash);
    return;
  }
}

// --- discovery: veloV2Bootstrap.ts, veloV2Factory.ts, aeroGaugeManager.ts -------

/** `VeloV2Pool.create(pool)` once per address (graph-node drops a second instance). */
async function createVeloV2Pool(ctx: PoolCtx, pool: string, at: At): Promise<void> {
  if ((await ctx.cache.get(VeloV2PoolDataSource, pool)) != null) return;
  ctx.cache.set(VeloV2PoolDataSource, new VeloV2PoolDataSource({ id: pool, createdAtBlock: at.blockNumber }));
  ctx.spawnedPools.push(pool);
}

/**
 * handleVeloV2Bootstrap (the `once` block handler at the start block): every
 * whitelisted stable (type 0) or volatile (type -1) pool LpSugar lists, paged
 * by 500 up to the v2 factory's allPoolsLength().
 */
export async function handleVeloV2Bootstrap(ctx: PoolCtx, at: At): Promise<void> {
  const total = await ctx.chain.call(VELO_V2_FACTORY, at.blockNumber, poolFactory.allPoolsLength, {});
  if (total == null) {
    ctx.log.error("VELO V2: PoolFactory.allPoolsLength() reverted - bootstrap aborted");
    return;
  }
  const limit = 500n;
  let found = 0;
  for (let offset = 0n; offset < total; offset += limit) {
    const pools = await ctx.chain.call(VELO_V2_SUGAR, at.blockNumber, sugar.forSwaps, { _limit: limit, _offset: offset });
    if (pools == null) {
      ctx.log.error(`VELO V2: Sugar forSwaps call reverted at offset ${offset}`);
      break;
    }
    for (const p of pools) {
      const token0 = p.token0.toLowerCase();
      const token1 = p.token1.toLowerCase();
      if ((p.type === 0 || p.type === -1) && isPoolRelevant(token0, token1)) {
        await createVeloV2Pool(ctx, p.lp.toLowerCase(), at);
        found++;
      }
    }
  }
  ctx.log.info(`VELO V2: Discovery complete - ${found} whitelisted pools (${total} factory pool indices scanned)`);
}

/** handleVeloV2PoolCreated (Aerodrome v2 PoolFactory): whitelisted pairs only. */
export async function handleVeloV2PoolCreated(ctx: PoolCtx, meta: EventMeta, e: { token0: string; token1: string; pool: string }): Promise<void> {
  if (!isPoolRelevant(e.token0, e.token1)) return;
  await createVeloV2Pool(ctx, e.pool, meta);
}

/** handleAeroV2PoolCreated (both Aero v2 factories): whitelisted pairs get a venue row and an AeroV2Pool template. */
export async function handleAeroV2PoolCreated(ctx: PoolCtx, meta: EventMeta, e: { token0: string; token1: string; pool: string }): Promise<void> {
  if (!isPoolRelevant(e.token0, e.token1)) return;
  // V2PoolVenue is immutable and its row doubles as the template instance; a repeat is dropped.
  if ((await ctx.cache.get(V2PoolVenue, e.pool)) != null) return;
  ctx.cache.set(V2PoolVenue, new V2PoolVenue({ id: e.pool, protocol: PROTOCOL_AERO_V2, stable: meta.address === AERO_V2_STABLE_FACTORY }));
  ctx.spawnedPools.push(e.pool);
}

/** handleAeroGaugeCreated: pool -> gauge; a later GaugeCreated for the same pool replaces it. */
export async function handleAeroGaugeCreated(ctx: PosCtx, meta: EventMeta, e: { target: string; gauge: string }): Promise<void> {
  const row = (await ctx.cache.get(AeroGauge, e.target)) ?? new AeroGauge({ id: e.target });
  row.gauge = e.gauge;
  row.createdAtBlock = meta.blockNumber;
  ctx.cache.set(AeroGauge, row);
}
