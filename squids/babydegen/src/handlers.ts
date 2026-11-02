// Event handlers, ported from studio babydegen-base src/serviceRegistry.ts,
// src/safe.ts, src/tokenBalances.ts (+ funding.ts) and src/common.ts. Same
// gating, call order and side effects (AddressType rows, Token/PriceUpdate
// refreshes) as the subgraph, so entity values match row for row.

import type { EventMeta, IEntityCache } from "@olas/squid-shared";
import { BASIUS_AGENT_ID, EXCLUDED_SERVICE_IDS, TOKENS, USDC_NATIVE, WETH } from "./constants";
import { GD, gd, pow10 } from "./decimal";
import { ETH_ADDRESS, serviceKey, tokenBalanceId } from "./ids";
import {
  AddressType,
  AgentPortfolio,
  FundingBalance,
  SafeDataSource,
  Service,
  ServiceIndex,
  ServiceRegistration,
  TokenBalance,
} from "./model";
import { calculatePortfolioMetrics, ensureAgentPortfolio, registerServiceForSnapshots } from "./portfolio";
import { getEthUsd, getTokenPriceUSD } from "./pricing";
import type { ChainReader } from "./rpc";

export type Logger = { warn(msg: string): void; info(msg: string): void; error(msg: string): void };

export interface Ctx {
  cache: IEntityCache;
  chain: ChainReader;
  log: Logger;
  /**
   * Safe template instances created by the current log, in creation order.
   * The block processor drains it to pick up the new hosts' logs (src/block.ts).
   */
  spawnedSafes: string[];
  /** Service safes created by the current log (they join the Transfer filter). */
  newServices: string[];
}

/** Top-level transaction fields graph-node exposes as `event.transaction`. */
export interface TxFields {
  to: string | null;
  value: bigint;
}

const ZERO = GD.ZERO;
const isExcluded = (serviceId: bigint) => EXCLUDED_SERVICE_IDS.includes(serviceId);
const getService = (ctx: Ctx, address: string) => ctx.cache.get(Service, address);

/**
 * `Safe.create(address)`. graph-node drops a second instance of the same
 * template + address ("no runtime host created, there is already a runtime
 * host instantiated for this data source"), so a known address is a no-op.
 */
export async function createSafeDataSource(ctx: Ctx, address: string, meta: EventMeta): Promise<void> {
  if ((await ctx.cache.get(SafeDataSource, address)) != null) return;
  ctx.cache.set(SafeDataSource, new SafeDataSource({ id: address, createdAtBlock: meta.blockNumber }));
  ctx.spawnedSafes.push(address);
}

// --- common.ts --------------------------------------------------------------

/** isEOACached: `ethereum.hasCode` at the current block, memoized in AddressType. */
export async function isEOACached(ctx: Ctx, address: string, meta: EventMeta): Promise<boolean> {
  const known = await ctx.cache.get(AddressType, address);
  if (known != null) return !known.isContract;
  const isContract = await ctx.chain.hasCode(address, meta.blockNumber);
  ctx.cache.set(AddressType, new AddressType({ id: address, isContract, checkedAt: meta.blockNumber }));
  return !isContract;
}

/** isFundingSource: the service's operator, or any EOA (both always evaluated). */
export async function isFundingSource(ctx: Ctx, address: string, serviceSafe: string, meta: EventMeta): Promise<boolean> {
  const service = await getService(ctx, serviceSafe);
  if (service == null) {
    ctx.log.warn(`[FUNDING_SOURCE] txHash: ${meta.txHash} - No service found for safe ${serviceSafe}`);
    return false;
  }
  const isOperator = address === service.operatorSafe;
  const eoa = await isEOACached(ctx, address, meta);
  return isOperator || eoa;
}

// --- serviceRegistry.ts -----------------------------------------------------

