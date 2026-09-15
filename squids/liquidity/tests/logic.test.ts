import { describe, expect, it } from "vitest";
import { balancerFee, poolAddressFromPoolId, subtractClamped, uniswapV2Fee } from "../src/logic";

describe("fees", () => {
  it("uniswap v2 takes 0.3% floored", () => {
    expect(uniswapV2Fee(1000n)).toBe(3n);
    expect(uniswapV2Fee(999n)).toBe(2n);
    expect(uniswapV2Fee(0n)).toBe(0n);
  });
  it("balancer scales by the 18-decimal fee percentage", () => {
    expect(balancerFee(1000n * 10n ** 18n, 10n ** 16n)).toBe(10n * 10n ** 18n); // 1%
    expect(balancerFee(10n ** 18n, 3n * 10n ** 15n)).toBe(3n * 10n ** 15n); // 0.3%
  });
});

describe("subtractClamped", () => {
  it("clamps and flags", () => {
    expect(subtractClamped(5n, 3n)).toEqual({ value: 2n, clamped: false });
    expect(subtractClamped(5n, 7n)).toEqual({ value: 0n, clamped: true });
  });
});

describe("poolAddressFromPoolId", () => {
  it("takes the first 20 bytes, lowercased", () => {
    expect(poolAddressFromPoolId("0x5332584890D6E415a6dc910254d6430b8aab7e69000200000000000000000103")).toBe(
      "0x5332584890d6e415a6dc910254d6430b8aab7e69",
    );
  });
});
