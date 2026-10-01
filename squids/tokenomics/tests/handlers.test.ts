import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getMetadataArgsStorage } from "typeorm";
import {
  InMemoryCache,
  assertFlushOrderIsFkSafe,
  owningRelations,
  type EventMeta,
} from "@olas/squid-shared";
import { Token, TokenHolder, Transfer } from "../src/model";
import { CHAIN, ZERO_ADDRESS } from "../src/constants";
import { handleTransfer, eventId } from "../src/handlers";
import { dispatch } from "../src/dispatch";
import { FLUSH_ORDER } from "../src/entityCache";
import * as olas from "../src/abi/OLAS/events";

const alice = "0x" + "11".repeat(20);
const bob = "0x" + "22".repeat(20);
const carol = "0x" + "33".repeat(20);
function meta(index = 0): EventMeta {
  return {
    address: CHAIN.olas,
    blockNumber: BigInt(CHAIN.startBlock),
    blockTimestamp: 100n,
    txHash: "0x" + "aa".repeat(32),
    logIndex: index,
    txFrom: null,
    txTo: null,
  };
}
function setup() {
  const cache = new InMemoryCache();
  let logIndex = 0;
  return {
    cache,
    transfer: (from: string, to: string, amount: bigint) =>
      handleTransfer(cache, meta(logIndex++), { from, to, amount }),
  };
}

describe("OLAS balances and holders", () => {
  it("records mint supply, holder and raw event; never creates a zero-address holder", async () => {
    const { cache, transfer } = setup();
    await transfer(ZERO_ADDRESS, alice, 1000n);
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: 1000n,
      holderCount: 1,
    });
    expect(await cache.get(TokenHolder, alice)).toMatchObject({
      token: CHAIN.olas,
      balance: 1000n,
    });
    expect(await cache.get(TokenHolder, ZERO_ADDRESS)).toBeUndefined();
    expect(cache.all(Transfer)[0]).toMatchObject({
      id: eventId(meta()),
      from: ZERO_ADDRESS,
      to: alice,
      value: 1000n,
      blockNumber: BigInt(CHAIN.startBlock),
      blockTimestamp: 100n,
      transactionHash: meta().txHash,
    });
  });
  it("partial and full transfers adjust holder count without changing supply", async () => {
    const { cache, transfer } = setup();
    await transfer(ZERO_ADDRESS, alice, 1000n);
    await transfer(alice, bob, 400n);
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: 1000n,
      holderCount: 2,
    });
    await transfer(alice, bob, 600n);
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: 1000n,
      holderCount: 1,
    });
    expect(await cache.get(TokenHolder, alice)).toMatchObject({ balance: 0n });
    expect(await cache.get(TokenHolder, bob)).toMatchObject({ balance: 1000n });
  });
  it("burns reduce supply and remove a holder only when their balance reaches zero", async () => {
    const { cache, transfer } = setup();
    await transfer(ZERO_ADDRESS, alice, 1000n);
    await transfer(alice, ZERO_ADDRESS, 400n);
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: 600n,
      holderCount: 1,
    });
    await transfer(alice, ZERO_ADDRESS, 600n);
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: 0n,
      holderCount: 0,
    });
    expect(await cache.get(TokenHolder, ZERO_ADDRESS)).toBeUndefined();
  });
  it("counts repeated mints and returning zero-balance holders correctly", async () => {
    const { cache, transfer } = setup();
    await transfer(ZERO_ADDRESS, alice, 100n);
    await transfer(ZERO_ADDRESS, alice, 100n);
    await transfer(alice, bob, 200n);
    await transfer(ZERO_ADDRESS, alice, 50n);
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: 250n,
      holderCount: 2,
    });
  });
  it.each([40n, 100n])(
    "self-transfer of %s leaves balance and count unchanged",
    async (amount) => {
      const { cache, transfer } = setup();
      await transfer(ZERO_ADDRESS, alice, 100n);
      await transfer(alice, alice, amount);
      expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
        balance: 100n,
        holderCount: 1,
      });
      expect(await cache.get(TokenHolder, alice)).toMatchObject({
        balance: 100n,
      });
      expect(cache.all(Transfer)).toHaveLength(2);
    },
  );
  it("zero-value transfers retain zero-balance rows but do not count them as holders", async () => {
    const { cache, transfer } = setup();
    await transfer(alice, bob, 0n);
    await transfer(ZERO_ADDRESS, carol, 0n);
    expect(cache.all(TokenHolder)).toHaveLength(3);
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: 0n,
      holderCount: 0,
    });
  });
  it("preserves precision above Number.MAX_SAFE_INTEGER across multiple in-batch transfers", async () => {
    const { cache, transfer } = setup();
    const amount = 10n ** 30n + 3n;
    await transfer(ZERO_ADDRESS, alice, amount);
    await transfer(alice, bob, amount - 1n);
    await transfer(bob, carol, amount - 2n);
    expect(await cache.get(TokenHolder, alice)).toMatchObject({ balance: 1n });
    expect(await cache.get(TokenHolder, bob)).toMatchObject({ balance: 1n });
    expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
      balance: amount,
      holderCount: 3,
    });
    expect(
      cache
        .all(TokenHolder)
        .reduce((total, holder) => total + holder.balance, 0n),
    ).toBe(amount);
  });
});

it("decodes the real Robinhood deployment mint using the shared OLAS ABI", async () => {
  const log = JSON.parse(
    readFileSync(
      new URL("./fixtures/initial-mint.json", import.meta.url),
      "utf8",
    ),
  );
  const cache = new InMemoryCache();
  await dispatch(
    cache,
    { ...meta(), txHash: log.transactionHash, logIndex: Number(log.logIndex) },
    log,
  );
  expect(await cache.get(Token, CHAIN.olas)).toMatchObject({
    balance: 10n ** 18n,
    holderCount: 1,
  });
  expect(
    await cache.get(TokenHolder, "0xeb2a22b27c7ad5eee424fd90b376c745e60f914e"),
  ).toMatchObject({ balance: 10n ** 18n });
});
it("filters unrelated emitters/topics and rejects a malformed OLAS Transfer", async () => {
  const cache = new InMemoryCache();
  await dispatch(
    cache,
    { ...meta(), address: alice },
    { topics: [olas.Transfer.topic], data: "0x" },
  );
  await dispatch(cache, meta(), { topics: ["0x"], data: "0x" });
  expect(cache.all(Transfer)).toHaveLength(0);
  await expect(
    dispatch(cache, meta(), { topics: [olas.Transfer.topic], data: "0x" }),
  ).rejects.toThrow();
});
it("retains graph-ts event IDs and includes every model in FK-safe flush order", () => {
  expect(eventId(meta(258))).toBe(meta().txHash + "02010000");
  expect(() =>
    assertFlushOrderIsFkSafe(
      FLUSH_ORDER,
      owningRelations(getMetadataArgsStorage()),
    ),
  ).not.toThrow();
});

it("rejects a transfer that would create a negative holder balance", async () => {
  const { transfer } = setup();
  await expect(transfer(alice, bob, 1n)).rejects.toThrow(
    "balance would become negative",
  );
});
