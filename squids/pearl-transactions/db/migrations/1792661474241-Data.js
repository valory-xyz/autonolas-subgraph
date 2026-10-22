module.exports = class Data1792661474241 {
    name = 'Data1792661474241'

    async up(db) {
        await db.query(`ALTER TABLE "funds_movement" ALTER COLUMN "category" TYPE character varying(23)`)
        await db.query(`ALTER TABLE "bond_movement" ALTER COLUMN "category" TYPE character varying(23)`)
    }

    async down(db) {
        // Fails once any AGENT_SAFE_TO_AGENT_EOA row exists; delete those rows first.
        await db.query(`ALTER TABLE "bond_movement" ALTER COLUMN "category" TYPE character varying(20)`)
        await db.query(`ALTER TABLE "funds_movement" ALTER COLUMN "category" TYPE character varying(20)`)
    }
}
