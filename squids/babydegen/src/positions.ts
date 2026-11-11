// Position bookkeeping shared by the CL and v2 paths, ported from studio
// babydegen-base src/roiCalculation.ts and src/positionIncome.ts as of #175:
// NFT mappings, collected fees (principal excluded), claimed gauge rewards,
// full exits and position ROI.
//
// "save" is `ctx.cache.set`. The cache hands out one live object per row
// where graph-node's `load` hands out copies; the ported handlers never keep
// a copy across another handler's save of the same row, and every early
// return happens before the first mutation it would lose, so both give the
// same rows.

import type { EventMeta } from "@olas/squid-shared";
import {
  PROTOCOL_AERO_CL,
  PROTOCOL_AERO_V2,
  PROTOCOL_VELODROME_V3,
  rewardTokenFor,
} from "./constants";
import { GD, gd } from "./decimal";
import type { Cache } from "./entityCache";
import type { Logger, ReceiptLog } from "./handlers";
import { utf8Hex } from "./ids";
import {
  ClaimableRewardBeforeBlock,
  CreditedRewardClaim,
  NFTPositionMapping,
  ProtocolPosition,
  Service,
  UncollectedPrincipal,
} from "./model";
import { getTokenPriceUSD, type At } from "./pricing";
import type { ChainReader } from "./rpc";
import { addressAt, uintAt } from "./safeCalldata";
import { convertTokenAmount } from "./tokenUtils";

export interface PosCtx {
  cache: Cache;
  chain: ChainReader;
  log: Logger;
}

const ZERO = GD.ZERO;
const HUNDRED = gd("100");
export const d = (x: { toFixed(): string }) => GD.fromStore(x as never);
const dn = (x: { toFixed(): string } | null | undefined): GD | null => (x == null ? null : d(x));

/** Withdraw(address indexed user, uint256 indexed tokenId, uint128 indexed liquidityToStake): Slipstream CL gauge. */
const CL_GAUGE_WITHDRAW_TOPIC = "0x8903a5b5d08a841e7f68438387f1da20c84dea756379ed37e633ff3854b99b84";
/** EmissionsClaimed(address indexed _account, uint256 indexed _tokenId, address indexed _recipient, uint256): Aero CL gauge. */
const EMISSIONS_CLAIMED_TOPIC = "0x7b6bd720815adbeaaaed4fc759e1a535705901f33709fbb33e62ee9a89427bb1";

const bytesOf = (hex: string) => Buffer.from(hex.slice(2), "hex");

export const savePosition = (ctx: PosCtx, p: ProtocolPosition) => ctx.cache.set(ProtocolPosition, p);

// --- ids ----------------------------------------------------------------------

export const nftPositionMappingId = (protocol: string, tokenId: bigint) => utf8Hex(`${protocol}-${tokenId}`);

/** `Bytes.fromUTF8(agent.toHex() + "-" + protocol + "-" + tokenId)`. */
export const clPositionId = (agent: string, tokenId: bigint, protocol: string) => utf8Hex(`${agent}-${protocol}-${tokenId}`);

/** `txHash.concatI32(logIndex)`: the index as 4 little-endian bytes. */
export function creditedClaimId(txHash: string, logIndex: number): string {
  const b = Buffer.alloc(4);
  b.writeInt32LE(logIndex);
  return txHash + b.toString("hex");
}

// --- roiCalculation.ts ----------------------------------------------------------

function positionGrossGain(p: ProtocolPosition): GD {
  const exit = dn(p.exitAmountUSD) ?? ZERO;
  return exit.plus(d(p.collectedFeesUSD)).plus(d(p.claimedRewardsUSD));
}

/** calculatePositionROI: closed positions with an exit only; saves when it sets the fields. */
export function calculatePositionROI(ctx: PosCtx, p: ProtocolPosition): GD {
  if (p.isActive || p.exitAmountUSD == null) return ZERO;
  const investment = d(p.entryAmountUSD).plus(d(p.totalCostsUSD));
  if (!investment.gt(ZERO)) return ZERO;
  const gross = positionGrossGain(p);
  const net = gross.minus(investment);
  const roi = net.div(investment).times(HUNDRED);
  p.investmentUSD = investment.toStore();
  p.grossGainUSD = gross.toStore();
  p.netGainUSD = net.toStore();
  p.positionROI = roi.toStore();
  savePosition(ctx, p);
  return roi;
}

