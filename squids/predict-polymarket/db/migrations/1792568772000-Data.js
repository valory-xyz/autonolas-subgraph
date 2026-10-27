module.exports = class Data1792568772000 {
    name = 'Data1792568772000'

    async up(db) {
        await db.query(`ALTER TABLE "bet" ADD "collateral" text`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "bet" DROP COLUMN "collateral"`)
    }
}
