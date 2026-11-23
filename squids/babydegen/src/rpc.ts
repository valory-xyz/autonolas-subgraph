// Archive JSON-RPC reads at the handler's block, the way graph-node's
// eth_call / ethereum.hasCode run at the block being indexed.
//
// Strict on purpose (same policy as squids/staking): a genuine revert is
// `null` (the subgraph's `try_*().reverted`), every other failure throws so
// the batch is retried. There is no fallback to `latest` — the shared
// `Rpc.at()` has one, which would silently price history at today's state
// and break parity — so RPC_HTTP must be archive-capable.

export type Transport = (method: string, params: unknown[]) => Promise<unknown>;
export class ContractRevert extends Error {}

/**
 * graph-node's RPC_EXECUTION_ERRORS (chain/ethereum call_helper.rs): an
 * eth_call error whose message contains one of these (any case) is the
 * contract failing, i.e. `try_*().reverted`, not a node problem.
 */
const RPC_EXECUTION_ERRORS = [
  "revert",
  "invalid jump destination",
  "invalid opcode",
  "stack limit reached 1024",
  "out of gas",
  "stack underflow",
  "vm execution error",
  "invalidjump",
  "notactivated",
  "invalidfeopcode",
  "stackunderflow",
  "stackoverflow",
  "opcodenotfound",
];
/** Parity / OpenEthereum's code for a reverted or failed execution. */
const PARITY_VM_EXECUTION_ERROR = -32015;

