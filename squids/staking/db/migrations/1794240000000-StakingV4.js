module.exports = class StakingV41794240000000 {
  name = 'StakingV41794240000000'

  async up(db) {
    await db.query(`ALTER TABLE "checkpoint" ADD "is_rebaseline" boolean`)
    await db.query(`ALTER TABLE "service_rewards_history" ADD "is_rebaseline" boolean`)
    await db.query(`ALTER TABLE "service_staked" ADD "reward_distribution_info" numeric`)
    await db.query(`ALTER TABLE "reward_claimed" ADD "receivers" text array`)
    await db.query(`ALTER TABLE "reward_claimed" ADD "reward_amounts" text array`)
    await db.query(`CREATE TABLE "service_unstaked_v4" ("id" character varying PRIMARY KEY, "epoch" numeric NOT NULL, "service_id" numeric NOT NULL, "owner" text NOT NULL, "multisig" text NOT NULL, "nonces" text array NOT NULL, "available_rewards" numeric NOT NULL, "enforced" boolean NOT NULL, "contract_address" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL)`)
    await db.query(`CREATE TABLE "services_rebaselined" ("id" character varying PRIMARY KEY, "epoch" numeric NOT NULL, "contract_address" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL)`)
    await db.query(`CREATE TABLE "service_baseline_event" ("id" character varying PRIMARY KEY, "epoch" numeric NOT NULL, "service_id" numeric NOT NULL, "kind" text NOT NULL, "contract_address" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL)`)
    await db.query(`CREATE TABLE "service_baseline_state" ("id" character varying PRIMARY KEY, "service_id" numeric NOT NULL, "contract_address" text NOT NULL, "baseline_missing" boolean NOT NULL, "epoch" numeric NOT NULL)`)
  }

  async down(db) {
    await db.query(`DROP TABLE "service_baseline_state"`)
    await db.query(`DROP TABLE "service_baseline_event"`)
    await db.query(`DROP TABLE "services_rebaselined"`)
    await db.query(`DROP TABLE "service_unstaked_v4"`)
    await db.query(`ALTER TABLE "reward_claimed" DROP "reward_amounts"`)
    await db.query(`ALTER TABLE "reward_claimed" DROP "receivers"`)
    await db.query(`ALTER TABLE "service_staked" DROP "reward_distribution_info"`)
    await db.query(`ALTER TABLE "service_rewards_history" DROP "is_rebaseline"`)
    await db.query(`ALTER TABLE "checkpoint" DROP "is_rebaseline"`)
  }
}
