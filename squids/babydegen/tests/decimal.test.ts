import { describe, expect, it } from "vitest";
import { BigDecimal } from "@subsquid/big-decimal";
import { countDecimalDigits, GD, gd, pow10, roundingTerm } from "../src/decimal";

const s = (x: GD) => x.toFixed();

describe("graph-node BigDecimal (bigdecimal 0.1.2 + normalized())", () => {
  it("parses like from_str and normalizes like graph-node", () => {
    expect(GD.parse("1.50")).toMatchObject({ int: 150n, scale: 2 });
    expect(GD.parse("1e18")).toMatchObject({ int: 1n, scale: -18 });
    expect(gd("1.0")).toMatchObject({ int: 1n, scale: 0 });
    expect(gd("1000")).toMatchObject({ int: 1n, scale: -3 });
    expect(s(gd("1e18"))).toBe("1000000000000000000");
    expect(s(pow10(6))).toBe("1000000");
    expect(s(gd("0.000001"))).toBe("0.000001");
    expect(gd("0")).toMatchObject({ int: 0n, scale: 0 });
  });

  it("rounds positives half-up at 34 significant digits on every operation", () => {
    expect(s(gd("2").div(gd("3")))).toBe("0.6666666666666666666666666666666667");
    expect(s(gd("1").div(gd("3")))).toBe("0.3333333333333333333333333333333333");
    // same figures as squids/marketplace (verified against graph-node there)
    const third = gd("1000000").div(gd("3000000"));
    expect(s(gd("1000").plus(third))).toBe("1000.333333333333333333333333333333");
    // exact tie at digit 35 rounds up
    expect(s(GD.raw(BigInt("1" + "0".repeat(33) + "5"), 34).normalized())).toBe("1." + "0".repeat(32) + "1");
    expect(s(GD.raw(BigInt("1" + "0".repeat(33) + "49"), 35).normalized())).toBe("1");
  });

  it("truncates negatives and lets them keep a 35th digit (count_decimal_digits never corrects a negative)", () => {
    // 100-digit quotient 666…67; the digit estimate for the negative is 99, so 65 digits go and 35 stay
    expect(s(gd("-2").div(gd("3")))).toBe("-0." + "6".repeat(35));
    expect(s(gd("0").minus(gd("2").div(gd("3"))))).toBe("-0.6666666666666666666666666666666667");
    expect(countDecimalDigits(-123n)).toBe(2);
    expect(countDecimalDigits(123n)).toBe(3);
    expect(countDecimalDigits(0n)).toBe(1);
  });

  it("get_rounding_term is 1 exactly when the leading digit is >= 5", () => {
    for (const [n, t] of [[0n, 0n], [4n, 0n], [5n, 1n], [9n, 1n], [12n, 0n], [49n, 0n], [50n, 1n], [999n, 1n], [1000n, 0n], [65536n, 1n]] as const) {
      expect(roundingTerm(n)).toBe(t);
    }
  });

  it("keeps exact sums and products under 34 digits", () => {
    expect(s(gd("0.1").plus(gd("0.2")))).toBe("0.3");
    expect(s(gd("1.5").times(gd("3000")))).toBe("4500");
    expect(s(GD.fromBigInt(1234567n).div(gd("1e6")))).toBe("1.234567");
    expect(s(gd("5").minus(gd("7.25")))).toBe("-2.25");
  });

  it("divides like the subgraph's amount idioms", () => {
    // 1 wei of ETH at $3000.12345678
    const usd = GD.fromBigInt(1n).times(gd("3000.12345678")).div(gd("1e18"));
    expect(s(usd)).toBe("0.00000000000000300012345678");
    // 10/7 has a repeating expansion: 34 digits, half-up
    expect(s(gd("10").div(gd("7")))).toBe("1.428571428571428571428571428571429");
  });

  it("compares exact values", () => {
    expect(gd("0.95").lt(gd("0.950000001"))).toBe(true);
    expect(gd("1").equals(gd("1.000"))).toBe(true);
    expect(gd("-1").le(GD.ZERO)).toBe(true);
    expect(() => gd("1").div(GD.ZERO)).toThrow(/divide by zero/);
  });

  it("round-trips the store with Postgres' display scale", () => {
    const x = gd("2").div(gd("3"));
    expect(s(GD.fromStore(x.toStore()))).toBe(s(x));
    expect(GD.fromStore(BigDecimal("1000"))).toMatchObject({ int: 1000n, scale: 0 });
    expect(GD.fromStore(BigDecimal("1000")).plus(GD.ZERO)).toMatchObject({ int: 1n, scale: -3 });
  });
});
