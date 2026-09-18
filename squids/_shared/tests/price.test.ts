import { describe, expect, it } from "vitest";
import { fixedPrice, poolPrice, stableToUsd, toUsd, NO_PRICE_SOURCE } from "../src/price";
import { dayTimestamp, eventMeta, lastBlock, logId } from "../src/time";
import { selectChain } from "../src/chain";

const TWO_K = { answer: 2_000_00000000n, decimals: 8 }; // $2,000 with 8 decimals

describe("toUsd / stableToUsd", () => {
  it("prices a native amount via a fixed-point feed answer", () => {
    // 0.01 ETH at $2,000 = $20
    expect(toUsd(10n ** 16n, 18, TWO_K).toString()).toBe("20");
    // 1 wei stays a tiny nonzero number
    expect(toUsd(1n, 18, TWO_K).gt(0)).toBe(true);
  });
  it("prices a 6-decimal stablecoin at 1:1", () => {
    expect(stableToUsd(1_500_000n, 6).toString()).toBe("1.5");
  });
  it("fixedPrice and NO_PRICE_SOURCE behave as sources", async () => {
    expect(await fixedPrice(5n, 0).usdAt(1n)).toEqual({ answer: 5n, decimals: 0 });
    expect(await NO_PRICE_SOURCE.usdAt(1n)).toBeNull();
  });
});

describe("poolPrice", () => {
  const OLAS = "0x0000000000000000000000000000000000000001";
  const USDC = "0x0000000000000000000000000000000000000002";
  it("returns quote per base, decimals-adjusted, regardless of token order", () => {
    // 1,000 OLAS (18d) against 500 USDC (6d) -> $0.5 per OLAS
    const r1 = { tokens: [OLAS, USDC], balances: [1_000n * 10n ** 18n, 500n * 10n ** 6n] };
    expect(poolPrice(r1, OLAS, 18, USDC, 6)!.toString()).toBe("0.5");
    const r2 = { tokens: [USDC, OLAS], balances: [500n * 10n ** 6n, 1_000n * 10n ** 18n] };
    expect(poolPrice(r2, OLAS, 18, USDC, 6)!.toString()).toBe("0.5");
  });
  it("is null on a zero reserve or a missing token", () => {
    expect(poolPrice({ tokens: [OLAS, USDC], balances: [0n, 1n] }, OLAS, 18, USDC, 6)).toBeNull();
    expect(poolPrice({ tokens: [OLAS], balances: [1n] }, OLAS, 18, USDC, 6)).toBeNull();
  });
});

describe("time", () => {
  it("dayTimestamp floors to UTC midnight", () => {
    expect(dayTimestamp(1_788_900_000n)).toBe(1_788_825_600n);
  });
  it("eventMeta converts ms to s and lowercases addresses", () => {
    const m = eventMeta(
      { number: 5, timestamp: 1_788_900_000_999 },
      { address: "0xABC", transactionHash: "0xTX", logIndex: 3, transaction: { from: "0xFROM", to: null } }
    );
    expect(m).toEqual({
      blockNumber: 5n,
      blockTimestamp: 1_788_900_000n,
      txHash: "0xTX",
      logIndex: 3,
      address: "0xabc",
      txFrom: "0xfrom",
      txTo: null,
    });
    expect(logId(m)).toBe("0xTX-3");
  });
  it("lastBlock takes the batch's last header, ms -> s, null when empty", () => {
    expect(lastBlock([])).toBeNull();
    expect(lastBlock([{ header: { number: 1, timestamp: 1000 } }, { header: { number: 7, timestamp: 1_788_900_000_500 } }])).toEqual({
      number: 7n,
      timestamp: 1_788_900_000n,
    });
  });
});

describe("selectChain", () => {
  const table = { robinhood: { name: "robinhood", x: 1 }, base: { name: "base", x: 2 } };
  it("reads the env var, defaults, and rejects unknown names", () => {
    delete process.env.TEST_CHAIN;
    expect(selectChain("TEST_CHAIN", table, "robinhood").x).toBe(1);
    process.env.TEST_CHAIN = " base ";
    expect(selectChain("TEST_CHAIN", table, "robinhood").x).toBe(2);
    process.env.TEST_CHAIN = "celo";
    expect(() => selectChain("TEST_CHAIN", table, "robinhood")).toThrow(/Known chains: robinhood, base/);
    delete process.env.TEST_CHAIN;
  });
});
