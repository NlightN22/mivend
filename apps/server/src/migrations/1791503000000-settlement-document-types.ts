import { MigrationInterface, QueryRunner } from 'typeorm';

export class SettlementDocumentTypes1791503000000 implements MigrationInterface {
    name = 'SettlementDocumentTypes1791503000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "settlement_document_type" (
                "id" SERIAL NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "documentType" character varying NOT NULL,
                "label" character varying NOT NULL,
                "category" character varying NOT NULL,
                "customerVisible" boolean NOT NULL DEFAULT false,
                "sortOrder" integer,
                "isDeleted" boolean NOT NULL DEFAULT false,
                "sourceVersion" character varying NOT NULL,
                CONSTRAINT "PK_settlement_document_type" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settlement_document_type_key"
               ON "settlement_document_type" ("documentType")`,
        );
        await queryRunner.query(
            `ALTER TABLE "contract" ADD COLUMN IF NOT EXISTS "isCustomerContract" boolean`,
        );
        await queryRunner.query(
            `ALTER TABLE "global_settings"
               DROP COLUMN IF EXISTS "customFieldsSettlementcustomercontractkinds",
               DROP COLUMN IF EXISTS "customFieldsSettlementtypecategories"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "contract" DROP COLUMN IF EXISTS "isCustomerContract"`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "settlement_document_type"`);
    }
}
