// Calldata builders shared by the handler and logic tests, so a change to
// the Safe or MultiSend encoding is made once.
import { encodeAbiParameters, encodePacked } from "viem";
import * as safeFns from "../src/abi/GnosisSafe/functions";
import { ZERO_ADDRESS } from "../src/constants";
import { MULTISEND_SELECTOR } from "../src/logic";

export type ExecFields = { to: string; value: bigint; data: string; operation: number };

/** Safe `execTransaction` calldata: `defaults` per describe block, `over` per test. */
export function execCalldata(defaults: ExecFields, over: Partial<ExecFields> = {}) {
  return safeFns.execTransaction.encode({
    ...defaults,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    signatures: `0x${"ab".repeat(65)}`,
    ...over,
  });
}

/** One packed MultiSend leg, without `0x`. */
export function leg(to: string, value: bigint, data = "0x", operation = 0) {
  return encodePacked(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [operation, to as `0x${string}`, value, BigInt((data.length - 2) / 2), data as `0x${string}`]
  ).slice(2);
}

/** A packed buffer ABI-encoded as the lone `bytes` argument, without `0x`. */
export function bytesArg(buffer: string) {
  return encodeAbiParameters([{ type: "bytes" }], [buffer as `0x${string}`]).slice(2);
}

/** `multiSend(bytes)` calldata over the given packed legs. */
export function multiSendData(...legs: string[]) {
  return `${MULTISEND_SELECTOR}${bytesArg(`0x${legs.join("")}`)}`;
}
