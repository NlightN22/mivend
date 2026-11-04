import { MigrationInterface, QueryRunner } from 'typeorm';

// Every inbox event is updated twice (claim, settle) with a non-HOT update, so the default 20% dead-tuple threshold lets hundreds of thousands pile up.
export class InboxAutovacuum1791548000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" SET (
                autovacuum_vacuum_scale_factor = 0.01,
                autovacuum_vacuum_insert_scale_factor = 0.05,
                autovacuum_analyze_scale_factor = 0.02,
                autovacuum_vacuum_cost_limit = 2000,
                toast.autovacuum_vacuum_scale_factor = 0.01,
                toast.autovacuum_vacuum_cost_limit = 2000
            )`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" RESET (
                autovacuum_vacuum_scale_factor,
                autovacuum_vacuum_insert_scale_factor,
                autovacuum_analyze_scale_factor,
                autovacuum_vacuum_cost_limit,
                toast.autovacuum_vacuum_scale_factor,
                toast.autovacuum_vacuum_cost_limit
            )`,
        );
    }
}
