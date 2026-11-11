// eth_call fragments the generated ABIs do not cover, written in the same
// shape squid-evm-typegen emits (studio abis/defi/VelodromeV2Pool.json,
// VelodromeCLPool.json and GnosisSafe getThreshold).

import { address, bool, int24, struct, uint16, uint160, uint256 } from "@subsquid/evm-codec";
import { func } from "./abi/abi.support";

/** VelodromeV2Pool getAmountOut(uint256,address): a stable pool's quote. */
export const getAmountOut = func("0xf140a35a", { amountIn: uint256, tokenIn: address }, uint256);

/** Slipstream / Aero CL pool slot0(). */
export const slot0 = func(
  "0x3850c7bd",
  {},
  struct({
    sqrtPriceX96: uint160,
    tick: int24,
    observationIndex: uint16,
    observationCardinality: uint16,
    observationCardinalityNext: uint16,
    unlocked: bool,
  }),
);

/**
 * GnosisSafe getThreshold(): answers on a Safe, reverts elsewhere. Output
 * shorter than a word reads as no answer in ChainReader.call.
 */
export const getThreshold = func("0xe75235b8", {}, uint256);
