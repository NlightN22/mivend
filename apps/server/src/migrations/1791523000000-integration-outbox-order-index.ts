import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationOutboxOrderIndex1791523000000 implements MigrationInterface {
    name = 'IntegrationOutboxOrderIndex1791523000000';
    // CONCURRENTLY cannot run in a transaction; Vendure runs migrations with transaction 'each'.
    transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX CONCURRENTLY IF EXISTS "IDX_integration_outbox_event_order"`,
        );
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "IDX_integration_outbox_event_order" ON "integration_outbox" ("event_type", (("payload" ->> 'orderId')))`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_integration_outbox_event_order"`);
    }
}
