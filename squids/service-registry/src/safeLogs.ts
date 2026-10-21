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
// So: a Safe known before this block is handled in log order; a Safe first
// registered in this block has all of its logs in the block handled after
// the block's other logs, in log order. Everything else is dropped.
import { IEntityCache } from "./entityCache";
import { handleSafeExecution } from "./handlers";
import type { EventMeta } from "./logic";

export class BlockSafeLogs {
  /** Multisigs that became known during the current block. */
  private fresh = new Set<string>();
  /** Safe logs from addresses not known before this block, in log order. */
  private parked: { address: string; meta: EventMeta }[] = [];

  constructor(private readonly cache: IEntityCache) {}

  /** Wrap handleCreateMultisig: notes a multisig first seen in this block. */
  async createMultisig(address: string, run: () => Promise<void>): Promise<void> {
    const wasKnown = await this.cache.isKnownMultisig(address);
    await run();
    if (!wasKnown && (await this.cache.isKnownMultisig(address))) {
      this.fresh.add(address);
    }
  }

  async safeLog(address: string, meta: EventMeta): Promise<void> {
    if (!this.fresh.has(address) && (await this.cache.isKnownMultisig(address))) {
      await handleSafeExecution(this.cache, meta, { address });
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
      if (fresh.has(address)) await handleSafeExecution(this.cache, meta, { address });
    }
  }
}
