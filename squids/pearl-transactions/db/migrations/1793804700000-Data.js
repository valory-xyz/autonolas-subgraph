module.exports = class Data1793804700000 {
    name = 'Data1793804700000'

    async up(db) {
        await db.query(`CREATE TABLE "agent_instance" ("id" character varying NOT NULL, "updated_block" numeric NOT NULL, "service_id" character varying, CONSTRAINT "PK_69ff332de64f510071e90a86d87" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "idx_agent_instance_service_cfb8e2ff" ON "agent_instance" ("service_id") `)
        await db.query(`ALTER TABLE "agent_instance" ADD CONSTRAINT "FK_4a64fa9c14704f7c0e6440aa7f1" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "agent_instance" DROP CONSTRAINT "FK_4a64fa9c14704f7c0e6440aa7f1"`)
        await db.query(`DROP INDEX "public"."idx_agent_instance_service_cfb8e2ff"`)
        await db.query(`DROP TABLE "agent_instance"`)
    }
}
