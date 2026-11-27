import { MigrationInterface, QueryRunner } from 'typeorm';

// #413: the exchange-health lists and the stream backlog summary stop scanning the inbox and outbox tables.
export class ExchangeHealthListIndexes1791611000000 implements MigrationInterface {
    name = 'ExchangeHealthListIndexes1791611000000';
    // CONCURRENTLY cannot run in a transaction; Vendure runs migrations with transaction 'each'.
    transaction = false;
    // Must run with no statement_timeout (a timeout aborts the build and leaves an INVALID index, dropped on rerun).

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const name of [
            'integration_inbox_event_problem',
            'integration_inbox_event_problem_status',
            'integration_inbox_event_backlog',
            'integration_outbox_problem',
        ]) {
            await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
        }
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "integration_inbox_event_problem" ON "integration_inbox_event" ("updated_at", "id") WHERE "status" IN ('failed', 'dependency_missing', 'replay_requested') OR "outcome" = 'noop'`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "integration_inbox_event_problem_status" ON "integration_inbox_event" ("status", "updated_at", "id") WHERE "status" IN ('failed', 'dependency_missing', 'replay_requested')`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "integration_inbox_event_backlog" ON "integration_inbox_event" ("stream", "status", "created_at") WHERE "status" IN ('pending', 'processing', 'failed', 'dependency_missing', 'replay_requested')`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "integration_outbox_problem" ON "integration_outbox" ("created_at", "id") WHERE "status" IN ('failed', 'skipped')`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "integration_outbox_problem"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "integration_inbox_event_backlog"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "integration_inbox_event_problem_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "integration_inbox_event_problem"`);
    }
}