export async function handleRegisterInstance(
  ctx: Ctx,
  meta: EventMeta,
  e: { operator: string; serviceId: bigint; agentId: bigint },
): Promise<void> {
  if (e.agentId !== BASIUS_AGENT_ID) return;
  if (isExcluded(e.serviceId)) return;
  const id = serviceKey(e.serviceId);
  ctx.cache.set(
    ServiceRegistration,
    new ServiceRegistration({
      id,
      serviceId: e.serviceId,
      operatorSafe: e.operator,
      registrationBlock: meta.blockNumber,
      registrationTimestamp: meta.blockTimestamp,
      registrationTxHash: meta.txHash,
    }),
  );
  const index = await ctx.cache.get(ServiceIndex, id);
  if (index == null) return;
  const service = await getService(ctx, index.currentServiceSafe);
  if (service == null) return;
  service.operatorSafe = e.operator;
  service.latestRegistrationBlock = meta.blockNumber;
  service.latestRegistrationTimestamp = meta.blockTimestamp;
  service.latestRegistrationTxHash = meta.txHash;
  service.updatedAt = meta.blockTimestamp;
  ctx.cache.set(Service, service);
}

export async function handleCreateMultisigWithAgents(
  ctx: Ctx,
  meta: EventMeta,
  e: { serviceId: bigint; multisig: string },
): Promise<void> {
  if (isExcluded(e.serviceId)) return;
  const id = serviceKey(e.serviceId);
  const registration = await ctx.cache.get(ServiceRegistration, id);
  if (registration == null) return; // not Basius (no agentId-115 RegisterInstance)

  const existing = await getService(ctx, e.multisig);
  if (existing != null) {
    // Same multisig re-deployed: ownership update only, no new Safe template.
    existing.operatorSafe = registration.operatorSafe;
    existing.latestRegistrationBlock = registration.registrationBlock;
    existing.latestRegistrationTimestamp = registration.registrationTimestamp;
    existing.latestRegistrationTxHash = registration.registrationTxHash;
    existing.latestMultisigBlock = meta.blockNumber;
    existing.latestMultisigTimestamp = meta.blockTimestamp;
    existing.latestMultisigTxHash = meta.txHash;
    existing.updatedAt = meta.blockTimestamp;
    ctx.cache.set(Service, existing);
    const index = await ctx.cache.get(ServiceIndex, id);
    if (index != null) {
      index.currentServiceSafe = e.multisig;
      ctx.cache.set(ServiceIndex, index);
    }
    return;
  }

  const service = new Service({
    id: e.multisig,
    serviceId: e.serviceId,
    operatorSafe: registration.operatorSafe,
    serviceSafe: e.multisig,
    positionIds: [],
    latestRegistrationBlock: registration.registrationBlock,
    latestRegistrationTimestamp: registration.registrationTimestamp,
    latestRegistrationTxHash: registration.registrationTxHash,
    latestMultisigBlock: meta.blockNumber,
    latestMultisigTimestamp: meta.blockTimestamp,
    latestMultisigTxHash: meta.txHash,
    isActive: true,
    createdAt: meta.blockTimestamp,
    updatedAt: meta.blockTimestamp,
  });
  ctx.cache.set(Service, service);
  ctx.newServices.push(e.multisig);

  const index =
    (await ctx.cache.get(ServiceIndex, id)) ?? new ServiceIndex({ id, serviceId: e.serviceId });
  index.currentServiceSafe = e.multisig;
  ctx.cache.set(ServiceIndex, index);

  const portfolio = await ensureAgentPortfolio(ctx, e.multisig, meta.blockTimestamp);
  if (portfolio.firstTradingTimestamp === 0n) {
    portfolio.firstTradingTimestamp = meta.blockTimestamp;
    portfolio.firstFundingEthPrice = (await getEthUsd(ctx, meta)).toStore();
    ctx.cache.set(AgentPortfolio, portfolio);
  }
  await registerServiceForSnapshots(ctx, e.multisig);

  await createSafeDataSource(ctx, e.multisig, meta);
  await createSafeDataSource(ctx, registration.operatorSafe, meta);
}

// --- tokenBalances.ts -------------------------------------------------------

const ethUsd = async (ctx: Ctx, value: bigint, meta: EventMeta): Promise<GD> =>
  GD.fromBigInt(value).times(await getEthUsd(ctx, meta)).div(gd("1e18"));

