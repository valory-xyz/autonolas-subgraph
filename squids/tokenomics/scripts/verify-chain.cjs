// Run after a bounded processor run exits. All reads use its exact checkpoint.
require("dotenv/config");
const assert = require("node:assert/strict");
const { DataSource } = require("typeorm");
const { createOrmConfig } = require("@subsquid/typeorm-config");
const { Token, TokenHolder } = require("../lib/model");
const { CHAIN } = require("../lib/constants");
const olas = require("../lib/abi/OLAS/functions");

async function main() {
  const block = Number(process.env.VERIFY_BLOCK);
  assert.ok(
    Number.isSafeInteger(block) && block >= CHAIN.startBlock,
    "Set VERIFY_BLOCK to the bounded run's final block",
  );
  const db = new DataSource(createOrmConfig());
  await db.initialize();
  try {
    const [status] = await db.query(
      "SELECT height FROM squid_processor.status WHERE id = 0",
    );
    assert.equal(
      status?.height,
      block,
      "Stop the processor at VERIFY_BLOCK before comparing state",
    );
    const [hot] = await db.query(
      "SELECT COUNT(*)::int AS count FROM squid_processor.hot_block",
    );
    assert.equal(
      hot.count,
      0,
      "Use a finalized historical range for this check",
    );
    async function read(fn, args) {
      const response = await fetch(process.env.RPC_HTTP ?? CHAIN.defaultRpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            { to: CHAIN.olas, data: fn.encode(args) },
            `0x${block.toString(16)}`,
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });
      assert.ok(response.ok, `RPC HTTP ${response.status}`);
      const body = await response.json();
      assert.equal(body.error, undefined, JSON.stringify(body.error));
      return fn.decodeResult(body.result);
    }
    const token = await db.manager.findOneByOrFail(Token, { id: CHAIN.olas });
    const holders = await db.manager.findBy(TokenHolder, { token: CHAIN.olas });
    assert.equal(
      token.balance,
      await read(olas.totalSupply, {}),
      "Supply differs from totalSupply()",
    );
    assert.equal(
      token.holderCount,
      holders.filter((holder) => holder.balance > 0n).length,
    );
    assert.equal(
      token.balance,
      holders.reduce((sum, holder) => sum + holder.balance, 0n),
    );
    for (const holder of holders) {
      assert.equal(
        holder.balance,
        await read(olas.balanceOf, { _0: holder.id }),
        `balanceOf mismatch for ${holder.id}`,
      );
    }
    console.log(
      `PASS: block ${block}; supply=${token.balance}; positive holders=${token.holderCount}; checked ${holders.length} balances`,
    );
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
