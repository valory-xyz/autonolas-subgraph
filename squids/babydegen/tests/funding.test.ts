// Port of studio babydegen-base tests/funding.test.ts (#175): funding,
// withdrawals and ETH sends, with the same addresses, calldata and real
// receipts. The AgentPortfolio assertions there (initialValue, finalValue,
// unrealisedPnL ...) belong to calculatePortfolioMetrics, ported in slice 3;
// here the same cases assert the FundingBalance and TokenBalance rows.

import { describe, expect, it } from "vitest";
import { BOLD, ETH_USD_FEED, USDC_NATIVE, USDC_USD_FEED, WETH } from "../src/constants";
import { gd } from "../src/decimal";
import * as h from "../src/handlers";
import { ETH_ADDRESS, serviceKey, tokenBalanceId } from "../src/ids";
import { AddressType, FundingBalance, Service, ServiceRegistration, Token, TokenBalance } from "../src/model";
import * as fx from "./fixtures/receipts175";
import { addr, hash, meta, setup, tx } from "./helpers";

const OPERATOR_SAFE = addr(0x01);
const AGENT_INSTANCE = addr(0x02);
const USER_EOA = addr(0xe0);
const OTHER_SAFE = addr(0xe1);
const SOME_CONTRACT = addr(0xe2);
// Optimism tx 0xf2a832e7…: Safe 0xf3bb39 sends 231.883683 USDC to an EIP-7702 wallet (has code, not a Safe)
const SAFE_7702 = "0xf3bb3983b68b8b4979adb6e1ddd2aadbaa48ad93";
const WALLET_7702 = "0x8ce734aabe677aed77b69f1d391cdb610a21d675";
// Optimism tx 0x6d10752f…: Safe 0xd32613 enters Velodrome CL pool 0x1737…; only the position NFTs come back
const SAFE_CL = "0xd32613ed605be41d9c7fbc85f2ccb4fba59778ac";
const CL_POOL = "0x1737275d53a5ca5dac582a493aa32c85ba2cfad3";
const LIFI_DIAMOND = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";

const TS = 1_700_000_000n;
const BLOCK = 136_600_000n;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SAFE_RECEIVED_TOPIC = "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d";
const WETH_DEPOSIT_TOPIC = "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
const ONE_ETH = 10n ** 18n;
const HALF_ETH = 5n * 10n ** 17n;

const topic = (a: string) => "0x" + "0".repeat(24) + a.slice(2);
const at = (address: string, logIndex = 1) => meta({ address, blockNumber: BLOCK, blockTimestamp: TS, txHash: hash(0x75), logIndex });

function world() {
  const w = setup();
  // mockEthUsd: $2000 at the block
  w.chain.feeds.set(ETH_USD_FEED, { answer: 2000_00000000n, updatedAt: TS });
  return w;
}
type W = ReturnType<typeof world>;

function seedService(w: W, safe: string) {
  w.cache.set(
    Service,
    new Service({
      id: safe,
      serviceId: 607n,
      operatorSafe: OPERATOR_SAFE,
      serviceSafe: safe,
      latestRegistrationBlock: BLOCK,
      latestRegistrationTimestamp: TS,
      latestRegistrationTxHash: hash(0x75),
      latestMultisigBlock: BLOCK,
      latestMultisigTimestamp: TS,
      latestMultisigTxHash: hash(0x75),
      isActive: true,
      createdAt: TS,
      updatedAt: TS,
      positionIds: [],
      agentInstances: [AGENT_INSTANCE],
    }),
  );
}

/** A cached AddressType means no hasCode / getThreshold call is made. */
function seedAddressType(w: W, address: string, isContract: boolean, isSafe: boolean) {
  w.cache.set(AddressType, new AddressType({ id: address, isContract, isSafe, checkedAt: BLOCK }));
}

/** A fresh cached price: getTokenPriceUSD returns it without calling any source. */
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

const funding = async (w: W, safe: string) => (await w.cache.get(FundingBalance, safe))!;
const field = async (w: W, safe: string, f: "totalInUsd" | "totalWithdrawnUsd" | "netUsd") => (await funding(w, safe))[f].toFixed();
const ethBalance = async (w: W, safe: string) => (await w.cache.get(TokenBalance, tokenBalanceId(safe, ETH_ADDRESS)))!.balance.toFixed();

