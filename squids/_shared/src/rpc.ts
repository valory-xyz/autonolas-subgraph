// JSON-RPC reads at a pinned block with a fallback chain, shared by every
// squid that converts amounts to USD during indexing:
//
//   primary pinned to the block -> fallback pinned -> primary at `latest` (warned)
//
// A genuine revert (no code, empty return) anywhere returns null so the
// caller can record $0, as graph-node's `.reverted` did. Any other failure at
// `latest` propagates and the batch is retried.

import { createPublicClient, http, type PublicClient } from "viem";

export interface RpcOptions {
  /** Primary endpoint. `RPC_HTTP` in every squid. */
  primaryUrl: string;
  /** Optional second endpoint tried when the primary fails with a non-revert error. */
  fallbackUrl?: string | null;
}

export type Logger = { warn(msg: string): void; info(msg: string): void };

const consoleLog: Logger = {
  warn: (m) => console.warn(m),
  info: (m) => console.info(m),
};

/**
 * True only for a genuine revert / no code (the subgraph's `.reverted`).
 * viem wraps every failure, HTTP errors included, in a
 * ContractFunctionExecutionError, so walk the cause chain.
 */
export function isRevert(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e != null && depth < 16; depth++) {
    const name = (e as { name?: string }).name;
    if (name === "ContractFunctionRevertedError" || name === "ContractFunctionZeroDataError") {
      return true;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export const firstLine = (e: unknown): string =>
  String((e as Error)?.message ?? e).split("\n")[0];

/** A read against one client, optionally pinned to a block. */
export type Read<T> = (client: PublicClient, blockNumber: bigint | null) => Promise<T>;

export class Rpc {
  readonly primaryUrl: string;
  private readonly primary: PublicClient;
  private readonly fallback: PublicClient | null;
  private readonly log: Logger;
  // Warn about the `latest` fallback once per block, not once per request.
  private readonly warnedLatestAt = new Set<bigint>();

  constructor(opts: RpcOptions, log: Logger = consoleLog) {
    this.primaryUrl = opts.primaryUrl;
    this.primary = createPublicClient({ transport: http(opts.primaryUrl, { batch: true }) });
    this.fallback = opts.fallbackUrl
      ? createPublicClient({ transport: http(opts.fallbackUrl, { batch: true }) })
      : null;
    this.log = log;
  }

  /** Build from the conventional env vars. */
  static fromEnv(defaultRpc: string, log?: Logger): Rpc {
    return new Rpc(
      {
        primaryUrl: process.env.RPC_HTTP ?? defaultRpc,
        fallbackUrl: process.env.RPC_HTTP_FALLBACK ?? null,
      },
      log
    );
  }

  /**
   * Run `read` at `blockNumber` through the fallback chain. Returns null on a
   * revert. `what` names the read in the one warning per block.
   */
  async at<T>(blockNumber: bigint, what: string, read: Read<T>): Promise<T | null> {
    let err: unknown;
    try {
      return await read(this.primary, blockNumber);
    } catch (e) {
      if (isRevert(e)) return null;
      err = e;
    }
    if (this.fallback != null) {
      try {
        return await read(this.fallback, blockNumber);
      } catch (e2) {
        if (isRevert(e2)) return null;
        err = e2;
      }
    }
    if (!this.warnedLatestAt.has(blockNumber)) {
      this.warnedLatestAt.add(blockNumber);
      this.log.warn(
        `[rpc] ${what} pinned to block ${blockNumber} failed on every endpoint ` +
          `(${firstLine(err)}) — reading at "latest" instead. Figures for this ` +
          `block use current state. Point RPC_HTTP at an archive node to avoid ` +
          `this during a backfill.`
      );
    }
    try {
      return await read(this.primary, null);
    } catch (e3) {
      if (isRevert(e3)) return null;
      throw e3;
    }
  }

  /** Unpinned read on the primary only. Throws on any failure. */
  async latest<T>(read: Read<T>): Promise<T> {
    return read(this.primary, null);
  }

  /**
   * Startup probe, informational: says once whether RPC_HTTP can serve state
   * at `blockNumber` for `address` (i.e. is archive-capable for the backfill).
   */
  async probeArchive(address: `0x${string}`, blockNumber: bigint): Promise<void> {
    try {
      const code = await this.primary.getCode({ address, blockNumber });
      if (code == null || code === "0x") {
        this.log.warn(
          `[rpc] ${this.primaryUrl} returned no code for ${address} at block ` +
            `${blockNumber}. Either the node is pruned or the contract postdates ` +
            `that block; historical reads may fall back to "latest".`
        );
      } else {
        this.log.info(`[rpc] ${this.primaryUrl} serves state at block ${blockNumber} (archive-capable).`);
      }
    } catch (err) {
      this.log.warn(
        `[rpc] ${this.primaryUrl} cannot read state at block ${blockNumber} ` +
          `(${firstLine(err)}). Not archive-capable: reads for blocks outside ` +
          `its state window will use "latest".`
      );
    }
  }
}

/** Small per-block memo, bounded; blocks only move forward so old keys are dead. */
export class BlockMemo<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly max = 4096) {}
  get(key: string, block: bigint): V | undefined {
    return this.map.get(`${key}@${block}`);
  }
  set(key: string, block: bigint, value: V): V {
    this.map.set(`${key}@${block}`, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest != null) this.map.delete(oldest);
    }
    return value;
  }
}
