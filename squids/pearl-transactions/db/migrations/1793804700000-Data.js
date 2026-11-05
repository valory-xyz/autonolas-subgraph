module.exports = class Data1793804700000 {
    name = 'Data1793804700000'

    async up(db) {
        await db.query(`CREATE TABLE "agent_instance" ("id" character varying NOT NULL, "updated_block" numeric NOT NULL, "updated_log_index" integer NOT NULL, "service_id" character varying, CONSTRAINT "PK_69ff332de64f510071e90a86d87" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "idx_agent_instance_service_cfb8e2ff" ON "agent_instance" ("service_id") `)
        await db.query(`ALTER TABLE "agent_instance" ADD CONSTRAINT "FK_4a64fa9c14704f7c0e6440aa7f1" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        // Defaults only fill rows that already exist; the model declares none.
        await db.query(`ALTER TABLE "pending_registration" ADD "agent_instances" text array NOT NULL DEFAULT '{}'`)
        await db.query(`ALTER TABLE "pending_registration" ADD "agent_instance_blocks" integer array NOT NULL DEFAULT '{}'`)
        await db.query(`ALTER TABLE "pending_registration" ADD "agent_instance_log_indexes" integer array NOT NULL DEFAULT '{}'`)
        await db.query(`ALTER TABLE "pending_registration" ALTER COLUMN "agent_instances" DROP DEFAULT`)
        await db.query(`ALTER TABLE "pending_registration" ALTER COLUMN "agent_instance_blocks" DROP DEFAULT`)
        await db.query(`ALTER TABLE "pending_registration" ALTER COLUMN "agent_instance_log_indexes" DROP DEFAULT`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "pending_registration" DROP COLUMN "agent_instance_log_indexes"`)
        await db.query(`ALTER TABLE "pending_registration" DROP COLUMN "agent_instance_blocks"`)
        await db.query(`ALTER TABLE "pending_registration" DROP COLUMN "agent_instances"`)
        await db.query(`ALTER TABLE "agent_instance" DROP CONSTRAINT "FK_4a64fa9c14704f7c0e6440aa7f1"`)
        await db.query(`DROP INDEX "public"."idx_agent_instance_service_cfb8e2ff"`)
        await db.query(`DROP TABLE "agent_instance"`)
    }
}
