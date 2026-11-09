// Event handlers, ported from studio babydegen-base src/serviceRegistry.ts,
// src/safe.ts, src/tokenBalances.ts and src/common.ts as of #174 + #175.
// Same gating, call order and side effects (AddressType rows, Token/PriceUpdate
// refreshes) as the subgraph, so entity values match row for row.

import type { EventMeta, IEntityCache } from "@olas/squid-shared";
import * as calls from "./calls";
import { BASIUS_AGENT_ID, EXCLUDED_SERVICE_IDS, TOKENS, WETH } from "./constants";
import { GD, pow10 } from "./decimal";
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
import {
  attributeRewardTransfer,
  calculatePortfolioMetrics,
  ensureAgentPortfolio,
  registerServiceForSnapshots,
} from "./portfolio";
import { getEthUsd, getTokenPriceUSD } from "./pricing";
import type { ChainReader } from "./rpc";
import { addressAt, decodedSendOf, ethSentBySafe } from "./safeCalldata";

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

/** The top-level transaction graph-node exposes as `event.transaction`. */
export interface Tx {
  from: string;
  to: string | null;
  value: bigint;
  input: string;
}

/** One log of the transaction receipt (`receipt: true`). */
export interface ReceiptLog {
  address: string;
  topics: string[];
}

const ZERO = GD.ZERO;
const ZERO_ADDRESS = ETH_ADDRESS;
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

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SAFE_RECEIVED_TOPIC = "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d";
/** WETH9 Deposit(address indexed dst, uint256 wad): wrapping emits this, not a Transfer. */
const WETH_DEPOSIT_TOPIC = "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";

const topicAddress = (topic: string) => addressAt(Buffer.from(topic.slice(2), "hex"), 0);

/**
 * getAddressType: `ethereum.hasCode` plus, for a contract, a `getThreshold()`
 * try-call (answers = a Safe), at the current block, memoized in AddressType.
 */
export async function getAddressType(ctx: Ctx, address: string, meta: EventMeta): Promise<AddressType> {
  const known = await ctx.cache.get(AddressType, address);
  if (known != null) return known;
  const isContract = await ctx.chain.hasCode(address, meta.blockNumber);
  const isSafe = isContract && (await ctx.chain.call(address, meta.blockNumber, calls.getThreshold, {})) != null;
  const row = new AddressType({ id: address, isContract, isSafe, checkedAt: meta.blockNumber });
  ctx.cache.set(AddressType, row);
  return row;
}

/** The service's own side: its Safe, its agent EOAs, or the zero address (mint / burn). */
const isServiceOwnAddress = (address: string, serviceSafe: string, service: Service) =>
  address === serviceSafe || address === ZERO_ADDRESS || service.agentInstances.includes(address);

async function loadFundingService(ctx: Ctx, serviceSafe: string): Promise<Service | undefined> {
  const service = await getService(ctx, serviceSafe);
  if (service == null) ctx.log.warn(`[FUNDING_SOURCE] No service found for safe ${serviceSafe}`);
  return service;
}

/**
 * isUserSideOther: the operator Safe, the tx sender (an EIP-7702 wallet
 * included), any other Safe, or an EOA. The operator and sender checks come
 * first, so they never create an AddressType row.
 */
async function isUserSideOther(ctx: Ctx, address: string, service: Service, meta: EventMeta, tx: Tx): Promise<boolean> {
  if (address === service.operatorSafe || address === tx.from) return true;
  const type = await getAddressType(ctx, address, meta);
  return !type.isContract || type.isSafe;
}

/** isUserSide: funding comes from (and withdrawals go to) the user side; gas to an agent EOA is a cost. */
export async function isUserSide(ctx: Ctx, address: string, serviceSafe: string, meta: EventMeta, tx: Tx): Promise<boolean> {
  const service = await loadFundingService(ctx, serviceSafe);
  if (service == null || isServiceOwnAddress(address, serviceSafe, service)) return false;
  return isUserSideOther(ctx, address, service, meta, tx);
}

/**
 * receiptHasInflowTo: the receipt shows something coming back to the Safe:
 * an ERC-20 / ERC-721 Transfer to it, a WETH Deposit for it, or its own
 * SafeReceived. Outflows in such a tx are swaps, wraps or LP entries.
 */
function receiptHasInflowTo(safe: string, receipt: ReceiptLog[]): boolean {
  for (const log of receipt) {
    const t = log.topics;
    if (t.length >= 3 && t[0] === TRANSFER_TOPIC && topicAddress(t[2]) === safe) return true;
    if (t.length >= 1 && t[0] === SAFE_RECEIVED_TOPIC && log.address === safe) return true;
    if (t.length >= 2 && t[0] === WETH_DEPOSIT_TOPIC && log.address === WETH && topicAddress(t[1]) === safe) return true;
  }
  return false;
}

