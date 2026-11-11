import { describe, expect, it } from "vitest";
import { ETH_USD_FEED, USDC_NATIVE, WETH } from "../src/constants";
import * as h from "../src/handlers";
import { ETH_ADDRESS, SERVICE_REGISTRY_ID, serviceKey, tokenBalanceId } from "../src/ids";
import {
  AddressType,
  AgentPortfolio,
  FundingBalance,
  SafeDataSource,
  Service,
  ServiceIndex,
  ServiceRegistration,
  ServiceRegistry,
  TokenBalance,
} from "../src/model";
import { addr, hash, meta, setup, tx } from "./helpers";

const OPERATOR = addr(0x0a);
const SAFE = addr(0x5a);
const EOA = addr(0xe0);
const CONTRACT = addr(0xc0);
const USDC = (n: number) => BigInt(Math.round(n * 1e6));

const AGENT = addr(0xa1);

async function registerBasius(ctx: h.Ctx, serviceId = 607n, safe = SAFE, operator = OPERATOR) {
  await h.handleRegisterInstance(ctx, meta({ logIndex: 1 }), { operator, serviceId, agentInstance: AGENT, agentId: 115n });
  await h.handleCreateMultisigWithAgents(ctx, meta({ logIndex: 2, txHash: hash(2) }), { serviceId, multisig: safe });
}

describe("service discovery", () => {
  it("tracks an agentId-115 service: Service, index, portfolio, snapshot registry and two Safe instances", async () => {
    const { ctx, cache } = setup();
    await registerBasius(ctx);
    const key = serviceKey(607n);
    expect(key).toBe("0x363037");
    expect(await cache.get(ServiceRegistration, key)).toMatchObject({ serviceId: 607n, operatorSafe: OPERATOR });
    expect(await cache.get(Service, SAFE)).toMatchObject({
      serviceId: 607n,
      operatorSafe: OPERATOR,
      serviceSafe: SAFE,
      positionIds: [],
      isActive: true,
      latestMultisigTxHash: hash(2),
    });
    expect((await cache.get(ServiceIndex, key))!.currentServiceSafe).toBe(SAFE);
    const portfolio = (await cache.get(AgentPortfolio, SAFE))!;
    expect(portfolio.firstTradingTimestamp).toBe(1_781_000_000n);
    expect(portfolio.firstFundingEthPrice.toFixed()).toBe("3000");
    expect((await cache.get(ServiceRegistry, SERVICE_REGISTRY_ID))!.serviceAddresses).toEqual([SAFE]);
    expect(cache.all(SafeDataSource).map((s) => s.id)).toEqual([SAFE, OPERATOR]);
    expect(ctx.spawnedSafes).toEqual([SAFE, OPERATOR]);
    expect(ctx.newServices).toEqual([SAFE]);
  });

  it("ignores other agents and services without a Basius registration", async () => {
    const { ctx, cache } = setup();
    await h.handleRegisterInstance(ctx, meta(), { operator: OPERATOR, serviceId: 1n, agentInstance: AGENT, agentId: 9n });
    await h.handleCreateMultisigWithAgents(ctx, meta(), { serviceId: 1n, multisig: SAFE });
    expect(cache.all(Service)).toHaveLength(0);
    expect(ctx.spawnedSafes).toEqual([]);
  });

  it("a re-deployed multisig only updates the Service; a shared operator is not instantiated twice", async () => {
    const { ctx, cache } = setup();
    await registerBasius(ctx);
    ctx.spawnedSafes.length = 0;
    const NEW_OPERATOR = addr(0x0b);
    await h.handleRegisterInstance(ctx, meta({ blockTimestamp: 1_781_100_000n }), {
      operator: NEW_OPERATOR,
      serviceId: 607n,
      agentInstance: AGENT,
      agentId: 115n,
    });
    expect((await cache.get(Service, SAFE))!.operatorSafe).toBe(NEW_OPERATOR);
    await h.handleCreateMultisigWithAgents(ctx, meta({ blockTimestamp: 1_781_200_000n }), { serviceId: 607n, multisig: SAFE });
    expect((await cache.get(Service, SAFE))!.latestMultisigTimestamp).toBe(1_781_200_000n);
    expect(ctx.spawnedSafes).toEqual([]);
    // a second service on the original operator: only its own safe is new
    await registerBasius(ctx, 610n, addr(0x5b), OPERATOR);
    expect(ctx.spawnedSafes).toEqual([addr(0x5b)]);
    expect((await cache.get(ServiceRegistry, SERVICE_REGISTRY_ID))!.serviceAddresses).toEqual([SAFE, addr(0x5b)]);
  });
});