export function saveWithROI(ctx: PosCtx, p: ProtocolPosition): void {
  calculatePositionROI(ctx, p);
  savePosition(ctx, p);
}

/** initializePositionCosts (it saves the row, as in the subgraph). */
export function initializePositionCosts(ctx: PosCtx, p: ProtocolPosition): void {
  p.totalCostsUSD = ZERO.toStore();
  p.swapSlippageUSD = ZERO.toStore();
  p.investmentUSD = p.entryAmountUSD;
  p.grossGainUSD = ZERO.toStore();
  p.netGainUSD = ZERO.toStore();
  p.positionROI = ZERO.toStore();
  savePosition(ctx, p);
}

export function initializePositionIncome(p: ProtocolPosition): void {
  p.collectedFees0 = ZERO.toStore();
  p.collectedFees1 = ZERO.toStore();
  p.collectedFeesUSD = ZERO.toStore();
  p.claimedRewards = ZERO.toStore();
  p.claimedRewardsUSD = ZERO.toStore();
}

/** Adds a new position id to its Service's positionIds (the CL and v2 create paths). */
export async function addServicePosition(ctx: PosCtx, agent: string, positionId: string): Promise<void> {
  const service = await ctx.cache.get(Service, agent);
  if (service == null || service.positionIds.includes(positionId)) return;
  service.positionIds = [...service.positionIds, positionId];
  ctx.cache.set(Service, service);
}

// --- NFT mappings ---------------------------------------------------------------

/** mapNFTPosition: points the NFT at its tracked row (the CL mint is the only writer). */
export async function mapNFTPosition(ctx: PosCtx, protocol: string, tokenId: bigint, positionId: string): Promise<void> {
  const id = nftPositionMappingId(protocol, tokenId);
  let mapping = await ctx.cache.get(NFTPositionMapping, id);
  if (mapping == null) {
    mapping = new NFTPositionMapping({ id, protocol });
  } else if (mapping.positionId === positionId) {
    return;
  }
  mapping.positionId = positionId;
  ctx.cache.set(NFTPositionMapping, mapping);
}

export async function loadMappedPosition(ctx: PosCtx, protocol: string, tokenId: bigint): Promise<ProtocolPosition | undefined> {
  const mapping = await ctx.cache.get(NFTPositionMapping, nftPositionMappingId(protocol, tokenId));
  return mapping == null ? undefined : ctx.cache.get(ProtocolPosition, mapping.positionId);
}

// --- collected fees -------------------------------------------------------------

/** DecreaseLiquidity credits principal to tokensOwed; the next Collect pays it out with the fees. */
export async function recordReleasedPrincipal(ctx: PosCtx, protocol: string, tokenId: bigint, amount0: bigint, amount1: bigint): Promise<void> {
  const id = nftPositionMappingId(protocol, tokenId);
  const owed = (await ctx.cache.get(UncollectedPrincipal, id)) ?? new UncollectedPrincipal({ id, amount0: 0n, amount1: 0n });
  owed.amount0 += amount0;
  owed.amount1 += amount1;
  ctx.cache.set(UncollectedPrincipal, owed);
}

const minBig = (a: bigint, b: bigint) => (a < b ? a : b);

export async function recordCollectedFees(
  ctx: PosCtx,
  p: ProtocolPosition,
  protocol: string,
  recipient: string,
  amount0: bigint,
  amount1: bigint,
  at: At,
): Promise<void> {
  // Every Collect pays out owed principal first, wherever it is sent.
  let fee0 = amount0;
  let fee1 = amount1;
  const owed = await ctx.cache.get(UncollectedPrincipal, nftPositionMappingId(protocol, p.tokenId));
  if (owed != null) {
    const principal0 = minBig(amount0, owed.amount0);
    const principal1 = minBig(amount1, owed.amount1);
    fee0 = amount0 - principal0;
    fee1 = amount1 - principal1;
    owed.amount0 -= principal0;
    owed.amount1 -= principal1;
    ctx.cache.set(UncollectedPrincipal, owed);
  }
  if (recipient !== p.agent) {
    ctx.log.info(`FEES: ${protocol} tokenId ${p.tokenId} Collect to ${recipient}, not safe ${p.agent} — no fee booked`);
    return;
  }
  if (p.token0 == null || p.token1 == null) {
    ctx.log.warn(`FEES: ${protocol} tokenId ${p.tokenId} position ${p.id} has no token0/token1 — Collect to safe ${recipient} not booked`);
    return;
  }
  const fee0Human = convertTokenAmount(fee0, p.token0, ctx.log);
  const fee1Human = convertTokenAmount(fee1, p.token1, ctx.log);
  const usd0 = fee0Human.times(await getTokenPriceUSD(ctx, p.token0, at));
  const feeUSD = usd0.plus(fee1Human.times(await getTokenPriceUSD(ctx, p.token1, at)));
  p.collectedFees0 = d(p.collectedFees0).plus(fee0Human).toStore();
  p.collectedFees1 = d(p.collectedFees1).plus(fee1Human).toStore();
  p.collectedFeesUSD = d(p.collectedFeesUSD).plus(feeUSD).toStore();
  saveWithROI(ctx, p);
}