/** The fixtures keep address + topics, all the funding rule reads; the rest of each log is filler. */
type LooseReceipt = { address: string; topics: string[] }[];
const full = (receipt: LooseReceipt | null): h.ReceiptLog[] | null =>
  receipt?.map((l, i) => ({ data: "0x", logIndex: 100 + i, ...l })) ?? null;

const transfer = (w: W, token: string, from: string, to: string, value: bigint, receipt: LooseReceipt | null, sender?: string) =>
  h.handleERC20Transfer(w.ctx, at(token), { from, to, value }, tx(sender ? { from: sender } : {}), full(receipt));

const received = (w: W, safe: string, sender: string, value: bigint, over: Partial<h.Tx> = {}) =>
  h.handleSafeReceived(w.ctx, at(safe), { sender, value }, tx(over));

const execution = (w: W, safe: string, input: string, value: bigint, receipt: LooseReceipt | null, over: Partial<h.Tx> = {}) =>
  h.handleExecutionSuccess(w.ctx, at(safe, 22), tx({ to: safe, value, input, ...over }), full(receipt));

/** execTransaction Call of 0.5 ETH to `to` (EXEC_ETH_TO_USER with its `to` word replaced). */
const execCallTo = (to: string) => fx.EXEC_ETH_TO_USER.slice(0, 10) + "0".repeat(24) + to.slice(2) + fx.EXEC_ETH_TO_USER.slice(74);

function withOperation(input: string, operation: number) {
  const start = 2 + 8 + 3 * 64;
  return input.slice(0, start) + operation.toString(16).padStart(64, "0") + input.slice(start + 64);
}

function withDelegatecallSelector(input: string, selector: string) {
  const i = input.indexOf("8d80ff0a", 10);
  return input.slice(0, i) + selector + input.slice(i + 8);
}

/** The Safe starts with 1 ETH from the user's EOA ($2000 funding). */
async function fundOneEth(w: W, safe: string) {
  seedService(w, safe);
  seedAddressType(w, USER_EOA, false, false);
  await received(w, safe, USER_EOA, ONE_ETH);
}

function tokenWorld() {
  const w = world();
  seedTokenPrice(w, USDC_NATIVE, "USDC", 6, "1");
  seedTokenPrice(w, BOLD, "BOLD", 18, "1");
  return w;
}

describe("funding: every tracked token counts", () => {
  it("BOLD from the user's EOA is funding", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await transfer(w, BOLD, USER_EOA, SAFE_CL, 700n * ONE_ETH, []);
    expect(await field(w, SAFE_CL, "totalInUsd")).toBe("700");
  });

  it("BOLD back to the user's EOA is a withdrawal", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await transfer(w, BOLD, SAFE_CL, USER_EOA, 250n * ONE_ETH, []);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("250");
  });

  it("WETH in and out is valued at its own price, not $1", async () => {
    const w = tokenWorld();
    seedTokenPrice(w, WETH, "WETH", 18, "2000");
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await transfer(w, WETH, USER_EOA, SAFE_CL, HALF_ETH, []);
    await transfer(w, WETH, SAFE_CL, USER_EOA, HALF_ETH / 2n, []);
    expect(await field(w, SAFE_CL, "totalInUsd")).toBe("1000");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("500");
  });

  it("deposits and withdrawals keep netUsd equal to totalInUsd", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await transfer(w, USDC_NATIVE, USER_EOA, SAFE_CL, 1_000_000_000n, []);
    await transfer(w, USDC_NATIVE, SAFE_CL, USER_EOA, 400_000_000n, []);
    expect(await field(w, SAFE_CL, "netUsd")).toBe("1000");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("400");
    expect((await w.cache.get(TokenBalance, tokenBalanceId(SAFE_CL, USDC_NATIVE)))!.balanceUSD.toFixed()).toBe("600");
  });

  it("a deposit from another Safe is funding", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, OTHER_SAFE, true, true);
    await transfer(w, USDC_NATIVE, OTHER_SAFE, SAFE_CL, 5_000_000n, []);
    expect(await field(w, SAFE_CL, "totalInUsd")).toBe("5");
  });

  it("the agent EOA is never the user side, in or out", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, AGENT_INSTANCE, false, false);
    // The agent EOA sends its own txs, so it is also tx.from
    await transfer(w, USDC_NATIVE, AGENT_INSTANCE, SAFE_CL, 5_000_000n, [], AGENT_INSTANCE);
    await transfer(w, USDC_NATIVE, SAFE_CL, AGENT_INSTANCE, 5_000_000n, [], AGENT_INSTANCE);
    expect(await w.cache.get(FundingBalance, SAFE_CL)).toBeUndefined();
  });

  it("a mint (from the zero address) is not funding", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    await transfer(w, USDC_NATIVE, ETH_ADDRESS, SAFE_CL, 5_000_000n, []);
    expect(await w.cache.get(FundingBalance, SAFE_CL)).toBeUndefined();
  });

  it("a deposit sent by the tx's own sender (e.g. an EIP-7702 wallet) is funding", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    await transfer(w, USDC_NATIVE, SOME_CONTRACT, SAFE_CL, 5_000_000n, [], SOME_CONTRACT);
    expect(await field(w, SAFE_CL, "totalInUsd")).toBe("5");
  });

  it("a deposit from a non-Safe contract is not funding", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    await transfer(w, USDC_NATIVE, SOME_CONTRACT, SAFE_CL, 5_000_000n, []);
    expect(await w.cache.get(FundingBalance, SAFE_CL)).toBeUndefined();
  });

  it("a transfer of an unpriced token is valued at $0", async () => {
    const w = world();
    w.chain.feeds.set(USDC_USD_FEED, null); // BOLD's reference feed reverts and BOLD was never priced
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await transfer(w, BOLD, USER_EOA, SAFE_CL, 700n * ONE_ETH, []);
    expect(await field(w, SAFE_CL, "totalInUsd")).toBe("0");
    expect((await funding(w, SAFE_CL)).fundingInTxs).toEqual([hash(0x75)]);
  });
});