describe("funding and withdrawals (#175 rules, fuller cases in funding.test.ts)", () => {
  it("USDC from an EOA is funding at the USDC/USD price; the code check is cached in AddressType", async () => {
    const { ctx, cache } = setup();
    await registerBasius(ctx);
    const m = meta({ address: USDC_NATIVE, txHash: hash(9), blockNumber: 47_200_010n });
    await h.handleERC20Transfer(ctx, m, { from: EOA, to: SAFE, value: USDC(100.5) }, tx(), null);
    const fb = (await cache.get(FundingBalance, SAFE))!;
    expect(fb.totalInUsd.toFixed()).toBe("100.5");
    expect(fb.netUsd.toFixed()).toBe("100.5");
    expect(fb.fundingInTxs).toEqual([hash(9)]);
    expect(fb.firstInTimestamp).toBe(m.blockTimestamp);
    expect(await cache.get(AddressType, EOA)).toMatchObject({ isContract: false, isSafe: false, checkedAt: 47_200_010n });
    const bal = (await cache.get(TokenBalance, tokenBalanceId(SAFE, USDC_NATIVE)))!;
    expect(bal).toMatchObject({ symbol: "USDC", decimals: 6, lastBlock: 47_200_010n });
    expect(bal.balance.toFixed()).toBe("100.5");
    expect(bal.balanceUSD.toFixed()).toBe("100.5");
  });

  it("USDC from a non-Safe contract is a balance change only (the contract still gets an AddressType row)", async () => {
    const { ctx, cache, chain } = setup();
    chain.contracts.add(CONTRACT);
    await registerBasius(ctx);
    await h.handleERC20Transfer(ctx, meta({ address: USDC_NATIVE }), { from: CONTRACT, to: SAFE, value: USDC(5) }, tx(), null);
    expect(await cache.get(FundingBalance, SAFE)).toBeUndefined();
    expect(await cache.get(AddressType, CONTRACT)).toMatchObject({ isContract: true, isSafe: false });
    expect((await cache.get(TokenBalance, tokenBalanceId(SAFE, USDC_NATIVE)))!.balance.toFixed()).toBe("5");
  });

  it("a contract that answers getThreshold() is a Safe, so the user side", async () => {
    const { ctx, cache, chain } = setup();
    chain.contracts.add(CONTRACT);
    chain.safes.add(CONTRACT);
    chain.safes.add(EOA); // no code: never a Safe, whatever getThreshold() says
    await registerBasius(ctx);
    await h.handleERC20Transfer(ctx, meta({ address: USDC_NATIVE }), { from: CONTRACT, to: SAFE, value: USDC(5) }, tx(), null);
    expect(await cache.get(AddressType, CONTRACT)).toMatchObject({ isContract: true, isSafe: true });
    expect((await cache.get(FundingBalance, SAFE))!.totalInUsd.toFixed()).toBe("5");
    expect((await h.getAddressType(ctx, EOA, meta())).isSafe).toBe(false);
  });

  it("USDC out to an EOA is a withdrawal (netUsd unchanged); the balance never goes below zero", async () => {
    const { ctx, cache } = setup();
    await registerBasius(ctx);
    await h.handleERC20Transfer(ctx, meta({ address: USDC_NATIVE }), { from: EOA, to: SAFE, value: USDC(10) }, tx(), null);
    await h.handleERC20Transfer(ctx, meta({ address: USDC_NATIVE, txHash: hash(3) }), { from: SAFE, to: EOA, value: USDC(12) }, tx(), null);
    const fb = (await cache.get(FundingBalance, SAFE))!;
    expect(fb.totalWithdrawnUsd.toFixed()).toBe("12");
    expect(fb.netUsd.toFixed()).toBe("10");
    expect(fb.totalOutUsd.toFixed()).toBe("0");
    expect(fb.fundingOutTxs).toEqual([]);
    expect((await cache.get(TokenBalance, tokenBalanceId(SAFE, USDC_NATIVE)))!.balance.toFixed()).toBe("0");
  });

  it("every tracked token is funding, valued at its own price", async () => {
    const { ctx, cache } = setup();
    await registerBasius(ctx);
    await h.handleERC20Transfer(ctx, meta({ address: WETH }), { from: EOA, to: SAFE, value: 2n * 10n ** 18n }, tx(), null);
    expect((await cache.get(FundingBalance, SAFE))!.totalInUsd.toFixed()).toBe("6000");
    const bal = (await cache.get(TokenBalance, tokenBalanceId(SAFE, WETH)))!;
    expect(bal.balanceUSD.toFixed()).toBe("6000");
  });

  it("first funding keeps the registration-time firstTradingTimestamp", async () => {
    const { ctx, cache } = setup();
    await registerBasius(ctx);
    await h.handleERC20Transfer(
      ctx,
      meta({ address: USDC_NATIVE, blockTimestamp: 1_781_500_000n }),
      { from: EOA, to: SAFE, value: 1n },
      tx(),
      null,
    );
    expect((await cache.get(AgentPortfolio, SAFE))!.firstTradingTimestamp).toBe(1_781_000_000n);
  });
});

