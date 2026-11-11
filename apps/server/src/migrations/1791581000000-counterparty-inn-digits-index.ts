import { MigrationInterface, QueryRunner } from 'typeorm';

// Serves the duplicate-INN lookup of portal readiness and the activation guard; keep the expression identical to innDigitsSql.
export class CounterpartyInnDigitsIndex1791581000000 implements MigrationInterface {
    name = 'CounterpartyInnDigitsIndex1791581000000';
    // CONCURRENTLY cannot run in a transaction; run with no statement_timeout.
    transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_counterparty_inn_digits"`);
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "IDX_counterparty_inn_digits" ON "counterparty" ((regexp_replace(coalesce("inn", ''), '\\D', '', 'g'))) WHERE "isActive" = true`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_counterparty_inn_digits"`);
    }
}