describe("withdrawals to contracts are decided by the receipt", () => {
  const safeReceivedLog = (safe: string) => ({ address: safe, topics: [SAFE_RECEIVED_TOPIC, topic(WETH)] });

  it("a swap whose only return is the Safe's own SafeReceived (native ETH) is not a withdrawal", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    await transfer(w, USDC_NATIVE, SAFE_CL, SOME_CONTRACT, 5_000_000n, [safeReceivedLog(SAFE_CL)]);
    expect(await w.cache.get(FundingBalance, SAFE_CL)).toBeUndefined();
  });

  it("a SafeReceived emitted by another address does not count as a return", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    await transfer(w, USDC_NATIVE, SAFE_CL, SOME_CONTRACT, 5_000_000n, [safeReceivedLog(OTHER_SAFE)]);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("5");
  });

  it("an outflow to the user's EOA is a withdrawal even when the tx also returns tokens to the Safe", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    const receipt = [{ address: USDC_NATIVE, topics: [TRANSFER_TOPIC, topic(CL_POOL), topic(SAFE_CL)] }];
    await transfer(w, USDC_NATIVE, SAFE_CL, USER_EOA, 5_000_000n, receipt);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("5");
  });

  it("an outflow to a contract with no receipt throws (the stream always carries it)", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    await expect(transfer(w, USDC_NATIVE, SAFE_CL, SOME_CONTRACT, 5_000_000n, null)).rejects.toThrow(/has no receipt/);
  });

  it("an outflow to the user side needs no receipt", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await transfer(w, USDC_NATIVE, SAFE_CL, USER_EOA, 5_000_000n, null);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("5");
  });

  it("EIP-7702 wallet, nothing back to the Safe (0xf2a832e7): withdrawal", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_7702);
    seedAddressType(w, WALLET_7702, true, false);
    await transfer(w, USDC_NATIVE, SAFE_7702, WALLET_7702, 231_883_683n, fx.RECEIPT_7702_0XF2A832E7);
    expect(await field(w, SAFE_7702, "totalWithdrawnUsd")).toBe("231.883683");
  });

  it("CL entry, position NFT back to the Safe (0x6d10752f): not a withdrawal", async () => {
    const w = tokenWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, CL_POOL, true, false);
    expect(fx.RECEIPT_CL_ENTRY_0X6D10752F).toHaveLength(18);
    await transfer(w, USDC_NATIVE, SAFE_CL, CL_POOL, 453_135n, fx.RECEIPT_CL_ENTRY_0X6D10752F);
    expect(await w.cache.get(FundingBalance, SAFE_CL)).toBeUndefined();
  });
});

