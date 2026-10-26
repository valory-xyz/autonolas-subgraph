module.exports = class OffChainRequests1793012400000 {
    name = 'OffChainRequests1793012400000'

    async up(db) {
        await db.query(`ALTER TABLE "global" ADD "total_off_chain_requests" numeric`)
        // Initialize existing rows from immutable signed batch events, never from a zero default.
        // The coordinated rollout still uses a full replay for all indexer changes.
        await db.query(`UPDATE "global" SET "total_off_chain_requests" = (SELECT COALESCE(SUM("num_deliveries"), 0) FROM "marketplace_delivery_with_signatures")`)
        await db.query(`ALTER TABLE "global" ALTER COLUMN "total_off_chain_requests" SET NOT NULL`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "global" DROP COLUMN "total_off_chain_requests"`)
    }
}