export async function updateFundingBalance(
  ctx: Ctx,
  serviceSafe: string,
  usd: GD,
  deposit: boolean,
  meta: EventMeta,
  txHash = "",
): Promise<void> {
  const ts = meta.blockTimestamp;
  const fb = (await ctx.cache.get(FundingBalance, serviceSafe)) ?? (await newFundingBalance(ctx, serviceSafe, ts));
  const oldTotalIn = GD.fromStore(fb.totalInUsd);
  if (deposit) {
    fb.totalInUsd = oldTotalIn.plus(usd).toStore();
    if (txHash !== "") fb.fundingInTxs = [...fb.fundingInTxs, txHash];
    if (oldTotalIn.equals(ZERO)) {
      const portfolio = await ensureAgentPortfolio(ctx, serviceSafe, ts);
      if (portfolio.firstTradingTimestamp === 0n) {
        portfolio.firstTradingTimestamp = ts;
        // createBlockFromTimestamp(ts): the eth_call still runs at the
        // handler's block in graph-node; only the block object is synthetic.
        portfolio.firstFundingEthPrice = (await getEthUsd(ctx, meta)).toStore();
        ctx.cache.set(AgentPortfolio, portfolio);
      }
    }
  } else {
    fb.totalOutUsd = GD.fromStore(fb.totalOutUsd).plus(usd).toStore();
    if (txHash !== "") fb.fundingOutTxs = [...fb.fundingOutTxs, txHash];
  }
  fb.netUsd = GD.fromStore(fb.totalInUsd).minus(GD.fromStore(fb.totalOutUsd)).toStore();
  fb.lastChangeTs = ts;
  ctx.cache.set(FundingBalance, fb);
  await ensureAgentPortfolio(ctx, serviceSafe, ts);
}

async function newFundingBalance(ctx: Ctx, serviceSafe: string, ts: bigint): Promise<FundingBalance> {
  return new FundingBalance({
    id: serviceSafe,
    service: (await getService(ctx, serviceSafe)) ?? new Service({ id: serviceSafe }),
    totalInUsd: ZERO.toStore(),
    totalOutUsd: ZERO.toStore(),
    totalWithdrawnUsd: ZERO.toStore(),
    netUsd: ZERO.toStore(),
    firstInTimestamp: ts,
    fundingInTxs: [],
    fundingOutTxs: [],
  });
}

/** USDC to an EOA/operator: tracked as withdrawn, not as funding out. */
export async function updateWithdrawalBalance(ctx: Ctx, serviceSafe: string, usd: GD, meta: EventMeta): Promise<void> {
  const ts = meta.blockTimestamp;
  const fb = (await ctx.cache.get(FundingBalance, serviceSafe)) ?? (await newFundingBalance(ctx, serviceSafe, ts));
  fb.totalWithdrawnUsd = GD.fromStore(fb.totalWithdrawnUsd).plus(usd).toStore();
  fb.lastChangeTs = ts;
  ctx.cache.set(FundingBalance, fb);
  await ensureAgentPortfolio(ctx, serviceSafe, ts);
}

async function applyBalance(
  ctx: Ctx,
  service: Service,
  token: string,
  symbol: string,
  decimals: number,
  amount: GD,
  isIncrease: boolean,
  priceToken: string,
  meta: EventMeta,
): Promise<void> {
  const id = tokenBalanceId(service.id, token);
  const balance =
    (await ctx.cache.get(TokenBalance, id)) ??
    new TokenBalance({
      id,
      service,
      token,
      symbol,
      decimals,
      balance: ZERO.toStore(),
      balanceUSD: ZERO.toStore(),
    });
  let value = GD.fromStore(balance.balance);
  if (isIncrease) {
    value = value.plus(amount);
  } else {
    value = value.minus(amount);
    if (value.lt(ZERO)) value = ZERO;
  }
  const price = await getTokenPriceUSD(ctx, priceToken, meta);
  balance.balance = value.toStore();
  balance.balanceUSD = value.times(price).toStore();
  balance.lastUpdated = meta.blockTimestamp;
  balance.lastBlock = meta.blockNumber;
  ctx.cache.set(TokenBalance, balance);
}

/** updateETHBalance: native ETH under `Address.zero()`, priced as WETH. */
export async function updateETHBalance(
  ctx: Ctx,
  serviceSafe: string,
  amount: bigint,
  isIncrease: boolean,
  meta: EventMeta,
): Promise<void> {
  const service = await getService(ctx, serviceSafe);
  if (service == null) return;
  const amountDecimal = GD.fromBigInt(amount).div(gd("1e18"));
  await applyBalance(ctx, service, ETH_ADDRESS, "ETH", 18, amountDecimal, isIncrease, WETH, meta);
}

