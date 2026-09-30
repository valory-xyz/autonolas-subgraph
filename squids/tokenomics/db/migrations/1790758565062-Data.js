module.exports = class Data1790758565062 {
    name = 'Data1790758565062'

    async up(db) {
        await db.query(`CREATE TABLE "token" ("id" character varying NOT NULL, "balance" numeric NOT NULL, "holder_count" integer NOT NULL, CONSTRAINT "PK_82fae97f905930df5d62a702fc9" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "token_holder" ("id" character varying NOT NULL, "token" text NOT NULL, "balance" numeric NOT NULL, CONSTRAINT "PK_c5e10d5c2543fac00a5d3086a2c" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "transfer" ("id" character varying NOT NULL, "from" text NOT NULL, "to" text NOT NULL, "value" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_fd9ddbdd49a17afcbe014401295" PRIMARY KEY ("id"))`)
    }

    async down(db) {
        await db.query(`DROP TABLE "transfer"`)
        await db.query(`DROP TABLE "token_holder"`)
        await db.query(`DROP TABLE "token"`)
    }
}
