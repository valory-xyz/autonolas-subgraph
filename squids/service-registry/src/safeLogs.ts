// Per-block routing of chain-wide Safe execution logs, matching graph-node's
// template semantics exactly.
//
// graph-node creates the GnosisSafe template at CreateMultisigWithAgents and
// then re-runs EVERY trigger of that block that matches the new template —
// including Safe logs at a lower log index than the creation, and after all
// the block's other triggers (core/src/subgraph/runner, Stage 3 "process
// dynamic data sources"). A reused Safe gets no second template (duplicate
// data sources are dropped), so its logs are never counted twice.
//
// So: a Safe with a Multisig row before this block is handled in log order;
// a Safe first registered in this block has all of its logs in the block
// handled after the block's other logs, in log order. Everything else is
// dropped.
//
// "Has a Multisig row" is read from the store, not from the process-wide
// known-multisig set: that set is append-only and survives a hot-block
// rollback, so after a reorg it can name a Safe whose row is gone. The set
// stays the cheap first filter for the chain-wide stream (a miss there is
// authoritative); only its hits pay for the row lookup, which
// handleSafeExecution needs anyway.
import { IEntityCache } from "./entityCache";
import { handleSafeExecution } from "./handlers";
import type { EventMeta } from "./logic";
import { Multisig } from "./model";

export class BlockSafeLogs {
  /** Multisigs that got their first Multisig row during the current block. */
  private fresh = new Set<string>();
  /** Safe logs from addresses without a row before this block, in log order. */
  private parked: { address: string; meta: EventMeta }[] = [];

  constructor(
    private readonly cache: IEntityCache,
    /** Test seam: the per-log handler. */
    private readonly handle: typeof handleSafeExecution = handleSafeExecution,
  ) {}

  private async hasRow(address: string): Promise<boolean> {
    return (await this.cache.get(Multisig, address)) != null;
  }

  /** Wrap handleCreateMultisig: notes a multisig first seen in this block. */
  async createMultisig(address: string, run: () => Promise<void>): Promise<void> {
    const hadRow = await this.hasRow(address);
    await run();
    if (!hadRow && (await this.hasRow(address))) {
      this.fresh.add(address);
    }
  }

  async safeLog(address: string, meta: EventMeta): Promise<void> {
    if (!(await this.cache.isKnownMultisig(address))) {
      // Not ours yet; it may still be registered later in this block.
      this.parked.push({ address, meta });
      return;
    }
    if (!this.fresh.has(address) && (await this.hasRow(address))) {
      await this.handle(this.cache, meta, { address });
    } else {
      this.parked.push({ address, meta });
    }
  }

  /** Call once after the block's last log. */
  async endBlock(): Promise<void> {
    const parked = this.parked;
    const fresh = this.fresh;
    this.parked = [];
    this.fresh = new Set();
    for (const { address, meta } of parked) {
      if (fresh.has(address)) await this.handle(this.cache, meta, { address });
    }
  }
}
