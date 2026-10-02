import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue #101: GrantedDiscount (@mivend/plugin-price-entry) — shipment-time discount facts.
export class AddGrantedDiscountTable1790945855613 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "granted_discount" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "sourceDocumentId" character varying NOT NULL, "counterpartyErpId" character varying NOT NULL, "productErpId" character varying NOT NULL, "orderEntityId" character varying, "discountDocumentId" character varying, "discountRuleRecipientId" character varying NOT NULL, "condition" character varying, "discountAmount" double precision NOT NULL, "sourceVersion" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_9d25a554a197b670a16095b1658" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f3e8d4dc3c7aa21e1f0d6d4a1b" ON "granted_discount" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_11f79f5d552889bcbe67ef8b4f" ON "granted_discount" ("counterpartyErpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_0a063f730dd22bd23455658a95" ON "granted_discount" ("orderEntityId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_0a063f730dd22bd23455658a95"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_11f79f5d552889bcbe67ef8b4f"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f3e8d4dc3c7aa21e1f0d6d4a1b"`, undefined);
        await queryRunner.query(`DROP TABLE "granted_discount"`, undefined);
    }
}