// --- claimed rewards ------------------------------------------------------------

const currentClaimableReward = (p: ProtocolPosition) => dn(p.claimableReward) ?? ZERO;

/** A claim's own block refreshes earned() to 0, so keep the value the block started with. */
export async function recordClaimableRewardBeforeBlock(ctx: PosCtx, p: ProtocolPosition, at: At): Promise<void> {
  const before = await ctx.cache.get(ClaimableRewardBeforeBlock, p.id);
  if (before != null && before.block === at.blockNumber) return;
  const row = before ?? new ClaimableRewardBeforeBlock({ id: p.id });
  row.block = at.blockNumber;
  row.claimableReward = currentClaimableReward(p).toStore();
  ctx.cache.set(ClaimableRewardBeforeBlock, row);
}

async function claimableRewardBeforeBlock(ctx: PosCtx, p: ProtocolPosition, at: At): Promise<GD> {
  const before = await ctx.cache.get(ClaimableRewardBeforeBlock, p.id);
  if (before != null && before.block === at.blockNumber) return d(before.claimableReward);
  return currentClaimableReward(p);
}

function creditReward(ctx: PosCtx, p: ProtocolPosition, amount: GD, priceUSD: GD): void {
  p.claimedRewards = d(p.claimedRewards).plus(amount).toStore();
  p.claimedRewardsUSD = d(p.claimedRewardsUSD).plus(amount.times(priceUSD)).toStore();
  saveWithROI(ctx, p);
}

/** Split by weight; equally when every weight is 0. */
function splitReward(ctx: PosCtx, shares: { p: ProtocolPosition; weight: GD }[], amount: GD, priceUSD: GD): void {
  let total = ZERO;
  for (const s of shares) total = total.plus(s.weight);
  const equal = total.equals(ZERO);
  if (equal) total = gd(String(shares.length));
  for (const s of shares) {
    const weight = equal ? gd("1") : s.weight;
    creditReward(ctx, s.p, amount.times(weight).div(total), priceUSD);
  }
}

function lastClosedV2Position(positions: ProtocolPosition[]): ProtocolPosition | null {
  let last: ProtocolPosition | null = null;
  for (const p of positions) {
    if (p.isActive || p.protocol === PROTOCOL_VELODROME_V3 || p.exitTimestamp == null) continue;
    if (last === null || p.exitTimestamp > last.exitTimestamp!) last = p;
  }
  return last;
}

const isEmittedByGauge = (p: ProtocolPosition, emitter: string) => p.rewardsContract != null && p.rewardsContract === emitter;

/**
 * Aero CL: each EmissionsClaimed to the Safe names its tokenId and amount; a
 * Transfer pays the claims its amount covers, in log order.
 */
