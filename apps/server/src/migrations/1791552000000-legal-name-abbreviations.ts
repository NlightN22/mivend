import { MigrationInterface, QueryRunner } from 'typeorm';

// Staff-edited legal-form abbreviations for the payment QR name; seeded at server start, not here.
export class LegalNameAbbreviations1791552000000 implements MigrationInterface {
    name = 'LegalNameAbbreviations1791552000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "documents_legal_name_abbreviation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "phrase" character varying NOT NULL, "abbreviation" character varying NOT NULL, "phraseKey" character varying NOT NULL, CONSTRAINT "PK_documents_legal_name_abbreviation" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_5c3715b1e1962e38643dc9542d" ON "documents_legal_name_abbreviation" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_0da04db1ff89552566c7a98b31" ON "documents_legal_name_abbreviation" ("phraseKey")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "documents_legal_name_abbreviation"`);
    }
}
