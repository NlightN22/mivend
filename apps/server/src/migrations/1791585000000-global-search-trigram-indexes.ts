import { MigrationInterface, QueryRunner } from 'typeorm';

// #345: trigram indexes behind the manager global search (ILIKE '%term%' on the searched columns only).
const INDEXES: ReadonlyArray<readonly [name: string, table: string, column: string]> = [
    ['IDX_settlement_document_number_trgm', 'settlement_document', 'number'],
    ['IDX_proforma_invoice_number_trgm', 'proforma_invoice', 'number'],
    ['IDX_order_code_trgm', 'order', 'code'],
    ['IDX_counterparty_short_name_trgm', 'counterparty', 'shortName'],
    ['IDX_counterparty_legal_name_trgm', 'counterparty', 'legalName'],
    ['IDX_counterparty_inn_trgm', 'counterparty', 'inn'],
];

export class GlobalSearchTrigramIndexes1791585000000 implements MigrationInterface {
    name = 'GlobalSearchTrigramIndexes1791585000000';
    // CONCURRENTLY cannot run in a transaction; the settlement document build is the long one.
    transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        for (const [name, table, column] of INDEXES) {
            await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
            await queryRunner.query(
                `CREATE INDEX CONCURRENTLY "${name}" ON "${table}" USING gin ("${column}" gin_trgm_ops)`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const [name] of INDEXES) await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
}
