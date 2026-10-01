// Run against an empty migrated local database. Fixtures always roll back.
require("dotenv/config");
const assert = require("node:assert/strict");
const { DataSource } = require("typeorm");
const { createOrmConfig } = require("@subsquid/typeorm-config");
const { Store } = require("@subsquid/typeorm-store");
const { EntityCache } = require("../lib/entityCache");
const { Token, TokenHolder, Transfer } = require("../lib/model");
const { handleTransfer } = require("../lib/handlers");
const { CHAIN, ZERO_ADDRESS } = require("../lib/constants");
const rollback = new Error("ROLLBACK_FIXTURES");

async function main() {
  const db = new DataSource(createOrmConfig());
  await db.initialize();
  try {
    assert.equal(
      await db.manager.count(Token),
      0,
      "Use an empty verification database",
    );
    await db.transaction(async (manager) => {
      const store = new Store(() => manager);
      const alice = "0x" + "11".repeat(20);
      const bob = "0x" + "22".repeat(20);
      let logIndex = 0;
      async function batch(from, to, amount) {
        const cache = new EntityCache(store);
        await handleTransfer(
          cache,
          {
            address: CHAIN.olas,
            blockNumber: BigInt(CHAIN.startBlock),
            blockTimestamp: 100n,
            txHash: "0x" + "aa".repeat(32),
            logIndex: logIndex++,
            txFrom: null,
            txTo: null,
          },
          { from, to, amount },
        );
        await cache.flush();
      }
      await batch(ZERO_ADDRESS, alice, 1000n);
      await batch(alice, bob, 400n);
      await batch(bob, bob, 400n);
      await batch(alice, ZERO_ADDRESS, 600n);
      const token = await store.get(Token, CHAIN.olas);
      assert.equal(token.balance, 400n);
      assert.equal(token.holderCount, 1);
      assert.equal((await store.get(TokenHolder, alice)).balance, 0n);
      assert.equal((await store.get(TokenHolder, bob)).balance, 400n);
      assert.equal((await store.find(Transfer)).length, 4);
      assert.equal(await store.get(TokenHolder, ZERO_ADDRESS), undefined);
      console.log(
        "PASS: mint -> reload -> transfer -> reload -> self-transfer -> reload -> burn; balances and holder count persist",
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
