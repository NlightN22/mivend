import { MigrationInterface, QueryRunner } from 'typeorm';

// Serves the distinct-type walk behind settlementDocumentTypes; built concurrently so ERP ingest is not blocked.
export class SettlementDocumentTypeIndex1791580000000 implements MigrationInterface {
    name = 'SettlementDocumentTypeIndex1791580000000';
    // CONCURRENTLY cannot run in a transaction; run with no statement_timeout.
    transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_settlement_document_type"`);
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "IDX_settlement_document_type" ON "settlement_document" ("documentType")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settlement_document_type"`);
    }
}
