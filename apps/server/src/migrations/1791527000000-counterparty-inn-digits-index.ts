import { MigrationInterface, QueryRunner } from 'typeorm';

export class CounterpartyInnDigitsIndex1791527000000 implements MigrationInterface {
    name = 'CounterpartyInnDigitsIndex1791527000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "IDX_counterparty_inn_digits" ON "counterparty" ((regexp_replace(coalesce("inn", ''), '\\D', '', 'g')))`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_counterparty_inn_digits"`);
    }
}
