import { describe, expect, it } from "vitest";
import { NO_PRICE_SOURCE, convertFeeToUsd } from "../src/fee";
import { TWO_K_USD } from "./inMemoryCache";

const warnings: string[] = [];
const log = { warn: (m: string) => warnings.push(m) };

describe("convertFeeToUsd", () => {
  it("prices NATIVE via the feed answer at the feed's decimals", async () => {
    // 0.01 ETH at $2,000 = $20
    const usd = await convertFeeToUsd(10n ** 16n, "NATIVE", 1n, TWO_K_USD, log);
    expect(usd.toString()).toBe("20");
    // 1 wei stays a tiny nonzero number, not 0
    const tiny = await convertFeeToUsd(1n, "NATIVE", 1n, TWO_K_USD, log);
    expect(tiny.gt(0)).toBe(true);
  });

  it("prices USDC at 1:1 with 6 decimals", async () => {
    const usd = await convertFeeToUsd(1_500_000n, "USDC", 1n, NO_PRICE_SOURCE, log);
    expect(usd.toString()).toBe("1.5");
  });

  it("returns $0 with a warning when no native price is available", async () => {
    warnings.length = 0;
    const usd = await convertFeeToUsd(10n ** 18n, "NATIVE", 1n, NO_PRICE_SOURCE, log);
    expect(usd.toString()).toBe("0");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/price unavailable/);
  });

  it("returns $0 with a warning for TOKEN and CREDITS on this chain", async () => {
    warnings.length = 0;
    expect((await convertFeeToUsd(10n ** 18n, "TOKEN", 1n, TWO_K_USD, log)).toString()).toBe("0");
    expect((await convertFeeToUsd(10n ** 18n, "CREDITS", 1n, TWO_K_USD, log)).toString()).toBe("0");
    expect(warnings).toHaveLength(2);
  });

  it("passes the block number through to the price source", async () => {
    const seen: bigint[] = [];
    const src = {
      usdPerNative: async (b: bigint) => {
        seen.push(b);
        return { answer: 100_000_000n, decimals: 8 };
      },
    };
    await convertFeeToUsd(10n ** 18n, "NATIVE", 59_600_123n, src, log);
    expect(seen).toEqual([59_600_123n]);
  });
});
