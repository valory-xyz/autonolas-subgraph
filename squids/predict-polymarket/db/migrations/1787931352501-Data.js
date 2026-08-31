module.exports = class Data1787931352501 {
    name = 'Data1787931352501'

    async up(db) {
        await db.query(`ALTER TABLE "bet" ADD "implied_probability" numeric NOT NULL`)
        await db.query(`ALTER TABLE "daily_profit_statistic" ADD "brier_sum" numeric NOT NULL`)
        await db.query(`ALTER TABLE "daily_profit_statistic" ADD "brier_count" integer NOT NULL`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "daily_profit_statistic" DROP COLUMN "brier_count"`)
        await db.query(`ALTER TABLE "daily_profit_statistic" DROP COLUMN "brier_sum"`)
        await db.query(`ALTER TABLE "bet" DROP COLUMN "implied_probability"`)
    }
}
