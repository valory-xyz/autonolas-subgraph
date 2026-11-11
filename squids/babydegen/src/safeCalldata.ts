// The ETH a Safe sends in its own execTransaction, read from the calldata:
// studio babydegen-base src/safe.ts (#175) ethSentBySafe / multiSendEthSends,
// with the same bounds checks and the same reasons for giving up.

export const EXEC_TRANSACTION_SELECTOR = "0x6a761202"; // execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)
export const MULTI_SEND_SELECTOR = "0x8d80ff0a"; // multiSend(bytes)
const OPERATION_CALL = 0n;
const OPERATION_DELEGATECALL = 1n;
const SELECTOR_LENGTH = 4;
const ABI_WORD = 32;
// MultiSend packs each call as operation (1) | to (20) | value (32) | data length (32) | data
const PACKED_TO = 1;
const PACKED_VALUE = 21;
const PACKED_DATA_LENGTH = 53;
const PACKED_CALL_HEADER = 85;
const ADDRESS_PADDING = 12;

export interface EthSend {
  to: string;
  value: bigint;
}

/** `sends` is null exactly when `reason` says why the calldata was not read. */
export type DecodedSends = { sends: EthSend[]; reason?: undefined } | { sends: null; reason: string };

const unreadable = (reason: string): DecodedSends => ({ sends: null, reason });

const hex = (b: Uint8Array) => "0x" + Buffer.from(b).toString("hex");

/** uintAt: the uint256 in the ABI word at `offset` (a short tail reads as fewer bytes). */
export function uintAt(bytes: Uint8Array, offset: number): bigint {
  const word = bytes.subarray(offset, offset + ABI_WORD);
  return word.length === 0 ? 0n : BigInt(hex(word));
}

/** addressAt: the last 20 bytes of the ABI word at `offset`. */
export const addressAt = (bytes: Uint8Array, offset: number): string =>
  hex(bytes.subarray(offset + ADDRESS_PADDING, offset + ABI_WORD));

/** sizeAt: a word read as a byte offset or length, or -1 when it cannot be one inside `bytes`. */
function sizeAt(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + ABI_WORD > bytes.length) return -1;
  const size = uintAt(bytes, offset);
  return size > BigInt(bytes.length) ? -1 : Number(size);
}

const hasSelector = (bytes: Uint8Array, selector: string) =>
  bytes.length >= SELECTOR_LENGTH && hex(bytes.subarray(0, SELECTOR_LENGTH)) === selector;

/** bytesArgAt: the `bytes` argument whose offset is in the head word at `head`, or null when it runs past `args`. */
function bytesArgAt(args: Uint8Array, head: number): Uint8Array | null {
  const offset = sizeAt(args, head);
  const length = sizeAt(args, offset);
  if (length < 0 || offset + ABI_WORD + length > args.length) return null;
  return args.subarray(offset + ABI_WORD, offset + ABI_WORD + length);
}

/** The calls with value packed in multiSend(bytes transactions) calldata. */
function multiSendEthSends(data: Uint8Array): DecodedSends {
  const sends: EthSend[] = [];
  const packed = bytesArgAt(data.subarray(SELECTOR_LENGTH), 0);
  if (packed == null) return unreadable("multiSend bytes argument runs past the calldata");
  let i = 0;
  while (i < packed.length) {
    if (i + PACKED_CALL_HEADER > packed.length) return unreadable("multiSend packed call truncated");
    const operation = BigInt(packed[i]);
    const to = hex(packed.subarray(i + PACKED_TO, i + PACKED_VALUE));
    const value = uintAt(packed, i + PACKED_VALUE);
    const dataLength = sizeAt(packed, i + PACKED_DATA_LENGTH);
    if (dataLength < 0) return unreadable("multiSend packed call data length runs past the calldata");
    // A packed DELEGATECALL runs code in the Safe; its `value` field moves no ETH.
    if (operation === OPERATION_CALL && value > 0n) sends.push({ to, value });
    i += PACKED_CALL_HEADER + dataLength;
  }
  return { sends };
}

/**
 * ethSentBySafe: ETH the Safe itself sends in the tx's execTransaction, i.e.
 * its Call's value, or each Call of a MultiSend it delegatecalls. A tx not
 * sent to the Safe (relayed or module execution) is not readable.
 */
export function ethSentBySafe(safe: string, tx: { to: string | null; input: string }): DecodedSends {
  if (tx.to == null || tx.to !== safe) return unreadable("the tx is not sent to the Safe (relayed or module execution)");
  const input = Buffer.from(tx.input.slice(2), "hex");
  if (!hasSelector(input, EXEC_TRANSACTION_SELECTOR)) return unreadable("the tx is not an execTransaction");
  const args = input.subarray(SELECTOR_LENGTH);
  if (args.length < 4 * ABI_WORD) return unreadable("execTransaction calldata too short");
  const to = addressAt(args, 0);
  const value = uintAt(args, ABI_WORD);
  const operation = uintAt(args, 3 * ABI_WORD);
  if (operation === OPERATION_CALL) return { sends: value > 0n ? [{ to, value }] : [] };
  if (operation !== OPERATION_DELEGATECALL) return unreadable(`unsupported operation ${operation}`);
  const data = bytesArgAt(args, 2 * ABI_WORD);
  if (data == null) return unreadable("execTransaction data argument runs past the calldata");
  if (!hasSelector(data, MULTI_SEND_SELECTOR)) return unreadable(`delegatecall to ${to} is not a multiSend`);
  return multiSendEthSends(data);
}

/** decodedSendOf: `safe`'s own calldata in this tx shows it sending `value` ETH to `to`. */
export function decodedSendOf(safe: string, tx: { to: string | null; input: string }, to: string, value: bigint): boolean {
  const { sends } = ethSentBySafe(safe, tx);
  return sends != null && sends.some((s) => s.to === to && s.value === value);
}
