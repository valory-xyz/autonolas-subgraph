// graph-node BigDecimal, bit for bit.
//
// graph-node wraps bigdecimal 0.1.2 and normalizes every value that enters
// or leaves the host (`BigDecimal::new`, `From<OldBigDecimal>`): round to 34
// significant digits with `with_prec(34)`, then strip trailing zeros. A
// mapping's `a.plus(b)` therefore normalizes a, b and the result. Ported
// from bigdecimal-0.1.2/src/lib.rs (`with_prec`, `get_rounding_term`,
// `impl_division`, `count_decimal_digits`, Add/Sub/Mul/Div) and
// graph/src/data/store/scalar/bigdecimal.rs (`normalized`).
//
// Two quirks of that code are reproduced on purpose, since they decide the
// last digit a consumer sees:
// - positives round half-up on the first dropped digit;
// - negatives are TRUNCATED toward zero, and their digit count is the
//   bit-length estimate without the correction loop (`int >= 10^d` is never
//   true for a negative int), so a negative can keep 35 significant digits.
// The representation (int, scale) is tracked exactly, as bigdecimal does,
// because that estimate depends on trailing zeros in the int.

import { BigDecimal as SqdDecimal } from "@subsquid/big-decimal";

const MAX_SIGNIFICANT_DIGITS = 34;
const MAX_DIVISION_PRECISION = 100;
const LOG2_10 = 3.3219280949;

const tenTo = (n: number): bigint => 10n ** BigInt(n);
const abs = (x: bigint): bigint => (x < 0n ? -x : x);
/** num-bigint `bits()`: bit length of the magnitude, 0 for 0. */
const bits = (x: bigint): number => (x === 0n ? 0 : abs(x).toString(2).length);

/** bigdecimal 0.1.2 `count_decimal_digits` (signed compare included). */
export function countDecimalDigits(int: bigint): number {
  if (int === 0n) return 1;
  let digits = Math.floor(bits(int) / LOG2_10);
  let num = tenTo(digits);
  while (int >= num) {
    num *= 10n;
    digits += 1;
  }
  return digits;
}

/** bigdecimal 0.1.2 `get_rounding_term`: 1 when the leading digit is >= 5. */
export function roundingTerm(num: bigint): bigint {
  if (num === 0n) return 0n;
  let n = tenTo(Math.floor(bits(num) / LOG2_10));
  for (;;) {
    if (num < n) return 1n;
    n *= 5n;
    if (num < n) return 0n;
    n *= 2n;
  }
}

/** graph-node's BigDecimal: value = int × 10^-scale. Immutable. */
export class GD {
  private constructor(
    readonly int: bigint,
    readonly scale: number,
  ) {}

  /** Raw representation, no normalization (bigdecimal `BigDecimal::new`). */
  static raw(int: bigint, scale: number): GD {
    return new GD(int, scale);
  }

  static readonly ZERO = new GD(0n, 0);

  /** graph-ts `BigInt.toBigDecimal()` (normalized on first host use). */
  static fromBigInt(n: bigint): GD {
    return new GD(n, 0).normalized();
  }

  /** graph-ts `BigDecimal.fromString`: bigdecimal `from_str`, then normalized. */
  static fromString(s: string): GD {
    return GD.parse(s).normalized();
  }

