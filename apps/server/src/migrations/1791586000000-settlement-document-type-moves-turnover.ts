import { SALES_CORRECTION_DOCUMENT_TYPE, TURNOVER_CATEGORIES } from '@mivend/plugin-settlement';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SettlementDocumentTypeMovesTurnover1791586000000 implements MigrationInterface {
    name = 'SettlementDocumentTypeMovesTurnover1791586000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "settlement_document_type" ADD "movesTurnover" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(
            `UPDATE "settlement_document_type" SET "movesTurnover" = true
             WHERE "category" = ANY($1) OR ("category" = 'correction' AND "documentType" = $2)`,
            [TURNOVER_CATEGORIES, SALES_CORRECTION_DOCUMENT_TYPE],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlement_document_type" DROP COLUMN "movesTurnover"`);
    }
}
