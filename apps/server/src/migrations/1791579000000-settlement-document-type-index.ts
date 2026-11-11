import { MigrationInterface, QueryRunner } from 'typeorm';

// Serves the distinct-type walk behind settlementDocumentTypes. Plain CREATE INDEX: brief lock on a ~1M-row table.
export class SettlementDocumentTypeIndex1791579000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_settlement_document_type" ON "settlement_document" ("documentType")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settlement_document_type"`);
    }
}
