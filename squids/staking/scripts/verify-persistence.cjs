// Run after build + migration:apply against a disposable, empty database.
// All fixtures roll back, including if an assertion fails.
require("dotenv/config");
const assert = require("node:assert/strict");
const { DataSource } = require("typeorm");
const { createOrmConfig } = require("@subsquid/typeorm-config");
const { Store } = require("@subsquid/typeorm-store");
const { EntityCache } = require("../lib/entityCache");
const models = require("../lib/model");
const handlers = require("../lib/handlers");
const rollback = new Error("ROLLBACK_FIXTURES");
async function main() {
  const db = new DataSource(createOrmConfig());
  await db.initialize();
  try {
    assert.equal(
      await db.manager.count(models.Service),
      0,
      "Use an empty verification database",
    );
    await db.transaction(async (em) => {
      const store = new Store(() => em);
      async function batch() {
        return {
          cache: new EntityCache(store),
          services: new Map(
            (await store.find(models.Service)).map((s) => [s.id, s]),
          ),
          lockedOlas: async () => 300n,
        };
      }
      const address = "0x" + "11".repeat(20);
      const meta = {
        address,
        blockNumber: 1n,
        blockTimestamp: 86401n,
        txHash: "0x" + "aa".repeat(32),
        logIndex: 0,
        txFrom: null,
        txTo: null,
      };
      const contract = new models.StakingContract({
        id: address,
        isOlasStaking: true,
        eventsIndexed: true,
      });
      const params = {
        epoch: 1n,
        serviceId: 1n,
        owner: address,
        multisig: address,
        nonces: [2n],
      };
      let ctx = await batch();
      await handlers.handleServiceStaked(ctx, meta, contract, params);
      await ctx.cache.flush();
      ctx = await batch();
      await handlers.handleCheckpoint(ctx, { ...meta, logIndex: 1 }, contract, {
        epoch: 1n,
        serviceIds: [1n],
        rewards: [100n],
        epochLength: 10n,
        availableRewards: 1000n,
      });
      await ctx.cache.flush();
      ctx = await batch();
      await handlers.handleServiceUnstaked(
        ctx,
        { ...meta, logIndex: 2 },
        contract,
        { ...params, reward: 100n, availableRewards: 0n },
        false,
      );
      await ctx.cache.flush();
      const global = await store.get(models.Global, "");
      assert.equal(global.currentOlasStaked, 0n);
      assert.equal(global.totalRewards, 100n);
      assert.equal(global.totalRewardsClaimed, 100n);
      const service = await store.findOne(models.Service, {
        where: { id: "1" },
        relations: { global: true },
      });
      assert.equal(service.global.id, "");
      assert.equal(service.totalEpochsParticipated, 1);
      assert.equal(service.olasRewardsClaimed, 100n);
      const history = await store.findOne(models.ServiceRewardsHistory, {
        where: { id: `1-${address}-1` },
        relations: { service: true, checkpoint: true },
      });
      assert.equal(history.service.id, "1");
      assert.equal(
        history.checkpoint.id,
        handlers.eventId({ ...meta, logIndex: 1 }),
      );
      assert.deepEqual(history.checkpoint.rewards, ["100"]);
      console.log(
        "PASS: stake -> reload -> checkpoint -> reload -> unstake; totals, arrays, and foreign keys persist",
      );
      throw rollback;
    });
  } catch (err) {
    if (err !== rollback) throw err;
  } finally {
    await db.destroy();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
