module.exports = class Data1786639572389 {
    name = 'Data1786639572389'

    async up(db) {
        await db.query(`DROP INDEX "public"."idx_question_resolution_question_03e9c2da"`)
        await db.query(`ALTER TABLE "question_resolution" DROP CONSTRAINT "FK_7264805b184143100dae4fcfe3c"`)
        await db.query(`ALTER TABLE "question_resolution" ADD CONSTRAINT "UQ_7264805b184143100dae4fcfe3c" UNIQUE ("question_id")`)
        await db.query(`CREATE UNIQUE INDEX "idx_question_resolution_question_d098d976" ON "question_resolution" ("question_id") `)
        await db.query(`ALTER TABLE "question_resolution" ADD CONSTRAINT "FK_7264805b184143100dae4fcfe3c" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "question_resolution" DROP CONSTRAINT "FK_7264805b184143100dae4fcfe3c"`)
        await db.query(`DROP INDEX "public"."idx_question_resolution_question_d098d976"`)
        await db.query(`ALTER TABLE "question_resolution" DROP CONSTRAINT "UQ_7264805b184143100dae4fcfe3c"`)
        await db.query(`ALTER TABLE "question_resolution" ADD CONSTRAINT "FK_7264805b184143100dae4fcfe3c" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        await db.query(`CREATE INDEX "idx_question_resolution_question_03e9c2da" ON "question_resolution" ("question_id") `)
    }
}
