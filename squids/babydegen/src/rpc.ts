// Archive JSON-RPC reads at the handler's block, the way graph-node's
// eth_call / ethereum.hasCode run at the block being indexed.
//
// Strict on purpose (same policy as squids/staking): a genuine revert is
// `null` (the subgraph's `try_*().reverted`), every other failure throws so
// the batch is retried. There is no fallback to `latest` — the shared
// `Rpc.at()` has one, which would silently price history at today's state
// and break parity — so RPC_HTTP must be archive-capable.

import { BlockMemo } from "@olas/squid-shared";

export type Transport = (method: string, params: unknown[]) => Promise<unknown>;
export class ContractRevert extends Error {}

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
        if (body.error.code === 3 || /execution reverted|revert/i.test(body.error.message)) {
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
}

export interface Fn<A, R> {
  encode(args: A): string;
  decodeResult(data: string): R;
}

export class ChainReader {
  private readonly calls = new BlockMemo<unknown>(8192);
  private readonly codes = new BlockMemo<boolean>(8192);

  constructor(private readonly request: Transport) {}

  /** eth_call at `block`; null on revert or empty return data. */
  async call<A, R>(to: string, block: bigint, fn: Fn<A, R>, args: A): Promise<R | null> {
    const data = fn.encode(args);
    const key = `${to}:${data}`;
    const hit = this.calls.get(key, block);
    if (hit !== undefined) return hit as R | null;
    let output: string;
    try {
      output = (await this.request("eth_call", [{ to, data }, hex(block)])) as string;
    } catch (err) {
      if (err instanceof ContractRevert) return this.calls.set(key, block, null) as null;
      throw err;
    }
    const result = output === "0x" ? null : fn.decodeResult(output);
    return this.calls.set(key, block, result) as R | null;
  }

  /** `ethereum.hasCode(addr).inner` at `block`. */
  async hasCode(address: string, block: bigint): Promise<boolean> {
    const hit = this.codes.get(address, block);
    if (hit !== undefined) return hit;
    const code = (await this.request("eth_getCode", [address, hex(block)])) as string;
    return this.codes.set(address, block, code != null && code !== "0x");
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
    };
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