async function attributeEmissionsClaims(
  ctx: PosCtx,
  meta: EventMeta,
  safe: string,
  amount: bigint,
  receipt: ReceiptLog[],
): Promise<boolean> {
  const token = meta.address;
  if (token !== rewardTokenFor(PROTOCOL_AERO_CL)) return false;
  let paid = 0n;
  let credited = false;
  for (const log of receipt) {
    const t = log.topics;
    if (t.length < 4 || t[0] !== EMISSIONS_CLAIMED_TOPIC || addressAt(bytesOf(t[3]), 0) !== safe) continue;
    const claimAmount = uintAt(bytesOf(log.data), 0);
    const claimId = creditedClaimId(meta.txHash, log.logIndex);
    if ((await ctx.cache.get(CreditedRewardClaim, claimId)) != null) continue;
    const tokenId = uintAt(bytesOf(t[2]), 0);
    if (paid + claimAmount > amount) {
      ctx.log.warn(`REWARDS: tx ${meta.txHash} — EmissionsClaimed for tokenId ${tokenId} (${claimAmount}) is not covered by the Transfer of ${amount} to safe ${safe}`);
      continue;
    }
    const p = await loadMappedPosition(ctx, PROTOCOL_AERO_CL, tokenId);
    if (p == null || p.agent !== safe || !isEmittedByGauge(p, log.address)) {
      ctx.log.warn(`REWARDS: tx ${meta.txHash} — EmissionsClaimed to safe ${safe} names tokenId ${tokenId}, which is not one of its aero-cl positions on the emitting gauge`);
      continue;
    }
    ctx.cache.set(CreditedRewardClaim, new CreditedRewardClaim({ id: claimId }));
    const human = convertTokenAmount(claimAmount, token, ctx.log);
    creditReward(ctx, p, human, await getTokenPriceUSD(ctx, token, meta));
    paid += claimAmount;
    credited = true;
  }
  if (credited && paid < amount) {
    ctx.log.warn(`REWARDS: tx ${meta.txHash} — ${amount - paid} of ${amount} paid to safe ${safe} not attributed to a tokenId`);
  }
  return credited;
}

/**
 * Aero v2 gauges pay through LeafEmissionsHandler (Optimism) or by mint (Base), not from
 * the gauge, so the Transfer's `from` never matches rewardsContract and the claim is not
 * attributed to a position yet: say so rather than drop the reward silently (as studio).
 */
async function warnIfAeroV2Reward(ctx: PosCtx, meta: EventMeta, safe: string, service: Service): Promise<void> {
  if (meta.address !== rewardTokenFor(PROTOCOL_AERO_V2)) return;
  for (const id of service.positionIds) {
    const p = await ctx.cache.get(ProtocolPosition, id);
    if (p != null && p.protocol === PROTOCOL_AERO_V2) {
      ctx.log.warn(`REWARDS: tx ${meta.txHash} — Aero reward Transfer to safe ${safe}, which holds or held aero-v2 positions, is not attributed to a position`);
      return;
    }
  }
}

/** The tokenId of the first Withdraw(user = Safe, tokenId, …) the gauge emits after the reward Transfer. */
function nextGaugeWithdrawTokenId(meta: EventMeta, gauge: string, safe: string, receipt: ReceiptLog[]): bigint | null {
  for (const log of receipt) {
    const t = log.topics;
    if (log.logIndex <= meta.logIndex || log.address !== gauge || t.length < 3 || t[0] !== CL_GAUGE_WITHDRAW_TOPIC) continue;
    if (addressAt(bytesOf(t[1]), 0) !== safe) continue;
    return uintAt(bytesOf(t[2]), 0);
  }
  return null;
}

/**
 * attributeRewardTransfer: credits a reward token Transfer into a Safe to the
 * position(s) that earned it. meta.address is the token. False when the
 * Transfer is not a reward claim or has no receipt.
 */
