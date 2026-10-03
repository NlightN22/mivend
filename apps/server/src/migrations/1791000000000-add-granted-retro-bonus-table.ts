import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue #106: @mivend/plugin-retro-bonus's GrantedRetroBonus — append-only ERP credited-bonus feed.
export class AddGrantedRetroBonusTable1791000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "granted_retro_bonus" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceDocumentErpId" character varying NOT NULL, "sourceCounterpartyErpId" character varying NOT NULL, "recipientCounterpartyErpId" character varying NOT NULL, "productErpId" character varying NOT NULL, "discountDocumentErpId" character varying, "operationKind" character varying, "accrualKind" character varying, "percent" double precision NOT NULL, "quantity" double precision NOT NULL, "amount" double precision NOT NULL, "orderErpId" character varying, "sourceVersion" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_db8aedaa6a5e3cbfe241a970ba9" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_0b527ba28449f6a3c1fb9cc5fa" ON "granted_retro_bonus" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7fea1034000c0bafc53454a43b" ON "granted_retro_bonus" ("recipientCounterpartyErpId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_7fea1034000c0bafc53454a43b"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_0b527ba28449f6a3c1fb9cc5fa"`, undefined);
        await queryRunner.query(`DROP TABLE "granted_retro_bonus"`, undefined);
    }
}
