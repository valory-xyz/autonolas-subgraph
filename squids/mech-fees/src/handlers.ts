// Event handlers, ported branch for branch from the subgraph's per-model
// mappings (native / nvm / token-olas / token-usdc share one shape) and
// src/utils.ts. Handlers take the cache interface, plain EventMeta, the
// tracker's model and decoded params, so tests run them without a database.
import { BigDecimal } from "@subsquid/big-decimal";
import { type EventMeta, type IEntityCache, logId } from "@olas/squid-shared";
import {
  DailyTotals,
  DrainEvent,
  DrainTotals,
  Global,
  Mech,
  MechDaily,
  MechModel,
  MechTransaction,
} from "./model";
import { FEE_IN, FEE_OUT, GLOBAL_ID, MODEL_NATIVE, MODEL_NVM, MODEL_OLAS, MODEL_USDC, type ChainConfig, type Model } from "./constants";
import { ZERO, dailyTotalsId, dayStart, mechDailyId, mechModelId, nvmTokenToCredits } from "./logic";
import type { Pricing } from "./pricing";

export interface Ctx {
  cache: IEntityCache;
  chain: ChainConfig;
  pricing: Pricing;
  log: { warn(msg: string): void; error(msg: string): void };
}

// --- get-or-init (subgraph utils.ts) ---------------------------------------

async function getGlobal(cache: IEntityCache): Promise<Global> {
  let g = await cache.get(Global, GLOBAL_ID);
  if (g == null) {
    g = new Global({
      id: GLOBAL_ID,
      totalFeesInUSD: ZERO,
      totalFeesOutUSD: ZERO,
      totalDrainedFeesUSD: ZERO,
      totalOlasBurnedRaw: ZERO,
      totalOlasBurnedUSD: ZERO,
    });
    cache.set(Global, g);
  }
  return g;
}

async function getOrInitMech(cache: IEntityCache, id: string): Promise<Mech> {
  let m = await cache.get(Mech, id);
  if (m == null) {
    m = new Mech({ id, totalFeesInUSD: ZERO, totalFeesOutUSD: ZERO, totalFeesInRaw: ZERO, totalFeesOutRaw: ZERO });
    cache.set(Mech, m);
  }
  return m;
}

async function getOrInitMechModel(cache: IEntityCache, mech: Mech, model: Model): Promise<MechModel> {
  const id = mechModelId(mech.id, model);
  let mm = await cache.get(MechModel, id);
  if (mm == null) {
    mm = new MechModel({ id, mech, model, totalFeesInUSD: ZERO, totalFeesOutUSD: ZERO, totalFeesInRaw: ZERO, totalFeesOutRaw: ZERO });
    cache.set(MechModel, mm);
  }
  return mm;
}

async function getOrInitDailyTotals(cache: IEntityCache, ts: bigint): Promise<DailyTotals> {
  const id = dailyTotalsId(ts);
  let d = await cache.get(DailyTotals, id);
  if (d == null) {
    d = new DailyTotals({ id, date: dayStart(ts), totalFeesInUSD: ZERO, totalFeesOutUSD: ZERO });
    cache.set(DailyTotals, d);
  }
  return d;
}

async function getOrInitMechDaily(cache: IEntityCache, mech: Mech, ts: bigint): Promise<MechDaily> {
  const id = mechDailyId(mech.id, ts);
  let md = await cache.get(MechDaily, id);
  if (md == null) {
    md = new MechDaily({ id, mech, date: dayStart(ts), feesInUSD: ZERO, feesOutUSD: ZERO, feesInRaw: ZERO, feesOutRaw: ZERO });
    cache.set(MechDaily, md);
  }
  return md;
}

async function getOrInitDrainTotals(cache: IEntityCache, model: Model): Promise<DrainTotals> {
  let dt = await cache.get(DrainTotals, model);
  if (dt == null) {
    dt = new DrainTotals({ id: model, model, totalDrainedRaw: ZERO, totalDrainedUSD: ZERO });
    cache.set(DrainTotals, dt);
  }
  return dt;
}

// --- the shared fee-in / fee-out bookkeeping --------------------------------

/**
 * The subgraph's fee-in sequence: Global, Mech, MechModel, DailyTotals,
 * MechDaily, then a MechTransaction (FEE_IN). Daily rows are only touched
 * for non-zero amounts (subgraph `if (amountUsd.le(0)) return`).
 */
