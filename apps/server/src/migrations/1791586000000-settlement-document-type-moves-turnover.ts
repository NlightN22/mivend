import { MigrationInterface, QueryRunner } from 'typeorm';

export class SettlementDocumentTypeMovesTurnover1791586000000 implements MigrationInterface {
    name = 'SettlementDocumentTypeMovesTurnover1791586000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "settlement_document_type" ADD "movesTurnover" boolean NOT NULL DEFAULT false`,
        );
        // The ERP's sales correction (not its debt correction) moves turnover; the name is ERP data.
        await queryRunner.query(
            `UPDATE "settlement_document_type" SET "movesTurnover" = true
             WHERE "category" IN ('sale', 'return')
                OR ("category" = 'correction' AND "documentType" = 'КорректировкаРеализации')`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlement_document_type" DROP COLUMN "movesTurnover"`);
    }
}