export async function updateTokenBalance(
  ctx: Ctx,
  serviceSafe: string,
  token: string,
  amount: bigint,
  isIncrease: boolean,
  meta: EventMeta,
): Promise<void> {
  const service = await getService(ctx, serviceSafe);
  if (service == null) return;
  const config = TOKENS.get(token);
  if (config == null) return;
  const amountDecimal = GD.fromBigInt(amount).div(pow10(config.decimals));
  await applyBalance(ctx, service, token, config.symbol, config.decimals, amountDecimal, isIncrease, token, meta);
}

/** handleERC20Transfer (handleUSDC is the same handler). meta.address is the token. */
export async function handleERC20Transfer(
  ctx: Ctx,
  meta: EventMeta,
  e: { from: string; to: string; value: bigint },
): Promise<void> {
  const token = meta.address;
  const config = TOKENS.get(token);
  if (config == null) return;
  const divisor = pow10(config.decimals);
  const usdOf = async () => GD.fromBigInt(e.value).div(divisor).times(await getTokenPriceUSD(ctx, token, meta));

  if ((await getService(ctx, e.to)) != null) {
    await updateTokenBalance(ctx, e.to, token, e.value, true, meta);
    await ensureAgentPortfolio(ctx, e.to, meta.blockTimestamp);
    await calculatePortfolioMetrics(ctx, e.to, meta);
    const isValidSource = await isFundingSource(ctx, e.from, e.to, meta);
    if (isValidSource && token === USDC_NATIVE) {
      await updateFundingBalance(ctx, e.to, await usdOf(), true, meta, meta.txHash);
    } else if (isValidSource) {
      await usdOf(); // logged only, but the price lookup can refresh Token
    }
  }

  if ((await getService(ctx, e.from)) != null) {
    await updateTokenBalance(ctx, e.from, token, e.value, false, meta);
    if (token === USDC_NATIVE) {
      if (await isFundingSource(ctx, e.to, e.from, meta)) {
        await updateWithdrawalBalance(ctx, e.from, await usdOf(), meta);
      }
    } else {
      await usdOf(); // logged only, but the price lookup can refresh Token
    }
  }
}

// --- safe.ts ----------------------------------------------------------------

/** SafeReceived on a Safe host (meta.address is the receiving safe). */
export async function handleSafeReceived(
  ctx: Ctx,
  meta: EventMeta,
  e: { sender: string; value: bigint },
): Promise<void> {
  const from = e.sender;
  const to = meta.address;
  if ((await getService(ctx, to)) != null) {
    if (await isFundingSource(ctx, from, to, meta)) {
      await updateFundingBalance(ctx, to, await ethUsd(ctx, e.value, meta), true, meta, meta.txHash);
    }
    await updateETHBalance(ctx, to, e.value, true, meta);
    return;
  }
  const fromService = await getService(ctx, from);
  if (fromService == null) return;
  const usd = await ethUsd(ctx, e.value, meta);
  if (to === fromService.operatorSafe) {
    // Service safe -> its operator safe
    await updateFundingBalance(ctx, from, usd, false, meta, meta.txHash);
  }
  await updateETHBalance(ctx, from, e.value, false, meta);
}

/**
 * ExecutionSuccess / ExecutionFromModuleSuccess: the TOP-LEVEL transaction's
 * `to` and `value` (graph-node's event.transaction), not the Safe's inner call.
 */
export async function handleSafeExecution(ctx: Ctx, meta: EventMeta, tx: TxFields): Promise<void> {
  const serviceSafe = meta.address;
  if ((await getService(ctx, serviceSafe)) == null) return;
  if (tx.value > 0n && tx.to != null) {
    await updateETHBalance(ctx, serviceSafe, tx.value, false, meta);
    if (await isFundingSource(ctx, tx.to, serviceSafe, meta)) {
      await updateFundingBalance(ctx, serviceSafe, await ethUsd(ctx, tx.value, meta), false, meta, meta.txHash);
    }
  }
}
