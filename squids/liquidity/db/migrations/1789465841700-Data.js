module.exports = class Data1789465841700 {
    name = 'Data1789465841700'

    async up(db) {
        await db.query(`CREATE TABLE "bpt_transfer" ("id" character varying NOT NULL, "from" text NOT NULL, "to" text NOT NULL, "value" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "pool_id" character varying, CONSTRAINT "PK_7f797cd7e42e9a6a5cf4c259945" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "idx_bpt_transfer_pool_09c6e9a6" ON "bpt_transfer" ("pool_id") `)
        await db.query(`CREATE INDEX "idx_bpt_transfer_from_d424fdcf" ON "bpt_transfer" ("from") `)
        await db.query(`CREATE INDEX "idx_bpt_transfer_to_02fcf1f4" ON "bpt_transfer" ("to") `)
        await db.query(`CREATE INDEX "idx_bpt_transfer_block_timestamp_68f9d184" ON "bpt_transfer" ("block_timestamp") `)
        await db.query(`CREATE TABLE "daily_fees" ("id" character varying NOT NULL, "day_timestamp" numeric NOT NULL, "total_fees_token0" numeric NOT NULL, "total_fees_token1" numeric NOT NULL, "swap_count" integer NOT NULL, "pool_id" character varying, CONSTRAINT "PK_3c1832f8b2cd10bdd462c7e32d5" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "idx_daily_fees_pool_8a1eb052" ON "daily_fees" ("pool_id") `)
        await db.query(`CREATE INDEX "idx_daily_fees_day_timestamp_d18cf6aa" ON "daily_fees" ("day_timestamp") `)
        await db.query(`CREATE TABLE "pool_metrics" ("id" character varying NOT NULL, "dex" text NOT NULL, "pool_id" text, "token0" text, "token1" text, "reserve0" numeric NOT NULL, "reserve1" numeric NOT NULL, "total_supply" numeric NOT NULL, "reserves_refreshed_at_block" numeric NOT NULL, "total_minted" numeric NOT NULL, "total_burned" numeric NOT NULL, "cumulative_fees_token0" numeric NOT NULL, "cumulative_fees_token1" numeric NOT NULL, "swap_fee_percentage" numeric NOT NULL, "native_usd_price" numeric NOT NULL, "last_updated_block" numeric NOT NULL, "last_updated_timestamp" numeric NOT NULL, "last_updated_transaction" text NOT NULL, CONSTRAINT "PK_5b96a60e9d76f812274caf23caa" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "price_data" ("id" character varying NOT NULL, "price" numeric NOT NULL, "decimals" integer NOT NULL, "last_updated_block" numeric NOT NULL, "last_updated_timestamp" numeric NOT NULL, CONSTRAINT "PK_39e1331c1781e8b0e57bde579b9" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "indexer_status" ("id" character varying NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, CONSTRAINT "PK_2a3644fefd70a0c04e4a744d4af" PRIMARY KEY ("id"))`)
        await db.query(`ALTER TABLE "bpt_transfer" ADD CONSTRAINT "FK_3d5ef95adedf978f7a778696e87" FOREIGN KEY ("pool_id") REFERENCES "pool_metrics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        await db.query(`ALTER TABLE "daily_fees" ADD CONSTRAINT "FK_9c7b2879922e0dd1bc4d4503fac" FOREIGN KEY ("pool_id") REFERENCES "pool_metrics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "daily_fees" DROP CONSTRAINT "FK_9c7b2879922e0dd1bc4d4503fac"`)
        await db.query(`ALTER TABLE "bpt_transfer" DROP CONSTRAINT "FK_3d5ef95adedf978f7a778696e87"`)
        await db.query(`DROP TABLE "indexer_status"`)
        await db.query(`DROP TABLE "price_data"`)
        await db.query(`DROP TABLE "pool_metrics"`)
        await db.query(`DROP INDEX "public"."idx_daily_fees_day_timestamp_d18cf6aa"`)
        await db.query(`DROP INDEX "public"."idx_daily_fees_pool_8a1eb052"`)
        await db.query(`DROP TABLE "daily_fees"`)
        await db.query(`DROP INDEX "public"."idx_bpt_transfer_block_timestamp_68f9d184"`)
        await db.query(`DROP INDEX "public"."idx_bpt_transfer_to_02fcf1f4"`)
        await db.query(`DROP INDEX "public"."idx_bpt_transfer_from_d424fdcf"`)
        await db.query(`DROP INDEX "public"."idx_bpt_transfer_pool_09c6e9a6"`)
        await db.query(`DROP TABLE "bpt_transfer"`)
    }
}
