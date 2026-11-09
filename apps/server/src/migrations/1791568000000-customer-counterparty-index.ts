import { MigrationInterface, QueryRunner } from 'typeorm';

// Activation checks run a per-counterparty EXISTS on customer; without this index each is a seq scan.
export class CustomerCounterpartyIndex1791568000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_customer_custom_fields_counterpartyid"
               ON "customer" ("customFieldsCounterpartyid")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_custom_fields_counterpartyid"`);
    }
}