async function recordFeeIn(
  ctx: Ctx,
  meta: EventMeta,
  model: Model,
  mechId: string,
  amountRaw: BigDecimal,
  amountUsd: BigDecimal,
  p: { deliveryRate: bigint; balance: bigint; rateDiff: bigint }
): Promise<void> {
  const { cache } = ctx;
  const g = await getGlobal(cache);
  g.totalFeesInUSD = g.totalFeesInUSD.plus(amountUsd);
  cache.set(Global, g);

  const mech = await getOrInitMech(cache, mechId);
  mech.totalFeesInUSD = mech.totalFeesInUSD.plus(amountUsd);
  mech.totalFeesInRaw = mech.totalFeesInRaw.plus(amountRaw);
  cache.set(Mech, mech);

  const mm = await getOrInitMechModel(cache, mech, model);
  mm.totalFeesInUSD = mm.totalFeesInUSD.plus(amountUsd);
  mm.totalFeesInRaw = mm.totalFeesInRaw.plus(amountRaw);
  cache.set(MechModel, mm);

  if (amountUsd.gt(0)) {
    const d = await getOrInitDailyTotals(cache, meta.blockTimestamp);
    d.totalFeesInUSD = d.totalFeesInUSD.plus(amountUsd);
    cache.set(DailyTotals, d);
  }
  if (amountUsd.gt(0) || amountRaw.gt(0)) {
    const md = await getOrInitMechDaily(cache, mech, meta.blockTimestamp);
    md.feesInUSD = md.feesInUSD.plus(amountUsd);
    md.feesInRaw = md.feesInRaw.plus(amountRaw);
    cache.set(MechDaily, md);
  }

  cache.set(
    MechTransaction,
    new MechTransaction({
      id: logId(meta),
      mech,
      type: FEE_IN,
      model,
      amountRaw,
      amountUSD: amountUsd,
      timestamp: meta.blockTimestamp,
      blockNumber: meta.blockNumber,
      txHash: meta.txHash,
      deliveryRate: p.deliveryRate,
      balance: p.balance,
      rateDiff: p.rateDiff,
    })
  );
}

/**
 * The subgraph's fee-out sequence: Global, Mech, MechModel, DailyTotals,
 * MechDaily, then a MechTransaction (FEE_OUT). The subgraph's `Mech.load`
 * before the transaction row always succeeds there (updateMechFeesOut has
 * just saved the Mech, and graph-node reads through its own writes), so the
 * row is always written here too.
 */
async function recordFeeOut(
  ctx: Ctx,
  meta: EventMeta,
  model: Model,
  mechId: string,
  amountRaw: BigDecimal,
  amountUsd: BigDecimal
): Promise<void> {
  const { cache } = ctx;

  const g = await getGlobal(cache);
  g.totalFeesOutUSD = g.totalFeesOutUSD.plus(amountUsd);
  cache.set(Global, g);

  const mech = await getOrInitMech(cache, mechId);
  mech.totalFeesOutUSD = mech.totalFeesOutUSD.plus(amountUsd);
  mech.totalFeesOutRaw = mech.totalFeesOutRaw.plus(amountRaw);
  cache.set(Mech, mech);

  const mm = await getOrInitMechModel(cache, mech, model);
  mm.totalFeesOutUSD = mm.totalFeesOutUSD.plus(amountUsd);
  mm.totalFeesOutRaw = mm.totalFeesOutRaw.plus(amountRaw);
  cache.set(MechModel, mm);

  if (amountUsd.gt(0)) {
    const d = await getOrInitDailyTotals(cache, meta.blockTimestamp);
    d.totalFeesOutUSD = d.totalFeesOutUSD.plus(amountUsd);
    cache.set(DailyTotals, d);
  }
  if (amountUsd.gt(0) || amountRaw.gt(0)) {
    const md = await getOrInitMechDaily(cache, mech, meta.blockTimestamp);
    md.feesOutUSD = md.feesOutUSD.plus(amountUsd);
    md.feesOutRaw = md.feesOutRaw.plus(amountRaw);
    cache.set(MechDaily, md);
  }

  cache.set(
    MechTransaction,
    new MechTransaction({
      id: logId(meta),
      mech,
      type: FEE_OUT,
      model,
      amountRaw,
      amountUSD: amountUsd,
      timestamp: meta.blockTimestamp,
      blockNumber: meta.blockNumber,
      txHash: meta.txHash,
      deliveryRate: null,
      balance: null,
      rateDiff: null,
    })
  );
}

// --- handlers ----------------------------------------------------------------

/**
 * Per-model pricing for a fee-in, with a different null policy per arm:
 * native and USDC return null to skip the event, as the subgraph `return`s
 * when a price is missing. NVM treats a null as a config error and throws.
 * OLAS coalesces a null to zero and records it, so it never skips.
 */