/**
 * isWithdrawalRecipient: the user side, or a contract when nothing came back
 * to the Safe in the same tx (e.g. an EIP-7702 wallet). Without a receipt a
 * contract outflow is not counted.
 */
export async function isWithdrawalRecipient(
  ctx: Ctx,
  address: string,
  serviceSafe: string,
  meta: EventMeta,
  tx: Tx,
  receipt: ReceiptLog[] | null,
): Promise<boolean> {
  const service = await loadFundingService(ctx, serviceSafe);
  if (service == null || isServiceOwnAddress(address, serviceSafe, service)) return false;
  if (await isUserSideOther(ctx, address, service, meta, tx)) return true;
  if (receipt == null) {
    ctx.log.error(`[WITHDRAWAL] No receipt for tx ${meta.txHash}; outflow from ${serviceSafe} to contract ${address} not counted`);
    return false;
  }
  return !receiptHasInflowTo(serviceSafe, receipt);
}

// --- serviceRegistry.ts -----------------------------------------------------

export async function handleRegisterInstance(
  ctx: Ctx,
  meta: EventMeta,
  e: { operator: string; serviceId: bigint; agentInstance: string; agentId: bigint },
): Promise<void> {
  if (e.agentId !== BASIUS_AGENT_ID) return;
  if (isExcluded(e.serviceId)) return;
  const id = serviceKey(e.serviceId);
  // Every agent EOA ever registered for this service: none of them is the user side.
  const previous = await ctx.cache.get(ServiceRegistration, id);
  const agentInstances = previous != null ? [...previous.agentInstances] : [];
  if (!agentInstances.includes(e.agentInstance)) agentInstances.push(e.agentInstance);
  ctx.cache.set(
    ServiceRegistration,
    new ServiceRegistration({
      id,
      serviceId: e.serviceId,
      operatorSafe: e.operator,
      registrationBlock: meta.blockNumber,
      registrationTimestamp: meta.blockTimestamp,
      registrationTxHash: meta.txHash,
      agentInstances,
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
  service.agentInstances = agentInstances;
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
    existing.agentInstances = [...registration.agentInstances];
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
    agentInstances: [...registration.agentInstances],
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

/** tokenUtils.ts convertTokenAmount: whole tokens by the token's decimals (18 when unknown, i.e. ETH as WETH). */
const convertTokenAmount = (amount: bigint, token: string) =>
  GD.fromBigInt(amount).div(pow10(TOKENS.get(token)?.decimals ?? 18));

/** transferUsdValue: valued at the token's price (ETH at WETH's); an unpriced token is $0. */
export async function transferUsdValue(ctx: Ctx, value: bigint, token: string, safe: string, meta: EventMeta): Promise<GD> {
  const price = await getTokenPriceUSD(ctx, token, meta);
  if (price.equals(ZERO)) {
    ctx.log.warn(`FUNDING: token ${token} has no price; its transfer for safe ${safe} in tx ${meta.txHash} is valued at $0`);
  }
  return convertTokenAmount(value, token).times(price);
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

/**
 * updateFundingBalance, the single source of truth for funding in. Outflows
 * go to updateWithdrawalBalance, so totalOutUsd stays 0 and netUsd equals
 * totalInUsd.
 */
export async function updateFundingBalance(ctx: Ctx, serviceSafe: string, usd: GD, meta: EventMeta): Promise<void> {
  const ts = meta.blockTimestamp;
  const fb = (await ctx.cache.get(FundingBalance, serviceSafe)) ?? (await newFundingBalance(ctx, serviceSafe, ts));
  const oldTotalIn = GD.fromStore(fb.totalInUsd);
  fb.totalInUsd = oldTotalIn.plus(usd).toStore();
  fb.fundingInTxs = [...fb.fundingInTxs, meta.txHash];
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
  fb.netUsd = fb.totalInUsd;
  fb.lastChangeTs = ts;
  ctx.cache.set(FundingBalance, fb);
  await ensureAgentPortfolio(ctx, serviceSafe, ts);
}

/** updateWithdrawalBalance: tracked separately, never reduces netUsd. */
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
  const amountDecimal = GD.fromBigInt(amount).div(pow10(18));
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
  const amountDecimal = convertTokenAmount(amount, token);
  await applyBalance(ctx, service, token, config.symbol, config.decimals, amountDecimal, isIncrease, token, meta);
}

/**
 * handleERC20Transfer (handleUSDC is the same handler), `receipt: true`.
 * meta.address is the token. Every tracked token is funding from the user
 * side and a withdrawal to it, or to a contract that sent nothing back.
 */
export async function handleERC20Transfer(
  ctx: Ctx,
  meta: EventMeta,
  e: { from: string; to: string; value: bigint },
  tx: Tx,
  receipt: ReceiptLog[] | null,
): Promise<void> {
  const token = meta.address;
  if (!TOKENS.has(token)) return;

  if ((await getService(ctx, e.to)) != null) {
    await attributeRewardTransfer(ctx, meta, e.from, e.to, e.value, receipt);
    await updateTokenBalance(ctx, e.to, token, e.value, true, meta);
    await ensureAgentPortfolio(ctx, e.to, meta.blockTimestamp);
    if (await isUserSide(ctx, e.from, e.to, meta, tx)) {
      await updateFundingBalance(ctx, e.to, await transferUsdValue(ctx, e.value, token, e.to, meta), meta);
    }
    // After the funding update, so a deposit is in initialValue as well as in the balances.
    await calculatePortfolioMetrics(ctx, e.to, meta);
  }

  if ((await getService(ctx, e.from)) != null) {
    await updateTokenBalance(ctx, e.from, token, e.value, false, meta);
    if (await isWithdrawalRecipient(ctx, e.to, e.from, meta, tx, receipt)) {
      await updateWithdrawalBalance(ctx, e.from, await transferUsdValue(ctx, e.value, token, e.from, meta), meta);
    }
    await calculatePortfolioMetrics(ctx, e.from, meta);
  }
}

// --- safe.ts ----------------------------------------------------------------

/**
 * SafeReceived on a Safe host (meta.address is the receiving safe): ETH into
 * a service Safe (funding when from the user side), or from a service Safe
 * into another indexed Safe, unless the service Safe's own calldata in this
 * tx already shows that send (handleExecutionSuccess counts it).
 */
export async function handleSafeReceived(
  ctx: Ctx,
  meta: EventMeta,
  e: { sender: string; value: bigint },
  tx: Tx,
): Promise<void> {
  const from = e.sender;
  const to = meta.address;
  if ((await getService(ctx, to)) != null) {
    if (await isUserSide(ctx, from, to, meta, tx)) {
      await updateFundingBalance(ctx, to, await transferUsdValue(ctx, e.value, WETH, to, meta), meta);
    }
    await updateETHBalance(ctx, to, e.value, true, meta);
    await calculatePortfolioMetrics(ctx, to, meta);
    return;
  }
  if ((await getService(ctx, from)) == null || decodedSendOf(from, tx, to, e.value)) return;
  // Only Safes we index emit SafeReceived; the operator Safe and any other Safe are the user side.
  if (await isUserSide(ctx, to, from, meta, tx)) {
    await updateWithdrawalBalance(ctx, from, await transferUsdValue(ctx, e.value, WETH, from, meta), meta);
  }
  await updateETHBalance(ctx, from, e.value, false, meta);
  await calculatePortfolioMetrics(ctx, from, meta);
}

/**
 * ExecutionSuccess (`receipt: true`), i.e. processSafeEthTransfer: the ETH
 * the service Safe sends in its own execTransaction, decoded from calldata.
 */
export async function handleExecutionSuccess(ctx: Ctx, meta: EventMeta, tx: Tx, receipt: ReceiptLog[] | null): Promise<void> {
  const serviceSafe = meta.address;
  if ((await getService(ctx, serviceSafe)) == null) return;
  const decoded = ethSentBySafe(serviceSafe, tx);
  if (decoded.sends == null) {
    ctx.log.warn(`SAFE_ETH: tx ${meta.txHash}: ETH safe ${serviceSafe} sends is not read (${decoded.reason}); any ETH it sent is not counted`);
    return;
  }
  for (const send of decoded.sends) {
    await updateETHBalance(ctx, serviceSafe, send.value, false, meta);
    if (await isWithdrawalRecipient(ctx, send.to, serviceSafe, meta, tx, receipt)) {
      await updateWithdrawalBalance(ctx, serviceSafe, await transferUsdValue(ctx, send.value, WETH, serviceSafe, meta), meta);
    }
  }
  if (decoded.sends.length > 0) await calculatePortfolioMetrics(ctx, serviceSafe, meta);
}

/**
 * ExecutionFromModuleSuccess: a module's ETH sends are in the module's
 * calldata, not the Safe's, so nothing is counted (a warning only).
 */
export async function handleExecutionFromModuleSuccess(ctx: Ctx, meta: EventMeta, e: { module: string }): Promise<void> {
  if ((await getService(ctx, meta.address)) == null) return;
  ctx.log.warn(`SAFE_ETH: tx ${meta.txHash}: ETH safe ${meta.address} sends through module ${e.module} is not read`);
}