describe("Safe events", () => {
  it("SafeReceived from the operator is ETH funding at WETH's price, with no AddressType lookup", async () => {
    const { ctx, cache, chain } = setup();
    await registerBasius(ctx);
    chain.contracts.add(OPERATOR);
    chain.feeds.set(ETH_USD_FEED, { answer: 3456_78900000n, updatedAt: 1_781_000_000n });
    await h.handleSafeReceived(ctx, meta({ address: SAFE, txHash: hash(4) }), { sender: OPERATOR, value: 5n * 10n ** 17n }, tx());
    const fb = (await cache.get(FundingBalance, SAFE))!;
    expect(fb.totalInUsd.toFixed()).toBe("1728.3945");
    expect(fb.fundingInTxs).toEqual([hash(4)]);
    expect(await cache.get(AddressType, OPERATOR)).toBeUndefined();
    const eth = (await cache.get(TokenBalance, tokenBalanceId(SAFE, ETH_ADDRESS)))!;
    expect(eth).toMatchObject({ symbol: "ETH", decimals: 18, token: ETH_ADDRESS });
    expect(eth.balance.toFixed()).toBe("0.5");
  });

  it("ETH from the service safe to its operator (seen on the operator's Safe instance) is a withdrawal", async () => {
    const { ctx, cache } = setup();
    await registerBasius(ctx);
    await h.handleSafeReceived(ctx, meta({ address: SAFE }), { sender: EOA, value: 10n ** 18n }, tx());
    await h.handleSafeReceived(ctx, meta({ address: OPERATOR, txHash: hash(5) }), { sender: SAFE, value: 4n * 10n ** 17n }, tx());
    const fb = (await cache.get(FundingBalance, SAFE))!;
    expect(fb.totalWithdrawnUsd.toFixed()).toBe("1200");
    expect(fb.totalOutUsd.toFixed()).toBe("0");
    expect(fb.netUsd.toFixed()).toBe("3000");
    expect(fb.fundingOutTxs).toEqual([]);
    expect((await cache.get(TokenBalance, tokenBalanceId(SAFE, ETH_ADDRESS)))!.balance.toFixed()).toBe("0.6");
  });
});