describe("RegisterInstance records the agent EOAs", () => {
  it("every agentInstance of a service is kept, once, and copied to the Service", async () => {
    const w = world();
    const second = addr(0xa2);
    const reg = (agentInstance: string, logIndex: number) =>
      h.handleRegisterInstance(w.ctx, meta({ logIndex }), { operator: OPERATOR_SAFE, serviceId: 607n, agentInstance, agentId: 115n });
    await reg(AGENT_INSTANCE, 1);
    await reg(AGENT_INSTANCE, 2);
    await h.handleCreateMultisigWithAgents(w.ctx, meta({ logIndex: 3 }), { serviceId: 607n, multisig: SAFE_CL });
    await reg(second, 4);
    expect((await w.cache.get(ServiceRegistration, serviceKey(607n)))!.agentInstances).toEqual([AGENT_INSTANCE, second]);
    expect(serviceKey(607n)).toBe("0x363037");
    expect((await w.cache.get(Service, SAFE_CL))!.agentInstances).toEqual([AGENT_INSTANCE, second]);
  });
});

describe("ETH funding uses the same user-side rule", () => {
  function ethWorld() {
    const w = world();
    seedTokenPrice(w, WETH, "WETH", 18, "2000");
    return w;
  }

  it("ETH from the user's EOA is funding", async () => {
    const w = ethWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await received(w, SAFE_CL, USER_EOA, HALF_ETH);
    expect(await field(w, SAFE_CL, "totalInUsd")).toBe("1000");
  });

  it("ETH from a non-Safe contract or the agent EOA is not funding but still raises the ETH balance", async () => {
    const w = ethWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    seedAddressType(w, AGENT_INSTANCE, false, false);
    await received(w, SAFE_CL, SOME_CONTRACT, HALF_ETH);
    await received(w, SAFE_CL, AGENT_INSTANCE, HALF_ETH);
    expect(await w.cache.get(FundingBalance, SAFE_CL)).toBeUndefined();
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
  });

  it("ETH funding is valued at WETH's price, as its token balance is", async () => {
    const w = ethWorld();
    // The ETH/USD feed answers $2000; WETH's own price is $2500
    seedTokenPrice(w, WETH, "WETH", 18, "2500");
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await received(w, SAFE_CL, USER_EOA, ONE_ETH);
    expect(await field(w, SAFE_CL, "totalInUsd")).toBe("2500");
  });

  it("ETH the Safe sends to the user's EOA in execTransaction is a withdrawal", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, fx.EXEC_ETH_TO_USER, 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
  });

  it("ETH the Safe tops the agent EOA up with is a cost, not a withdrawal", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, fx.EXEC_ETH_TO_AGENT, 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("each Call in a MultiSend the Safe delegatecalls is read", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    await execution(w, SAFE_CL, fx.EXEC_MULTISEND, 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("0.25");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
  });

  it("the executor's own tx value is not ETH the Safe sends", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, fx.EXEC_NO_VALUE, HALF_ETH, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("truncated execTransaction calldata is ignored", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, fx.EXEC_TRUNCATED, 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
  });

  it("a module execution's ETH is not read from the outer tx", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await h.handleExecutionFromModuleSuccess(w.ctx, at(SAFE_CL), { module: SOME_CONTRACT });
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("an execTransaction that also runs a module execution on the Safe is counted once", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await h.handleExecutionFromModuleSuccess(w.ctx, at(SAFE_CL), { module: SOME_CONTRACT });
    await execution(w, SAFE_CL, fx.EXEC_ETH_TO_USER, 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
  });

  it("ETH sent to the operator Safe is counted once, though both Safes' events see it", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await received(w, OPERATOR_SAFE, SAFE_CL, HALF_ETH, { to: SAFE_CL, input: fx.EXEC_ETH_TO_OPERATOR });
    await execution(w, SAFE_CL, fx.EXEC_ETH_TO_OPERATOR, 0n, null);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
  });

  it("ETH to the operator Safe through a relayed execTransaction is counted from its SafeReceived", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await received(w, OPERATOR_SAFE, SAFE_CL, HALF_ETH, { to: OTHER_SAFE, input: fx.EXEC_ETH_TO_OPERATOR });
    await execution(w, SAFE_CL, fx.EXEC_ETH_TO_OPERATOR, 0n, null, { to: OTHER_SAFE });
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
  });

  it("an execTransaction the tx sends to another address is not read as the Safe's", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, fx.EXEC_ETH_TO_USER, 0n, null, { to: OPERATOR_SAFE });
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("a packed DELEGATECALL's value field moves no ETH", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, fx.EXEC_MULTISEND_DELEGATECALL_VALUE, 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("a DELEGATECALL to something other than MultiSend is not read", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, withDelegatecallSelector(fx.EXEC_MULTISEND, "deadbeef"), 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("an operation other than Call or DelegateCall is not read", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, withOperation(fx.EXEC_MULTISEND, 2), 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("a data offset or MultiSend length past the calldata is skipped", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    await execution(w, SAFE_CL, fx.EXEC_BAD_DATA_OFFSET, 0n, null);
    await execution(w, SAFE_CL, fx.EXEC_BAD_MULTISEND_LENGTH, 0n, null);
    expect(await ethBalance(w, SAFE_CL)).toBe("1");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("ETH the Safe wraps into WETH is not a withdrawal", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, WETH, true, false);
    // WETH9.deposit() emits Deposit(dst = Safe, wad), not a Transfer
    await execution(w, SAFE_CL, execCallTo(WETH), 0n, [{ address: WETH, topics: [WETH_DEPOSIT_TOPIC, topic(SAFE_CL)] }]);
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("a Deposit log not emitted by WETH is not a return", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, WETH, true, false);
    await execution(w, SAFE_CL, execCallTo(WETH), 0n, [{ address: SOME_CONTRACT, topics: [WETH_DEPOSIT_TOPIC, topic(SAFE_CL)] }]);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
  });

  it("a WETH Deposit for another address is not a return", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, WETH, true, false);
    await execution(w, SAFE_CL, execCallTo(WETH), 0n, [{ address: WETH, topics: [WETH_DEPOSIT_TOPIC, topic(OTHER_SAFE)] }]);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
  });

  it("ETH sent to a contract that sends nothing back to the Safe is a withdrawal", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, SOME_CONTRACT, true, false);
    await execution(w, SAFE_CL, execCallTo(SOME_CONTRACT), 0n, []);
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
  });

  it("the LiFi swap with no USDT back to the Safe is a withdrawal", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, LIFI_DIAMOND, true, false);
    await execution(w, SAFE_CL, fx.EXEC_LIFI_SWAP_0XE843, 0n, fx.RECEIPT_LIFI_NO_USDT_BACK);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("5.548869277816");
  });

  it("ETH a relayed execution sends to another Safe is a withdrawal, from that Safe's SafeReceived", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, OTHER_SAFE, true, true);
    await received(w, OTHER_SAFE, SAFE_CL, HALF_ETH, { to: SOME_CONTRACT });
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
    expect(await ethBalance(w, SAFE_CL)).toBe("0.5");
  });

  it("ETH swapped through LiFi with USDT back to the Safe (Optimism 0xe843e2fa calldata): not a withdrawal", async () => {
    const w = ethWorld();
    await fundOneEth(w, SAFE_CL);
    seedAddressType(w, LIFI_DIAMOND, true, false);
    await execution(w, SAFE_CL, fx.EXEC_LIFI_SWAP_0XE843, 0n, fx.RECEIPT_LIFI_USDT_BACK_0XE843E2FA);
    expect(await ethBalance(w, SAFE_CL)).toBe("0.997225565361092");
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("0");
  });

  it("ETH to the operator Safe is a withdrawal and leaves the initial value alone", async () => {
    const w = ethWorld();
    seedService(w, SAFE_CL);
    seedAddressType(w, USER_EOA, false, false);
    await received(w, SAFE_CL, USER_EOA, ONE_ETH);
    await received(w, OPERATOR_SAFE, SAFE_CL, HALF_ETH);
    expect(await field(w, SAFE_CL, "totalWithdrawnUsd")).toBe("1000");
    expect(await field(w, SAFE_CL, "netUsd")).toBe("2000");
  });
});
