import { MigrationInterface, QueryRunner } from 'typeorm';

// #332: keyset slices of the one-off contact reapply over processed inbox rows.
export class InboxReapplyIndex1791574000000 implements MigrationInterface {
    name = 'InboxReapplyIndex1791574000000';
    // CONCURRENTLY cannot run in a transaction; Vendure runs migrations with transaction 'each'.
    transaction = false;
    // Must run with no statement_timeout (a timeout aborts the build); run with workers stopped.

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX CONCURRENTLY IF EXISTS "integration_inbox_event_reapply"`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "integration_inbox_event_reapply" ON "integration_inbox_event" ("stream", "id") WHERE "status" = 'processed'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "integration_inbox_event_reapply"`);
    }
}