export async function attributeRewardTransfer(
  ctx: PosCtx,
  meta: EventMeta,
  from: string,
  safe: string,
  amount: bigint,
  receipt: ReceiptLog[] | null,
): Promise<boolean> {
  if (receipt == null) {
    ctx.log.error(`REWARDS: no receipt for tx ${meta.txHash} — Transfer to safe ${safe} not checked for a reward claim`);
    return false;
  }
  if (await attributeEmissionsClaims(ctx, meta, safe, amount, receipt)) return true;

  const service = await ctx.cache.get(Service, safe);
  if (service == null) return false;
  const onGauge: ProtocolPosition[] = [];
  for (const id of service.positionIds) {
    const p = await ctx.cache.get(ProtocolPosition, id);
    if (p != null && isEmittedByGauge(p, from)) onGauge.push(p);
  }
  if (onGauge.length === 0) {
    await warnIfAeroV2Reward(ctx, meta, safe, service);
    return false;
  }

  const token = meta.address;
  const rewardAmount = convertTokenAmount(amount, token, ctx.log);
  const priceUSD = await getTokenPriceUSD(ctx, token, meta);

  const tokenId = nextGaugeWithdrawTokenId(meta, from, safe, receipt);
  if (tokenId !== null) {
    for (const p of onGauge) {
      if (p.protocol === PROTOCOL_VELODROME_V3 && p.tokenId === tokenId) {
        creditReward(ctx, p, rewardAmount, priceUSD);
        return true;
      }
    }
    ctx.log.warn(`REWARDS: tx ${meta.txHash} - gauge ${from} Withdraw names tokenId ${tokenId}, not a tracked position of safe ${safe}; reward not attributed`);
    return true;
  }

  // No Withdraw after the reward: a CL claim splits by what each position had
  // earned before the claim, a v2 gauge by liquidity.
  const active: ProtocolPosition[] = [];
  const earnedBefore: GD[] = [];
  let hasCL = false;
  for (const p of onGauge) {
    if (!p.isActive) continue;
    active.push(p);
    earnedBefore.push(await claimableRewardBeforeBlock(ctx, p, meta));
    hasCL = hasCL || p.protocol === PROTOCOL_VELODROME_V3;
  }
  if (active.length === 0) {
    const closedV2 = lastClosedV2Position(onGauge);
    if (closedV2 !== null) {
      creditReward(ctx, closedV2, rewardAmount, priceUSD);
      return true;
    }
    ctx.log.warn(`REWARDS: no active position on gauge ${from} for safe ${safe} — reward in tx ${meta.txHash} not attributed`);
    return true;
  }
  const earnedTotal = earnedBefore.reduce((a, b) => a.plus(b), ZERO);
  const weights =
    hasCL && earnedTotal.gt(ZERO) ? earnedBefore : active.map((p) => (p.liquidity == null ? ZERO : GD.fromBigInt(p.liquidity)));
  splitReward(ctx, active.map((p, i) => ({ p, weight: weights[i] })), rewardAmount, priceUSD);
  return true;
}

// --- NFT position exits (CL) ----------------------------------------------------

/** A DecreaseLiquidity already recorded this position's exit in this block. */
export function exitClosedInBlock(p: ProtocolPosition, at: At): boolean {
  return !p.isActive && p.exitTimestamp != null && p.exitTimestamp === at.blockTimestamp && p.exitAmountUSD != null;
}

/** A decrease on a closed row is not this position's unless the row recorded its exit in this block. */
export function closedWithNoExitThisBlock(p: ProtocolPosition, at: At): boolean {
  return !p.isActive && !exitClosedInBlock(p, at);
}

/**
 * recordFullExit: closes the position on a full-exit DecreaseLiquidity, valued
 * from the event amounts; a second one in the same block adds to the exit.
 * False when the position has no tokens on record.
 */
export async function recordFullExit(
  ctx: PosCtx,
  p: ProtocolPosition,
  amount0: bigint,
  amount1: bigint,
  at: At,
  txHash: string,
): Promise<boolean> {
  if (p.token0 == null || p.token1 == null) return false;
  const exit0 = convertTokenAmount(amount0, p.token0, ctx.log);
  const exit1 = convertTokenAmount(amount1, p.token1, ctx.log);
  const usd0 = exit0.times(await getTokenPriceUSD(ctx, p.token0, at));
  const usd1 = exit1.times(await getTokenPriceUSD(ctx, p.token1, at));
  if (exitClosedInBlock(p, at)) {
    p.exitAmount0 = d(p.exitAmount0!).plus(exit0).toStore();
    p.exitAmount0USD = d(p.exitAmount0USD!).plus(usd0).toStore();
    p.exitAmount1 = d(p.exitAmount1!).plus(exit1).toStore();
    p.exitAmount1USD = d(p.exitAmount1USD!).plus(usd1).toStore();
    p.exitAmountUSD = d(p.exitAmountUSD!).plus(usd0.plus(usd1)).toStore();
  } else {
    p.exitAmount0 = exit0.toStore();
    p.exitAmount0USD = usd0.toStore();
    p.exitAmount1 = exit1.toStore();
    p.exitAmount1USD = usd1.toStore();
    p.exitAmountUSD = usd0.plus(usd1).toStore();
  }
  p.isActive = false;
  p.exitTxHash = txHash;
  p.exitTimestamp = at.blockTimestamp;
  p.amount0 = ZERO.toStore();
  p.amount1 = ZERO.toStore();
  p.amount0USD = ZERO.toStore();
  p.amount1USD = ZERO.toStore();
  p.usdCurrent = ZERO.toStore();
  p.usdCurrentWithRewards = ZERO.toStore();
  p.liquidity = 0n;
  calculatePositionROI(ctx, p);
  return true;
}