  /**
   * bigdecimal `from_str_radix` without normalizing: "1.50" is (150, 2),
   * "1e18" is (1, -18). Also how a value comes back from Postgres (diesel's
   * PgNumeric keeps the column's display scale), see {@link GD.fromStore}.
   */
  static parse(s: string): GD {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.trim());
    if (m == null || (m[2] === "" && (m[3] ?? "") === "")) {
      throw new Error(`not a decimal: ${JSON.stringify(s)}`);
    }
    const frac = m[3] ?? "";
    const digits = BigInt((m[2] || "0") + frac);
    const exp = m[4] == null ? 0 : Number(m[4]);
    return new GD(m[1] === "-" ? -digits : digits, frac.length - exp);
  }

  /** A stored entity field. Postgres returns the written display scale. */
  static fromStore(x: SqdDecimal): GD {
    return GD.parse(x.toFixed());
  }

  /** For an entity field; the exact value as written. */
  toStore(): SqdDecimal {
    return SqdDecimal(this.toFixed());
  }

  /** Plain decimal notation of the exact value. */
  toFixed(): string {
    const neg = this.int < 0n;
    let digits = abs(this.int).toString();
    if (this.scale <= 0) {
      return (neg ? "-" : "") + (this.int === 0n ? "0" : digits + "0".repeat(-this.scale));
    }
    if (digits.length <= this.scale) digits = "0".repeat(this.scale - digits.length + 1) + digits;
    const point = digits.length - this.scale;
    return (neg ? "-" : "") + digits.slice(0, point) + "." + digits.slice(point);
  }

  toString(): string {
    return this.toFixed();
  }

  /** bigdecimal 0.1.2 `with_prec`. */
  withPrec(prec: number): GD {
    const digits = countDecimalDigits(this.int);
    if (digits > prec) {
      const diff = digits - prec;
      const p = tenTo(diff);
      let q = this.int / p; // num-bigint div_rem truncates toward zero, as JS does
      const r = this.int % p;
      // "check for leading zero in remainder term; otherwise round" — never
      // true for a negative remainder, so negatives truncate.
      if (p < 10n * r) q += roundingTerm(r);
      return new GD(q, this.scale - diff);
    }
    if (digits < prec) {
      const diff = prec - digits;
      return new GD(this.int * tenTo(diff), this.scale + diff);
    }
    return this;
  }

  /** graph-node `BigDecimal::normalized`. */
  normalized(): GD {
    if (this.int === 0n) return GD.ZERO;
    const rounded = this.withPrec(MAX_SIGNIFICANT_DIGITS);
    let int = rounded.int;
    let scale = rounded.scale;
    while (int % 10n === 0n) {
      int /= 10n;
      scale -= 1;
    }
    return new GD(int, scale);
  }

  private static align(a: GD, b: GD): [bigint, bigint, number] {
    if (a.scale === b.scale) return [a.int, b.int, a.scale];
    // take_and_scale: a zero int keeps 0 at the new scale
    if (a.scale < b.scale) return [a.int * tenTo(b.scale - a.scale), b.int, b.scale];
    return [a.int, b.int * tenTo(a.scale - b.scale), a.scale];
  }

  plus(other: GD): GD {
    const [x, y, scale] = GD.align(this.normalized(), other.normalized());
    return new GD(x + y, scale).normalized();
  }

  minus(other: GD): GD {
    const [x, y, scale] = GD.align(this.normalized(), other.normalized());
    return new GD(x - y, scale).normalized();
  }

  times(other: GD): GD {
    const a = this.normalized();
    const b = other.normalized();
    return new GD(a.int * b.int, a.scale + b.scale).normalized();
  }

  div(other: GD): GD {
    const a = this.normalized();
    const b = other.normalized();
    if (b.int === 0n) throw new Error("Cannot divide by zero-valued `BigDecimal`!");
    if (a.int === 0n || b.eqValue(ONE)) return a.normalized();
    const scale = a.scale - b.scale;
    if (a.int === b.int) return new GD(1n, scale).normalized();
    return divide(a.int, b.int, scale, MAX_DIVISION_PRECISION).normalized();
  }

  /** Exact comparison (graph-ts compares through a normalized minus). */
  cmp(other: GD): number {
    const d = this.minus(other).int;
    return d === 0n ? 0 : d > 0n ? 1 : -1;
  }

  private eqValue(other: GD): boolean {
    const [x, y] = GD.align(this, other);
    return x === y;
  }

  equals(o: GD): boolean {
    return this.cmp(o) === 0;
  }
  gt(o: GD): boolean {
    return this.cmp(o) > 0;
  }
  ge(o: GD): boolean {
    return this.cmp(o) >= 0;
  }
  lt(o: GD): boolean {
    return this.cmp(o) < 0;
  }
  le(o: GD): boolean {
    return this.cmp(o) <= 0;
  }
  isZero(): boolean {
    return this.int === 0n;
  }
}

const ONE = GD.raw(1n, 0);

/** bigdecimal 0.1.2 `impl_division`. */
function divide(num: bigint, den: bigint, scale: number, maxPrecision: number): GD {
  if (num === 0n) return GD.raw(0n, 0);
  if (num < 0n && den < 0n) return divide(-num, -den, scale, maxPrecision);
  if (num < 0n) return negate(divide(-num, den, scale, maxPrecision));
  if (den < 0n) return negate(divide(num, -den, scale, maxPrecision));
  while (num < den) {
    scale += 1;
    num *= 10n;
  }
  let quotient = num / den;
  let remainder = num % den;
  if (remainder === 0n) return GD.raw(quotient, scale);
  let precision = countDecimalDigits(quotient);
  remainder *= 10n;
  while (remainder !== 0n && precision < maxPrecision) {
    quotient = quotient * 10n + remainder / den;
    remainder = (remainder % den) * 10n;
    precision += 1;
    scale += 1;
  }
  if (remainder !== 0n) quotient += roundingTerm(remainder / den);
  return GD.raw(quotient, scale);
}

const negate = (x: GD): GD => GD.raw(-x.int, x.scale);

/** `BigDecimal.fromString("1" + "0".repeat(n))`, the subgraph's divisor idiom. */
export const pow10 = (n: number): GD => GD.fromString("1" + "0".repeat(n));

export const gd = GD.fromString;
