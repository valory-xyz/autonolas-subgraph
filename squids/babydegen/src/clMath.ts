// studio babydegen-base src/libraries/TickMath.ts (getSqrtRatioAtTick) and
// src/libraries/LiquidityAmounts.ts, in bigint. graph-ts BigInt division
// and shifts truncate like JS bigint for the non-negative values used here.
// LiquidityAmounts keeps the subgraph's own amount0 formula (not Uniswap's).

const Q96 = 2n ** 96n;
const Q32 = 2n ** 32n;
const MAX_UINT256 = 2n ** 256n - 1n;
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

const mulShift = (val: bigint, mul: bigint) => (val * mul) >> 128n;

/** sqrtPriceX96 = sqrt(1.0001)^tick, Q64.96; an out-of-range tick is clamped. */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (tick < MIN_TICK || tick > MAX_TICK) tick = tick < MIN_TICK ? MIN_TICK : MAX_TICK;
  const absTick = tick < 0 ? -tick : tick;
  let ratio = (absTick & 0x1) !== 0 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  if ((absTick & 0x2) !== 0) ratio = mulShift(ratio, 0xfff97272373d413259a46990580e213an);
  if ((absTick & 0x4) !== 0) ratio = mulShift(ratio, 0xfff2e50f5f656932ef12357cf3c7fdccn);
  if ((absTick & 0x8) !== 0) ratio = mulShift(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0n);
  if ((absTick & 0x10) !== 0) ratio = mulShift(ratio, 0xffcb9843d60f6159c9db58835c926644n);
  if ((absTick & 0x20) !== 0) ratio = mulShift(ratio, 0xff973b41fa98c081472e6896dfb254c0n);
  if ((absTick & 0x40) !== 0) ratio = mulShift(ratio, 0xff2ea16466c96a3843ec78b326b52861n);
  if ((absTick & 0x80) !== 0) ratio = mulShift(ratio, 0xfe5dee046a99a2a811c461f1969c3053n);
  if ((absTick & 0x100) !== 0) ratio = mulShift(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4n);
  if ((absTick & 0x200) !== 0) ratio = mulShift(ratio, 0xf987a7253ac413176f2b074cf7815e54n);
  if ((absTick & 0x400) !== 0) ratio = mulShift(ratio, 0xf3392b0822b70005940c7a398e4b70f3n);
  if ((absTick & 0x800) !== 0) ratio = mulShift(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9n);
  if ((absTick & 0x1000) !== 0) ratio = mulShift(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825n);
  if ((absTick & 0x2000) !== 0) ratio = mulShift(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5n);
  if ((absTick & 0x4000) !== 0) ratio = mulShift(ratio, 0x70d869a156d2a1b890bb3df62baf32f7n);
  if ((absTick & 0x8000) !== 0) ratio = mulShift(ratio, 0x31be135f97d08fd981231505542fcfa6n);
  if ((absTick & 0x10000) !== 0) ratio = mulShift(ratio, 0x9aa508b5b7a84e1c677de54f3e99bc9n);
  if ((absTick & 0x20000) !== 0) ratio = mulShift(ratio, 0x5d6af8dedb81196699c329225ee604n);
  if ((absTick & 0x40000) !== 0) ratio = mulShift(ratio, 0x2216e584f5fa1ea926041bedfe98n);
  if ((absTick & 0x80000) !== 0) ratio = mulShift(ratio, 0x48a170391f7dc42444e8fa2n);
  if (tick > 0) ratio = MAX_UINT256 / ratio;
  return (ratio >> 32n) + (ratio % Q32 > 0n ? 1n : 0n);
}

function sorted(a: bigint, b: bigint): [bigint, bigint] {
  return a > b ? [b, a] : [a, b];
}

export function getAmount0ForLiquidity(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const [a, b] = sorted(sqrtA, sqrtB);
  const numerator = liquidity * (b - a);
  const denominator = (a * b) / Q96;
  if (denominator === 0n) return 0n;
  return numerator / denominator;
}

export function getAmount1ForLiquidity(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const [a, b] = sorted(sqrtA, sqrtB);
  return (liquidity * (b - a)) / Q96;
}

export function getAmountsForLiquidity(
  sqrtRatioX96: bigint,
  sqrtA: bigint,
  sqrtB: bigint,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  const [a, b] = sorted(sqrtA, sqrtB);
  if (sqrtRatioX96 <= a) return { amount0: getAmount0ForLiquidity(a, b, liquidity), amount1: 0n };
  if (sqrtRatioX96 < b) {
    return {
      amount0: getAmount0ForLiquidity(sqrtRatioX96, b, liquidity),
      amount1: getAmount1ForLiquidity(a, sqrtRatioX96, liquidity),
    };
  }
  return { amount0: 0n, amount1: getAmount1ForLiquidity(a, b, liquidity) };
}