export function isExecutionError(error: { code: number; message: string }): boolean {
  if (error.code === 3 || error.code === PARITY_VM_EXECUTION_ERROR) return true;
  const message = String(error.message).toLowerCase();
  return RPC_EXECUTION_ERRORS.some((e) => message.includes(e));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch-based transport; retries throttling / 5xx / network errors a few times. */
export function transport(url: string, attempts = 6): Transport {
  let id = 0;
  return async (method, params) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(Math.min(8000, 250 * 2 ** attempt));
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        lastErr = err;
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        lastErr = new Error(`RPC HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = (await response.json()) as { result?: unknown; error?: { code: number; message: string } };
      if (body.error) {
        if (isExecutionError(body.error)) {
          throw new ContractRevert(body.error.message);
        }
        if (body.error.code === -32005 || /rate limit|too many/i.test(body.error.message)) {
          lastErr = new Error(`RPC ${body.error.code}: ${body.error.message}`);
          continue;
        }
        throw new Error(`RPC ${body.error.code}: ${body.error.message}`);
      }
      if (!("result" in body)) throw new Error("RPC response missing result");
      return body.result;
    }
    throw lastErr;
  };
}

const hex = (n: bigint) => `0x${n.toString(16)}`;

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  transactionHash: string;
  transactionIndex: number;
}

export interface RpcTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  input: string;
}

export interface Fn<A, R> {
  encode(args: A): string;
  decodeResult(data: string): R;
}

/** A block by number and hash. */
export interface BlockRef {
  number: bigint;
  hash: string;
}

export interface BlockHeader extends BlockRef {
  /** Seconds. */
  timestamp: bigint;
}

/** Bounded memo keyed by `<key>@<block hash>`; the oldest entry goes first. */
class HashMemo<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly max: number) {}
  get(key: string): V | undefined {
    return this.map.get(key);
  }
  set(key: string, value: V): V {
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest != null) this.map.delete(oldest);
    }
    return value;
  }
}

export class ChainReader {
  private readonly calls = new HashMemo<unknown>(8192);
  private readonly codes = new HashMemo<boolean>(8192);
  private current?: BlockRef;

  constructor(private readonly request: Transport) {}

  /**
   * The block being processed. eth_call and eth_getCode at its number are
   * requested by its hash (EIP-1898 `{ blockHash }`) and memoised under it,
   * so replaying the same height on another branch after a fork never reuses
   * the old branch's answers, and a node still on the old branch cannot
   * answer for the new hash (it errors "block not found" and the batch is
   * retried). Reads at any other number go by number and are not memoised.
   */
  enterBlock(block: BlockRef): void {
    this.current = { number: block.number, hash: block.hash.toLowerCase() };
  }

  /** The block parameter for a read at `block`: the entered block's hash, else the number. */
  private blockParam(block: bigint): string | { blockHash: string } {
    return this.current !== undefined && this.current.number === block ? { blockHash: this.current.hash } : hex(block);
  }

  private memoKey(key: string, block: bigint): string | undefined {
    return this.current !== undefined && this.current.number === block ? `${key}@${this.current.hash}` : undefined;
  }

  /**
   * eth_call at `block`; null on revert, or on output shorter than one ABI
   * word (graph-node's decode fails there and it reads the call as reverted;
   * evm-codec would decode the short bytes as a number).
   */
  async call<A, R>(to: string, block: bigint, fn: Fn<A, R>, args: A): Promise<R | null> {
    const data = fn.encode(args);
    const key = this.memoKey(`${to}:${data}`, block);
    const hit = key === undefined ? undefined : this.calls.get(key);
    if (hit !== undefined) return hit as R | null;
    const remember = (r: R | null) => (key === undefined ? r : (this.calls.set(key, r) as R | null));
    let output: string;
    try {
      output = (await this.request("eth_call", [{ to, data }, this.blockParam(block)])) as string;
    } catch (err) {
      if (err instanceof ContractRevert) return remember(null);
      throw err;
    }
    return remember(output.length < 66 ? null : fn.decodeResult(output));
  }

  /** `ethereum.hasCode(addr).inner` at `block`. */
  async hasCode(address: string, block: bigint): Promise<boolean> {
    const key = this.memoKey(address, block);
    const hit = key === undefined ? undefined : this.codes.get(key);
    if (hit !== undefined) return hit;
    const code = (await this.request("eth_getCode", [address, this.blockParam(block)])) as string;
    const has = code != null && code !== "0x";
    return key === undefined ? has : this.codes.set(key, has);
  }

  /** eth_getBlockByNumber header fields (the scheduler's poll blocks). */
  async getBlockHeader(number: bigint): Promise<BlockHeader> {
    const b = (await this.request("eth_getBlockByNumber", [hex(number), false])) as Record<string, string> | null;
    if (b == null) throw new Error(`eth_getBlockByNumber(${number}) returned null`);
    return { number: BigInt(b.number), hash: String(b.hash).toLowerCase(), timestamp: BigInt(b.timestamp) };
  }

  async getLogs(filter: {
    blockHash: string;
    address?: string[];
    topics?: (string[] | null)[];
  }): Promise<RpcLog[]> {
    const raw = (await this.request("eth_getLogs", [filter])) as Array<Record<string, string>>;
    return raw.map((l) => ({
      address: l.address.toLowerCase(),
      topics: (l.topics as unknown as string[]).map((t) => t.toLowerCase()),
      data: l.data,
      logIndex: Number(l.logIndex),
      transactionHash: l.transactionHash.toLowerCase(),
      transactionIndex: Number(l.transactionIndex),
    }));
  }

  async getTransaction(hash: string): Promise<RpcTransaction> {
    const tx = (await this.request("eth_getTransactionByHash", [hash])) as Record<string, string | null> | null;
    if (tx == null) throw new Error(`eth_getTransactionByHash(${hash}) returned null`);
    return {
      hash: hash.toLowerCase(),
      from: String(tx.from).toLowerCase(),
      to: tx.to == null ? null : tx.to.toLowerCase(),
      value: BigInt(tx.value ?? "0x0"),
      input: String(tx.input ?? "0x"),
    };
  }

  /** The receipt's logs (graph-node's `event.receipt.logs`), in log order, with block-level log indexes. */
  async getReceiptLogs(hash: string): Promise<{ address: string; topics: string[]; data: string; logIndex: number }[]> {
    const receipt = (await this.request("eth_getTransactionReceipt", [hash])) as {
      logs: Array<{ address: string; topics: string[]; data: string; logIndex: string }>;
    } | null;
    if (receipt == null) throw new Error(`eth_getTransactionReceipt(${hash}) returned null`);
    return [...receipt.logs]
      .sort((a, b) => Number(a.logIndex) - Number(b.logIndex))
      .map((l) => ({
        address: l.address.toLowerCase(),
        topics: l.topics.map((t) => t.toLowerCase()),
        data: l.data,
        logIndex: Number(l.logIndex),
      }));
  }
}

/** Fail before indexing if RPC_HTTP cannot serve state at the start block. */
export async function assertArchiveRpc(reader: ChainReader, address: string, block: number): Promise<void> {
  let ok: boolean;
  try {
    ok = await reader.hasCode(address, BigInt(block));
  } catch (err) {
    throw new Error(
      `RPC_HTTP cannot read code at block ${block}: ${(err as Error).message.split("\n")[0]}. An archive RPC is required.`,
    );
  }
  if (!ok) {
    throw new Error(`RPC_HTTP returned no code for ${address} at block ${block}; it is not archive-capable.`);
  }
}
