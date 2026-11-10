import { MigrationInterface, QueryRunner } from 'typeorm';

// Filter typeahead: prefix lookups on lower(value) COLLATE "C" (serves LIKE 'x%' and the order) and the
// entry lookup by counterparty ERP id. Plain CREATE INDEX: the tables are small enough to lock briefly.
export class SettlementSuggestIndexes1791576000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_counterparty_short_name_prefix" ON "counterparty" ((lower("shortName") COLLATE "C"))`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_document_number_prefix" ON "settlement_document" ((lower("number") COLLATE "C"))`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_entry_counterparty_erp" ON "settlement_document_entry" ("counterpartyErpId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_counterparty_short_name_prefix"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settlement_document_number_prefix"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settlement_entry_counterparty_erp"`);
    }
}