async function priceFeeIn(ctx: Ctx, meta: EventMeta, model: Model, amount: bigint): Promise<BigDecimal | null> {
  switch (model) {
    case MODEL_NATIVE: {
      const usd = await ctx.pricing.nativeToUsd(amount, meta.blockNumber);
      if (usd == null) {
        ctx.log.error(`[fees] no native price at block ${meta.blockNumber}; skipping ${meta.txHash}`);
        return null;
      }
      return usd;
    }
    case MODEL_USDC: {
      const usd = ctx.pricing.usdcToUsd(amount);
      if (usd.eq(0)) {
        ctx.log.warn(`[fees] USDC conversion returned 0 for tx ${meta.txHash}; skipping`);
        return null;
      }
      return usd;
    }
    case MODEL_NVM: {
      const usd = ctx.pricing.nvmCreditsToUsd(amount);
      if (usd == null) throw new Error(`[fees] ${ctx.chain.name} has an nvm tracker but no nvm config`);
      return usd;
    }
    case MODEL_OLAS:
      return (await ctx.pricing.olasToUsd(amount, meta.blockNumber)) ?? ZERO;
    default: {
      const never: never = model;
      throw new Error(`unknown model ${String(never)}`);
    }
  }
}

/** `MechBalanceAdjusted(mech, deliveryRate, balance, rateDiff)`: a fee accrued to a mech. */
export async function handleMechBalanceAdjusted(
  ctx: Ctx,
  meta: EventMeta,
  model: Model,
  p: { mech: string; deliveryRate: bigint; balance: bigint; rateDiff: bigint }
): Promise<void> {
  const usd = await priceFeeIn(ctx, meta, model, p.deliveryRate);
  if (usd == null) return;
  await recordFeeIn(ctx, meta, model, p.mech, BigDecimal(p.deliveryRate), usd, p);
}

/** `Withdraw(account, token, amount)`: a mech collected its balance. Burns are skipped. */
export async function handleWithdraw(
  ctx: Ctx,
  meta: EventMeta,
  model: Model,
  p: { account: string; amount: bigint }
): Promise<void> {
  if (ctx.chain.burnAddress != null && p.account === ctx.chain.burnAddress) return;
  if (model === MODEL_NVM) {
    const nvm = ctx.chain.nvm;
    if (nvm == null) throw new Error(`[fees] ${ctx.chain.name} has an nvm tracker but no nvm config`);
    // Withdrawals are paid in the token (xDAI or USDC); raw units are credits.
    const usd =
      nvm.withdrawalsIn === "native"
        ? await ctx.pricing.nativeToUsd(p.amount, meta.blockNumber)
        : ctx.pricing.usdcToUsd(p.amount);
    if (usd == null) {
      ctx.log.error(`[fees] no native price at block ${meta.blockNumber}; skipping nvm fee-out ${meta.txHash}`);
      return;
    }
    await recordFeeOut(ctx, meta, model, p.account, nvmTokenToCredits(p.amount, nvm), usd);
    return;
  }
  const usd = await priceFeeIn(ctx, meta, model, p.amount);
  if (usd == null) return;
  await recordFeeOut(ctx, meta, model, p.account, BigDecimal(p.amount), usd);
}

/** `Drained(token, collectedFees)`: protocol fees sent to the drainer. Never skipped; USD may be 0. */
export async function handleDrained(
  ctx: Ctx,
  meta: EventMeta,
  model: Model,
  p: { token: string; collectedFees: bigint }
): Promise<void> {
  const { cache } = ctx;
  let usd: BigDecimal;
  switch (model) {
    case MODEL_NATIVE:
      usd = (await ctx.pricing.nativeToUsd(p.collectedFees, meta.blockNumber)) ?? ZERO;
      break;
    case MODEL_USDC:
      usd = ctx.pricing.usdcToUsd(p.collectedFees);
      break;
    case MODEL_NVM:
      usd = ctx.pricing.nvmCreditsToUsd(p.collectedFees) ?? ZERO;
      break;
    case MODEL_OLAS:
      usd = (await ctx.pricing.olasToUsd(p.collectedFees, meta.blockNumber)) ?? ZERO;
      break;
    default: {
      const never: never = model;
      throw new Error(`unknown model ${String(never)}`);
    }
  }
  const raw = BigDecimal(p.collectedFees);
  cache.set(
    DrainEvent,
    new DrainEvent({
      id: logId(meta),
      model,
      token: p.token,
      amountRaw: raw,
      amountUSD: usd,
      timestamp: meta.blockTimestamp,
      blockNumber: meta.blockNumber,
      txHash: meta.txHash,
    })
  );
  const dt = await getOrInitDrainTotals(cache, model);
  dt.totalDrainedRaw = dt.totalDrainedRaw.plus(raw);
  dt.totalDrainedUSD = dt.totalDrainedUSD.plus(usd);
  cache.set(DrainTotals, dt);

  const g = await getGlobal(cache);
  g.totalDrainedFeesUSD = g.totalDrainedFeesUSD.plus(usd);
  if (model === MODEL_OLAS) {
    g.totalOlasBurnedRaw = g.totalOlasBurnedRaw.plus(raw);
    g.totalOlasBurnedUSD = g.totalOlasBurnedUSD.plus(usd);
  }
  cache.set(Global, g);
}
