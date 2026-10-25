import { MigrationInterface, QueryRunner } from 'typeorm';

// #284: index support for the batched rule apply and the retention duplicate scan.
export class RuleBatchIndexes1791534000000 implements MigrationInterface {
    name = 'RuleBatchIndexes1791534000000';
    // CONCURRENTLY cannot run in a transaction; Vendure runs migrations with transaction 'each'.
    transaction = false;
    // Must run with no statement_timeout (a timeout aborts the build); run with workers stopped.

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX CONCURRENTLY IF EXISTS "IDX_discount_rule_active_recipient"`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "IDX_discount_rule_active_recipient" ON "discount_rule" ("recipientType", "recipientErpId") WHERE "active" = true`,
        );
        await queryRunner.query(
            `DROP INDEX CONCURRENTLY IF EXISTS "integration_inbox_event_retention"`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "integration_inbox_event_retention" ON "integration_inbox_event" ("stream", "entity_id") WHERE "status" = 'processed' AND "payload" <> '{}'::jsonb`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discount_rule_active_recipient"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "integration_inbox_event_retention"`);
    }
}
